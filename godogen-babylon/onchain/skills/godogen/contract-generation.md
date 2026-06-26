# Contract Generation

Write the Solidity contract for the game. Follow the architecture decisions from
`contract-architecture.md`.

## Conventions

- `// SPDX-License-Identifier: MIT` and `pragma solidity ^0.8.24;` at the top
  (matches the pinned solc in `foundry.toml`).
- Solidity ^0.8 has built-in overflow checks; use `unchecked` only where you've
  reasoned it's safe (bounded counters).
- Public view getters for everything the client renders: a single
  `getBoard()`-style snapshot plus `status()`, `turn()`, player addresses.
- Custom errors, not `require` strings. Events on every meaningful state change.

## A reference shape (adapt to the actual game)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Game {
    enum Status { WaitingForPlayers, InProgress, P1Won, P2Won, Draw }

    address public player1;
    address public player2;
    Status public status;
    uint8 public turn;       // 1 = player1, 2 = player2
    // ... minimal board/world state ...

    event MovePlayed(address indexed player, /* move args */);
    event GameOver(Status result);

    error NotAPlayer();
    error NotYourTurn();
    error GameNotInProgress();
    error IllegalMove();

    constructor(address p1, address p2) {
        require(p1 != address(0), "player1 required");
        player1 = p1; player2 = p2;
        turn = 1;
        status = p2 == address(0) ? Status.WaitingForPlayers : Status.InProgress;
    }

    function move(/* args */) external {
        if (status != Status.InProgress) revert GameNotInProgress();
        uint8 me = _seat(msg.sender);          // reverts NotAPlayer if not a seat
        if (me != turn) revert NotYourTurn();
        // validate legality -> revert IllegalMove() if bad
        // apply state change
        emit MovePlayed(msg.sender /*, args */);
        if (_isWin(me)) { status = me == 1 ? Status.P1Won : Status.P2Won; emit GameOver(status); }
        else if (_isDraw()) { status = Status.Draw; emit GameOver(status); }
        else { turn = me == 1 ? 2 : 1; }
    }

    // view getters for the client; internal _seat/_isWin/_isDraw helpers
}
```

## After writing

Run `forge build` immediately. Fix compile errors before moving on. Then go
straight to `contract-test.md` — do not accumulate untested contract code.
