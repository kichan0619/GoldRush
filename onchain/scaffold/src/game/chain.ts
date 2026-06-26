import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  CONTRACT_ADDRESS,
  PLAYER_O_KEY,
  PLAYER_X_KEY,
  RPC_URL,
  TICTACTOE_ABI,
} from "./deployment";

/// On-chain board snapshot the renderer consumes. cells: 9 entries, 0=empty,
/// 1=X, 2=O. status/turn mirror the contract enums.
export interface BoardState {
  cells: number[];
  status: number;
  turn: number;
  player1: Address;
  player2: Address;
}

/// Thin wrapper over viem: reads board state from anvil and submits moves as
/// the correct player. The client cannot cheat — the contract validates every
/// move. We sign locally with anvil's deterministic dev keys (no real funds).
export class Chain {
  readonly address: Address;
  private readonly pub: PublicClient;
  private readonly walletX: WalletClient;
  private readonly walletO: WalletClient;

  constructor(address: Address = CONTRACT_ADDRESS as Address) {
    this.address = address;
    this.pub = createPublicClient({ chain: foundry, transport: http(RPC_URL) });
    this.walletX = createWalletClient({
      account: privateKeyToAccount(PLAYER_X_KEY),
      chain: foundry,
      transport: http(RPC_URL),
    });
    this.walletO = createWalletClient({
      account: privateKeyToAccount(PLAYER_O_KEY),
      chain: foundry,
      transport: http(RPC_URL),
    });
  }

  get deployed(): boolean {
    return (
      this.address.toLowerCase() !== "0x0000000000000000000000000000000000000000"
    );
  }

  async read(): Promise<BoardState> {
    const [cells, status, turn, player1, player2] = await Promise.all([
      this.pub.readContract({ address: this.address, abi: TICTACTOE_ABI, functionName: "getBoard" }),
      this.pub.readContract({ address: this.address, abi: TICTACTOE_ABI, functionName: "status" }),
      this.pub.readContract({ address: this.address, abi: TICTACTOE_ABI, functionName: "turn" }),
      this.pub.readContract({ address: this.address, abi: TICTACTOE_ABI, functionName: "player1" }),
      this.pub.readContract({ address: this.address, abi: TICTACTOE_ABI, functionName: "player2" }),
    ]);
    return {
      cells: (cells as readonly number[]).map((c) => Number(c)),
      status: Number(status),
      turn: Number(turn),
      player1: player1 as Address,
      player2: player2 as Address,
    };
  }

  /// Submit a move for the side whose turn it is (1=X, 2=O). Waits for the tx
  /// to be mined so the next read reflects it.
  async move(cell: number, side: number): Promise<void> {
    const wallet = side === 1 ? this.walletX : this.walletO;
    const account = wallet.account;
    if (!account) throw new Error("no signing account");
    const hash = await wallet.writeContract({
      account,
      chain: foundry,
      address: this.address,
      abi: TICTACTOE_ABI,
      functionName: "move",
      args: [cell],
    });
    await this.pub.waitForTransactionReceipt({ hash });
  }
}
