// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TicTacToe — a fully on-chain, two-player game.
/// @notice Rules, turn order, win/draw detection and ownership all live on
///         chain. The client only renders state and submits moves; it cannot
///         cheat because every transition is validated here.
contract TicTacToe {
    /// Cell / player marks. 0 = empty, 1 = X (player1), 2 = O (player2).
    enum Mark {
        None,
        X,
        O
    }

    enum Status {
        WaitingForPlayers,
        InProgress,
        XWon,
        OWon,
        Draw
    }

    address public player1; // plays X, moves first
    address public player2; // plays O

    /// Flat 3x3 board, index = row*3 + col.
    Mark[9] public board;

    Status public status;
    /// Whose turn: Mark.X or Mark.O while InProgress.
    Mark public turn;
    uint8 public moveCount;

    event PlayerJoined(address indexed player, Mark mark);
    event MovePlayed(address indexed player, uint8 cell, Mark mark);
    event GameOver(Status result);

    error NotAPlayer();
    error NotYourTurn();
    error GameNotInProgress();
    error CellTaken();
    error BadCell();
    error AlreadyJoined();
    error GameFull();

    /// @param _player1 X; @param _player2 O. Passing both starts the game
    ///        immediately (the common case for a generated, ready-to-play demo).
    ///        Pass address(0) for player2 to allow an open join via join().
    constructor(address _player1, address _player2) {
        require(_player1 != address(0), "player1 required");
        player1 = _player1;
        player2 = _player2;
        turn = Mark.X;
        status = _player2 == address(0) ? Status.WaitingForPlayers : Status.InProgress;
        emit PlayerJoined(_player1, Mark.X);
        if (_player2 != address(0)) emit PlayerJoined(_player2, Mark.O);
    }

    /// Open join for the O seat when the game was created with an empty player2.
    function join() external {
        if (status != Status.WaitingForPlayers) revert GameFull();
        if (msg.sender == player1) revert AlreadyJoined();
        player2 = msg.sender;
        status = Status.InProgress;
        emit PlayerJoined(msg.sender, Mark.O);
    }

    /// Play `cell` (0..8) as the calling player. Validates everything on chain.
    function move(uint8 cell) external {
        if (status != Status.InProgress) revert GameNotInProgress();
        if (cell > 8) revert BadCell();

        Mark mine = _markOf(msg.sender);
        if (mine == Mark.None) revert NotAPlayer();
        if (mine != turn) revert NotYourTurn();
        if (board[cell] != Mark.None) revert CellTaken();

        board[cell] = mine;
        unchecked {
            moveCount++;
        }
        emit MovePlayed(msg.sender, cell, mine);

        if (_wins(mine)) {
            status = mine == Mark.X ? Status.XWon : Status.OWon;
            emit GameOver(status);
        } else if (moveCount == 9) {
            status = Status.Draw;
            emit GameOver(status);
        } else {
            turn = mine == Mark.X ? Mark.O : Mark.X;
        }
    }

    /// Full board snapshot for the client (cheap single read).
    function getBoard() external view returns (Mark[9] memory) {
        return board;
    }

    function _markOf(address who) internal view returns (Mark) {
        if (who == player1) return Mark.X;
        if (who == player2) return Mark.O;
        return Mark.None;
    }

    /// Check the 8 winning lines for `mark`. Fixed, bounded work — cheap gas.
    function _wins(Mark mark) internal view returns (bool) {
        uint8[3][8] memory lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6]
        ];
        for (uint256 i = 0; i < 8; i++) {
            if (
                board[lines[i][0]] == mark &&
                board[lines[i][1]] == mark &&
                board[lines[i][2]] == mark
            ) {
                return true;
            }
        }
        return false;
    }
}
