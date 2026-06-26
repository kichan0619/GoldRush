// Deployment metadata for the client. The address is filled in by the deploy
// step (forge script Deploy --broadcast) — the pipeline rewrites the line below
// with the freshly deployed address. The ABI mirrors src/TicTacToe.sol.
//
// Until a deploy runs, address is the zero address and the client shows
// "waiting for deployment".
export const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// anvil default RPC + deterministic dev accounts (no real funds).
export const RPC_URL = "http://127.0.0.1:8545" as const;
export const PLAYER_X_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const; // account #0
export const PLAYER_O_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // account #1

export const TICTACTOE_ABI = [
  { type: "function", name: "getBoard", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[9]" }] },
  { type: "function", name: "status", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "turn", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "player1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "player2", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "move", stateMutability: "nonpayable", inputs: [{ name: "cell", type: "uint8" }], outputs: [] },
  { type: "function", name: "join", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

/** Status enum mirror (see TicTacToe.Status). */
export const STATUS_LABEL = [
  "Waiting for players",
  "In progress",
  "X won",
  "O won",
  "Draw",
] as const;
