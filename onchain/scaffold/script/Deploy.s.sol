// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TicTacToe} from "../src/TicTacToe.sol";

/// Deploys TicTacToe with anvil's first two deterministic dev accounts as the
/// two players, so the client (and the Playthrough script) can drive a full
/// game with known keys. Prints the address for the client to pick up.
contract Deploy is Script {
    // anvil default account #0 and #1 addresses (deterministic mnemonic).
    address constant PLAYER1 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // X
    address constant PLAYER2 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // O

    function run() external returns (TicTacToe game) {
        vm.startBroadcast();
        game = new TicTacToe(PLAYER1, PLAYER2);
        vm.stopBroadcast();
        console2.log("TicTacToe deployed at:", address(game));
        console2.log("player1 (X):", PLAYER1);
        console2.log("player2 (O):", PLAYER2);
    }
}
