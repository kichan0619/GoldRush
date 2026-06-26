# Client Architecture

The client is a thin renderer over chain state. It reads the contract and submits
moves — it holds no authoritative game logic. Build it only after the contract is
stable and tested.

## The contract the app depends on (keep stable)

`src/game/scene.ts` must export:

```ts
export function createScene(engine: Engine, canvas: HTMLCanvasElement)
  : { scene: Scene; state: { update?: (dt: number) => void } }
```

`src/app/App.ts` owns the engine + render loop and calls `state.update(dt)` each
frame. Don't rewrite the app shell; it satisfies the capture contract (`#game`
canvas + `window.__WEBGL_INFO__`).

## Chain access (viem) — `src/game/chain.ts`

- `createPublicClient({ chain: foundry, transport: http("http://127.0.0.1:8545") })`
  for reads; `createWalletClient` with `privateKeyToAccount(devKey)` for writes.
- Expose `read(): Promise<BoardState>` (calls `getBoard`/`status`/`turn`/players)
  and `move(args, side)` that signs with the correct player key and
  `waitForTransactionReceipt`.
- Update the ABI in `src/game/deployment.ts` to match the contract; the deploy
  step fills `CONTRACT_ADDRESS`.

## Rendering — `src/game/scene.ts`

- Build the board/world from Babylon primitives (`MeshBuilder`), flat-shaded
  materials, an `ArcRotateCamera`, a light.
- **Read chain state once on load**, then poll (~1s) in `state.update`; re-render
  only when the snapshot changes (diff a cheap key like `cells.join()+status`).
- On click of an empty cell: read state, if it's that side's turn and the cell is
  free, submit a `move` tx; the next poll reflects it. Guard with a `busy` flag.
- Show status/turn in a DOM HUD overlay (no Babylon GUI package needed).

## Rules

- The chain is the source of truth. If the client and chain disagree, the chain
  wins — never "fix" a discrepancy by trusting local state.
- Never embed rule logic the contract doesn't enforce.
- `npm run check` (tsc) must pass; `npm run build` before final capture.
