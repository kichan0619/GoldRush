# Contract Tests

Tests are the spec and the evidence. Write them immediately after each contract
change — never let untested contract code pile up.

## Three layers

1. **Unit tests** — concrete sequences with known outcomes:
   - a full game where player 1 wins; assert terminal status
   - a full game that draws; assert `Draw`
   - the initial state (status InProgress, correct first turn)

2. **Revert / guard tests** — every validation path, asserting the exact error:
   ```solidity
   vm.prank(notAPlayer);
   vm.expectRevert(Game.NotAPlayer.selector);
   game.move(0);
   ```
   Cover: not-a-player, not-your-turn, illegal/out-of-range move, move after the
   game is over.

3. **Invariant / fuzz tests** — properties that must hold across ANY sequence:
   - a finished game never changes (once terminal, status is stable)
   - no player ever moves out of turn
   - the move count never exceeds capacity
   - total marks on the board equals the number of successful moves

   Use Foundry's invariant testing (a handler that submits random legal/illegal
   moves) or `forge test` with fuzzed inputs (`function testFuzz_...(uint8 cell)`).

## Running

```bash
forge test -vvv            # all tests with traces on failure
forge test --gas-report    # tests + per-function gas (for the evidence report)
forge snapshot             # write .gas-snapshot baseline
```

## Bar

- 100% of the tests you wrote pass.
- Every guard has a test that asserts its specific custom error.
- At least the core invariants above exist and pass.
- If a test fails, fix the **contract** (or the test if it encoded the rule
  wrong) — never delete a failing test to go green.
