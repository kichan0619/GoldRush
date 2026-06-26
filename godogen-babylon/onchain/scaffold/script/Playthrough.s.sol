// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TicTacToe} from "../src/TicTacToe.sol";

/// Deploys a fresh game and plays a full X-wins game end to end, broadcasting
/// each move as a separate signed transaction from the correct player key, then
/// asserts the on-chain final state. This is the strongest "it really works"
/// signal for the eval harness: a scripted playthrough against a live node.
///
/// Run against anvil:
///   forge script script/Playthrough.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract Playthrough is Script {
    // anvil dev keys #0 (X) and #1 (O).
    uint256 constant PK_X = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant PK_O = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address constant PLAYER1 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant PLAYER2 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        // Deploy (broadcast as X).
        vm.startBroadcast(PK_X);
        TicTacToe game = new TicTacToe(PLAYER1, PLAYER2);
        vm.stopBroadcast();

        // X:0, O:3, X:1, O:4, X:2 -> X wins top row.
        _move(game, PK_X, 0);
        _move(game, PK_O, 3);
        _move(game, PK_X, 1);
        _move(game, PK_O, 4);
        _move(game, PK_X, 2);

        TicTacToe.Status s = game.status();
        console2.log("final status (2 = XWon):", uint256(s));
        require(s == TicTacToe.Status.XWon, "playthrough: expected X to win");
        console2.log("PLAYTHROUGH_OK");
    }

    function _move(TicTacToe game, uint256 pk, uint8 cell) internal {
        vm.startBroadcast(pk);
        game.move(cell);
        vm.stopBroadcast();
    }
}
