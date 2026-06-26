// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TicTacToe} from "../src/TicTacToe.sol";

contract TicTacToeTest is Test {
    TicTacToe internal game;
    address internal alice = address(0xA11CE); // X
    address internal bob = address(0xB0B); // O

    function setUp() public {
        game = new TicTacToe(alice, bob);
    }

    function test_StartsInProgressWithXToMove() public view {
        assertEq(uint256(game.status()), uint256(TicTacToe.Status.InProgress));
        assertEq(uint256(game.turn()), uint256(TicTacToe.Mark.X));
    }

    function test_XWinsTopRow() public {
        vm.prank(alice);
        game.move(0); // X
        vm.prank(bob);
        game.move(3); // O
        vm.prank(alice);
        game.move(1); // X
        vm.prank(bob);
        game.move(4); // O
        vm.prank(alice);
        game.move(2); // X completes top row 0,1,2
        assertEq(uint256(game.status()), uint256(TicTacToe.Status.XWon));
    }

    function test_RevertWhenNotYourTurn() public {
        vm.prank(bob); // O tries to move first
        vm.expectRevert(TicTacToe.NotYourTurn.selector);
        game.move(0);
    }

    function test_RevertWhenCellTaken() public {
        vm.prank(alice);
        game.move(0);
        vm.prank(bob);
        vm.expectRevert(TicTacToe.CellTaken.selector);
        game.move(0);
    }

    function test_RevertWhenNotAPlayer() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(TicTacToe.NotAPlayer.selector);
        game.move(0);
    }

    function test_RevertOnBadCell() public {
        vm.prank(alice);
        vm.expectRevert(TicTacToe.BadCell.selector);
        game.move(9);
    }

    function test_DrawFillsBoardWithNoWinner() public {
        // A known draw sequence.
        // X O X
        // X O O
        // O X X
        uint8[9] memory order = [0, 1, 2, 4, 3, 5, 7, 6, 8];
        // marks alternate X,O,X,... by turn; the above cells produce no 3-in-a-row.
        address[2] memory players = [alice, bob];
        for (uint256 i = 0; i < 9; i++) {
            vm.prank(players[i % 2]);
            game.move(order[i]);
        }
        assertEq(uint256(game.status()), uint256(TicTacToe.Status.Draw));
    }

    function test_NoMovesAfterGameOver() public {
        vm.prank(alice);
        game.move(0);
        vm.prank(bob);
        game.move(3);
        vm.prank(alice);
        game.move(1);
        vm.prank(bob);
        game.move(4);
        vm.prank(alice);
        game.move(2); // X wins
        vm.prank(bob);
        vm.expectRevert(TicTacToe.GameNotInProgress.selector);
        game.move(5);
    }
}
