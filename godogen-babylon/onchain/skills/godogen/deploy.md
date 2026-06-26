# Deploy + Playthrough

Once tests pass, prove the game runs on a live chain: deploy to anvil and play a
full game as signed transactions, asserting the on-chain final state. This is the
strongest "it really works" evidence.

## Local devnet

```bash
anvil --host 127.0.0.1 --port 8545 &     # chainId 31337, 10 funded dev accounts
```

anvil's deterministic accounts (no real funds — safe to hardcode):
- #0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- #1 `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` key `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

## Deploy.s.sol

Deploys the game with the two dev accounts as players so the client and
playthrough have known keys. Print the deployed address.

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Write the deployed address into `src/game/deployment.ts` (`CONTRACT_ADDRESS`) so
the client connects to it.

## Playthrough.s.sol

Deploys a fresh game, then plays a complete game by broadcasting each move from
the correct player key, and **asserts the on-chain final state** with `require`:

```solidity
_move(game, PK_P1, /*...*/);   // alternate players to a known win
// ...
require(game.status() == Game.Status.P1Won, "playthrough: expected P1 to win");
console2.log("PLAYTHROUGH_OK");
```

```bash
forge script script/Playthrough.s.sol:Playthrough \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

A successful run printing `PLAYTHROUGH_OK` and `ONCHAIN EXECUTION COMPLETE &
SUCCESSFUL` is the deployment evidence. You can also drive moves ad hoc with
`cast send <addr> "move(uint8)" 0 --private-key <key>` and read with
`cast call <addr> "getBoard()"`.
