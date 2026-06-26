# On-Chain Game (built with godogen)

This repo is a **fully on-chain** game built and maintained by ${AGENT_NAME}
through the **godogen** skill pipeline. The game's rules, state, turn order,
and win/lose logic live in a **Solidity smart contract**; the Babylon.js client
only *reads* chain state and *submits* moves. The client cannot cheat — every
transition is validated on chain.

## Load-bearing constraint

Every move is a transaction. There is no real-time loop, no physics tick. So the
game **must be turn-based / discrete-state** (board games, grid strategy, card
games, on-chain RPG battles, idle/resource games). The 3D client can look rich,
but the mechanic is turn-based.

## How to work in this repo

```
${GODOGEN_COMMAND}  <describe the on-chain game or change you want>
```

The skill reads its pipeline stages on demand from `.claude/skills/godogen/`.

## Evidence over assertion — this is the whole point

A clean `forge build` is necessary but **not** sufficient, and "the contract
compiled" proves nothing about whether the game is correct, safe, or affordable.
This project's standard is an automatically produced **evidence report**. A
feature is done only when ALL of these hold:

1. **Compiles** — `forge build` exits clean.
2. **Property tests pass** — `forge test` covers win/draw/illegal-move/turn-order
   /access-control/post-game guards. Write the tests; don't hand-wave.
3. **Invariants hold** — fuzz/invariant tests for "no player moves out of turn",
   "a finished game never changes", "only valid cells", etc.
4. **No high/medium Slither findings** — `slither .` clean of reentrancy,
   unchecked calls, missing access checks (informational is OK, justify it).
5. **Gas is bounded** — `forge test --gas-report`; no unbounded loops over
   players/cells; per-move gas stays reasonable.
6. **It really plays** — deploy to local `anvil`, run a scripted playthrough
   (`forge script`) that plays a full game as signed txs and asserts the
   on-chain final state, then a browser screenshot that shows the client
   rendering that state.

If any of these fails, the work is unfinished — iterate, don't ship.

## Project shape

- `src/*.sol` — the game contract(s). **This is the heart of the game.**
- `test/*.t.sol` — Foundry tests: unit + property + invariant. Treat as the spec.
- `script/Deploy.s.sol` — deploy to anvil with the dev accounts as players.
- `script/Playthrough.s.sol` — play a full game end to end, assert final state.
- `src/game/chain.ts` — viem: read board/status/turn, submit moves to anvil.
- `src/game/scene.ts` — `createScene(engine, canvas) -> { scene, state }`;
  renders the on-chain board, polls for updates, sends a move tx on click.
- `src/app/App.ts` — stable engine/render-loop layer (don't rewrite per game).
- `scripts/capture.mjs` — browser screenshot/video capture.

## Commands

```bash
forge build                     # compile contracts
forge test --gas-report         # tests + per-function gas
forge snapshot                  # gas regression baseline
slither .                       # static security analysis
anvil --host 127.0.0.1 --port 8545 &          # local devnet
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil-key>
forge script script/Playthrough.s.sol:Playthrough --rpc-url http://127.0.0.1:8545 --broadcast
npm install && npm run dev      # client at http://127.0.0.1:5173
node scripts/capture.mjs still screenshots/{task}/still.png
```

## Working rules

- **The chain is the source of truth.** Never put game logic in the client that
  the contract doesn't enforce — that's a cheat vector, not a feature.
- **Validate everything on chain**: caller is a player, it's their turn, the
  move is legal, the game is live. Revert with named errors.
- Keep per-move state minimal and gas bounded (pack structs, no unbounded loops).
- No floating point; no naked randomness (use commit-reveal or a VRF).
- All keys here are anvil's public deterministic dev keys — no real funds, ever.
- Chrome/Chromium + WebGL2 are required for capture. If missing, report it.
- Keep state in `PLAN.md`, `STRUCTURE.md`, `MEMORY.md`.
