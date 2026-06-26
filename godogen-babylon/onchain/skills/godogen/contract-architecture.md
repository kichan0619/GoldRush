# Contract Architecture

How to design a correct, safe, gas-bounded on-chain game contract. Read before
writing Solidity.

## State machine first

Model the game as an explicit state machine:

- A `Status` enum with a clear lifecycle and terminal states (e.g.
  `WaitingForPlayers → InProgress → {XWon, OWon, Draw}`). Terminal states accept
  no further moves.
- Whose-turn tracking (an enum or player index). Flip it only on a successful,
  non-terminal move.
- The board/world as the smallest fixed structure that fits (fixed-size arrays,
  packed structs). Avoid dynamic arrays you must loop over unbounded.

## Validate every transition (this is the anti-cheat)

A move function must revert unless ALL hold, each with a named custom error:

- `status == InProgress` (game live) — else `GameNotInProgress`
- caller is a player — else `NotAPlayer`
- it's the caller's turn — else `NotYourTurn`
- the target cell/move is in range and legal — else `BadCell` / `CellTaken`

Named errors (`error NotYourTurn();`) are cheaper than `require` strings and make
tests precise (`vm.expectRevert(Game.NotYourTurn.selector)`).

## Win/draw detection

- Compute win against a fixed set of lines/conditions — bounded work, no
  unbounded loops over players.
- Detect draw by a move counter reaching capacity with no winner.
- Set the terminal status and emit a `GameOver(result)` event the moment it's
  decided; stop flipping the turn.

## Events for the client

Emit on each meaningful change: `PlayerJoined`, `MovePlayed(player, cell, mark)`,
`GameOver(status)`. The client can render from a single `getBoard()` read; events
are for responsiveness and for the playthrough/eval to assert against.

## Gas discipline

- No unbounded loops (over players, cells, history).
- Pack state; use the smallest int types that fit; `unchecked { ++x; }` for
  counters that cannot overflow in context.
- A simple per-move gas target: keep it well under ~80k. Measure with
  `forge test --gas-report`.

## Hazards to avoid

- No floating point (Solidity has none) — use integers/fixed-point.
- No naked `block.timestamp`/`blockhash` randomness for anything adversarial —
  use commit-reveal or a VRF. For a deterministic 2-player game, avoid randomness
  entirely.
- No `tx.origin` for auth — use `msg.sender`.
- Reentrancy isn't a concern for pure state games with no external calls/value,
  but if you add ETH/transfers, apply checks-effects-interactions.
