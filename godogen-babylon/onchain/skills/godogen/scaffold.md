# Scaffold

The repo is already a Foundry + Vite + viem + Babylon scaffold (published by
godogen). Your job here is to verify the toolchain works and adapt the scaffold
to this game — not to recreate it.

## Verify the toolchain (do this first, once)

```bash
forge build          # contracts compile (the placeholder TicTacToe builds)
forge test            # the scaffold's tests pass
anvil --version       # local devnet is available
node -v               # client toolchain
```

If `forge`/`anvil` are missing, **stop and report** — the on-chain track cannot
run without Foundry.

## Scaffold layout (what's already here)

```
foundry.toml                  Foundry config (solc pinned, gas_reports on)
lib/forge-std/                test/script stdlib (provided by the image)
src/<Game>.sol                the game contract  ← rename + rewrite for this game
test/<Game>.t.sol             Foundry tests       ← rewrite
script/Deploy.s.sol           deploy to anvil     ← update players/types
script/Playthrough.s.sol      full-game assertion ← update to this game's moves
src/main.ts, src/app/App.ts   stable client shell (don't rewrite)
src/game/chain.ts             viem read/write      ← update ABI + calls
src/game/deployment.ts        address + ABI        ← update ABI; address set on deploy
src/game/scene.ts             Babylon render       ← rewrite for this game's board
scripts/capture.mjs           capture (don't edit)
index.html, vite.config.ts    client config (base "./" — keep)
```

## Adapt, don't recreate

- Rename `src/TicTacToe.sol` to the game's name (and the test/script imports).
  If the game *is* tic-tac-toe, keep it as the starting point and extend.
- Keep `foundry.toml`'s pinned solc and `gas_reports`; add the new contract name
  to `gas_reports`.
- Keep the client shell (`src/app/App.ts`, `src/main.ts`, `scripts/capture.mjs`,
  `index.html`) — it satisfies the capture contract (`#game` canvas,
  `window.__WEBGL_INFO__`). Only rewrite `src/game/**`.
- Write `STRUCTURE.md` recording which files you renamed and what each holds.
