# Evidence Report — the bar every deliverable must clear

This is the point of the whole generator: **"it compiled" proves nothing.** A
generated on-chain game is only done when it produces a passing evidence report.
Generating code is cheap; proving the code is correct, safe, and affordable is
the hard, valuable part — so make the proof the deliverable.

Produce `EVAL.md` in the game repo with the six checks below. Run them, paste the
real numbers, and mark PASS/FAIL. If anything fails, the game is unfinished —
iterate, don't ship.

## The six checks

1. **Compiles**
   ```bash
   forge build
   ```
   PASS = exit 0, no errors.

2. **Property tests pass**
   ```bash
   forge test
   ```
   PASS = every test green. Record `N passed; 0 failed`. Tests must cover
   win/draw/illegal-move/turn-order/access/post-game (see `contract-test.md`).

3. **Invariants hold**
   The invariant/fuzz tests (finished-game-immutable, no-out-of-turn,
   move-count-bounded, marks==moves) pass under `forge test`. Record the runs.

4. **Static security — Slither**
   ```bash
   slither . --json - 2>/dev/null | <summarize> || slither .
   ```
   PASS = **no High or Medium findings**. List any Low/Informational and a
   one-line justification. (Reentrancy, unchecked calls, missing access control,
   tx.origin, etc.) If Slither is unavailable, say so explicitly — don't silently
   skip it.

5. **Gas is bounded**
   ```bash
   forge test --gas-report
   forge snapshot
   ```
   Record per-function gas (esp. the move function) and the deployment cost.
   PASS = no unbounded loops; per-move gas under the target set in PLAN.md
   (default ≈ 80k).

6. **Deployed playthrough**
   anvil + `Deploy` + `Playthrough` (see `deploy.md`) runs a full game as signed
   txs and asserts the on-chain final state; the client renders that state in a
   browser screenshot.
   PASS = `PLAYTHROUGH_OK` + a screenshot showing the rendered board.

## EVAL.md format

```markdown
# Evidence Report — <Game>

| Check | Result | Evidence |
|-------|--------|----------|
| Compile        | PASS | forge build clean |
| Property tests | PASS | 12 passed; 0 failed |
| Invariants     | PASS | 4 invariants, 256 runs each |
| Slither        | PASS | 0 high, 0 medium; 2 informational (justified) |
| Gas            | PASS | move avg 42k / max 59k; deploy 675k |
| Playthrough    | PASS | PLAYTHROUGH_OK; screenshots/result/1/still.png |

## Notes
<anything that needed a judgment call>
```

This report is the artifact that makes the project credible. Treat a missing or
red check as a bug to fix, not a footnote.
