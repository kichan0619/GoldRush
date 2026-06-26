---
name: godogen
display_name: Godogen
short_description: Generate or update complete fully on-chain games (Solidity + Babylon.js)
default_prompt: "Use ${GODOGEN_COMMAND} to build or update this fully on-chain game (Solidity contract + Babylon.js client) from a natural-language design brief."
description: |
  Generate or update a complete fully on-chain game from a natural-language description: Solidity contract(s) holding all rules/state/ownership, plus a Babylon.js client that reads chain state and submits moves. Use when the user wants ${AGENT_NAME} to make, rebuild, or substantially extend an on-chain game end to end. The deliverable is held to an evidence standard: compile, property + invariant tests, Slither, gas, and a deployed playthrough must all pass.
---

# On-Chain Game Generator

Generate and update **fully on-chain** games from natural language. The game's
rules, state, turn order and win/lose logic live in a Solidity contract; the
Babylon.js client only reads chain state and submits moves. The client cannot
cheat — the contract validates every transition.

## The one rule that defines this generator: evidence, not assertion

"It compiled" proves nothing. A feature is **done only when an evidence report
passes** (see `eval.md`): compile + property tests + invariants + Slither +
bounded gas + a deployed playthrough that asserts the on-chain final state, plus
a browser screenshot of the client rendering that state. If any check fails, the
work is unfinished — iterate, don't ship.

## Load-bearing constraint

Every move is a transaction; there is no real-time loop. The game **must be
turn-based / discrete-state** (board, grid strategy, cards, on-chain RPG
battles, idle/resource). The 3D client can look rich; the mechanic is turn-based.

## Stage files

Read each from `${GODOGEN_SKILL_DIR}/` **only when you reach that stage** —
don't preload them all.

| File | Purpose | When to read |
|------|---------|--------------|
| `decomposer.md` | Risk-ordered task plan → PLAN.md | Pipeline start |
| `scaffold.md` | Verify Foundry + Vite shell; rename the contract | After decomposition |
| `contract-architecture.md` | On-chain state-machine design (turns, validation, win/draw, gas) | Before writing the contract |
| `contract-generation.md` | Write the Solidity contract | When implementing rules |
| `contract-test.md` | Foundry unit + property + invariant tests | Immediately after each contract change |
| `deploy.md` | anvil + Deploy + Playthrough scripts | After tests pass |
| `client-architecture.md` | viem ↔ Babylon: read state, render, submit moves | After the contract is stable |
| `eval.md` | The evidence report: what to run and the bar to clear | Before declaring any task done |
| `capture.md` | Browser screenshot/video capture | Before screenshots or video |

## Pipeline

```text
User request
  |
  +- PLAN.md exists? (resume check)
  |    +- yes: read PLAN.md, STRUCTURE.md, MEMORY.md -> jump to task execution
  |    +- no:  run the fresh pipeline below
  |
  +- Decompose            -> PLAN.md (rules, risks, evidence criteria, tasks)
  +- Scaffold/verify      -> forge build works, contract renamed, STRUCTURE.md
  +- Contract architecture-> decide state layout, turn model, win/draw, errors
  +- For each rule slice (smallest first):
  |    +- write/extend the contract
  |    +- write tests (unit + property + invariant) and run `forge test`
  |    +- run `slither .` and `forge test --gas-report`
  |    +- fix until the evidence bar (eval.md) is green for that slice
  +- Deploy to anvil + Playthrough script asserts on-chain final state
  +- Build the client (viem reads state, renders, submits moves)
  +- Start Vite dev at 127.0.0.1:5173; screenshot the rendered on-chain board
  +- Produce the evidence report (eval.md) as the deliverable's proof
```

## Execution contract

- The contract is the source of truth. **Never** put rule logic in the client
  that the contract doesn't enforce — that's a cheat vector, not a feature.
- `createScene(engine, canvas) -> { scene, state }` in `src/game/scene.ts` is the
  contract the app and HMR depend on. Keep the signature stable.
- Foundry: `forge build`, `forge test --gas-report`, `forge snapshot`, `anvil`,
  `forge script`. Client: `npm run dev`, `npm run check`, `npm run build`.
- Chrome/Chromium + WebGL2 are required for capture. If missing, **stop and
  report** rather than working around it.

## Context hygiene

Keep state in files, not the conversation:

- `PLAN.md` — task statuses + evidence criteria per task
- `STRUCTURE.md` — contract + client module ownership
- `MEMORY.md` — discoveries, gotchas, what worked or failed
- `EVAL.md` — the latest evidence report (compile/tests/invariants/slither/gas/playthrough)

Update the relevant file after each completed task.
