# Stage: Capture

**When:** before taking screenshots or recording video.

The on-chain client renders **chain state**, so capture has one extra
precondition versus a plain browser game: the chain must be live and the
contract deployed, or the board renders empty / "chain unreachable".

## Preconditions (on-chain specific)

1. `anvil` is running at `http://127.0.0.1:8545`.
2. The game contract is deployed and its address is in
   `src/game/deployment.ts` (`CONTRACT_ADDRESS`). Run `Deploy.s.sol` if not.
3. The Vite dev server is up at `http://127.0.0.1:5173` (`npm run dev`).

To capture a board with *moves* on it (more convincing than an empty board),
play a few moves first via the `Playthrough` script or `cast send`, then capture.

## Requirements

Chrome or Chromium with WebGL2 (hardware GPU preferred). The capture script reads
the live WebGL2 renderer and logs `[capture] WARNING` on a software renderer —
capture still completes. If Chrome/Chromium or WebGL2 is missing entirely,
**report it** rather than improvising. Set `CHROME_BIN` if Chrome is in an
uncommon path.

## Ad hoc screenshot (cheap — use often)

```bash
node scripts/capture.mjs still screenshots/{task}/still.png
```

## Browser video (final proof)

```bash
node scripts/capture.mjs video screenshots/result/{N} 20
# or the hook (records + transcodes to mp4):
bash .claude/hooks/capture_result.sh screenshots/result/{N}
```

## Validation standard

- `npm run check` and `npm run build` pass; Vite responds at `:5173`.
- anvil is up and the contract is deployed (else the board is empty by design).
- `still` writes a real PNG showing the board reflecting on-chain state.
- The strongest proof pairs the screenshot with the `Playthrough` assertion
  (`PLAYTHROUGH_OK`): the same final state is both asserted on chain and visible
  in the rendered frame.
