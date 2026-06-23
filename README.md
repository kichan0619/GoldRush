# godogen-babylon

Autonomous **Babylon.js** browser-game development with **Claude Code**.

Describe a game in natural language. The agent plans it, scaffolds a Vite +
Babylon.js project, (optionally) generates art assets, runs the game in a real
browser, captures screenshots, and fixes what looks wrong — judging progress
from frames, not from "the code compiled".

This repo is **not a game**. It is the source for a generator that produces
game repos: **godogen-babylon → game repo → game**. You publish the skills into
a fresh game repo, then run the agent inside that repo to build the actual game.

> Modeled on [htdt/godogen](https://github.com/htdt/godogen). This is a focused
> re-implementation scoped to one engine (Babylon.js) and one host agent
> (Claude Code). All API keys are placeholders you fill in yourself — see
> [`.env.example`](.env.example).

## Source layout

```
publish.sh                     generator entrypoint (Babylon + Claude)
scripts/publish/               render_dir.py + frontmatter/stop-hook helpers
shared/skills/godogen/         engine-agnostic pipeline stages + asset tooling
shared/hooks/                  optional Telegram stop hook
babylon/skills/godogen/        Babylon-specific pipeline stages (SKILL.md entry)
babylon/skills/babylon-help/   Babylon/Vite/browser API lookup skill
babylon/hooks/                 capture_result.sh (final video bundle)
babylon/scaffold/              the Vite + Babylon project shell copied into games
babylon/game-engine.md         rendered into the game repo's CLAUDE.md
```

## What it does

- **Babylon.js output** — TypeScript/Vite browser games with hot reload and
  Chrome/Chromium WebGL2 screenshot + video capture.
- **Frame-grounded self-repair** — the agent is prompted to judge progress from
  captured screenshots, so visible defects (clipping, wrong scale, frozen
  motion, missing assets) drive the next iteration.
- **Optional AI asset generation** — Gemini for precise references/characters,
  Grok for textures/simple objects and video, Tripo3D for image-to-3D. Runs
  without keys by falling back to procedural stand-ins.
- **Context-hygiene files** — `PLAN.md`, `STRUCTURE.md`, `MEMORY.md`,
  `ASSETS.md` keep state out of the conversation so long runs stay coherent.

## Prerequisites

- Node.js 22.12+ and npm
- Google Chrome or Chromium with hardware WebGL2 (for browser capture)
- Python 3 (for the publish helpers and asset tooling)
- Claude Code
- (Optional) API keys for asset generation — see [`.env.example`](.env.example)

## Publish a game repo

```bash
./publish.sh --agent claude --out ~/my-game
# or positional:
./publish.sh ~/my-game
```

This writes into `~/my-game`:

- `CLAUDE.md` — the game-repo manifest (points the agent at `/godogen`)
- `.claude/skills/godogen/` + `.claude/skills/babylon-help/`
- `.claude/hooks/capture_result.sh`
- the Babylon Vite scaffold (`package.json`, `src/`, `scripts/capture.mjs`, …)

Flags:

- `--force` — wipe the target before publishing (use when re-publishing).
- `--video_hook` — also install the optional Telegram Stop hook (off by
  default; no-ops unless `tg-push` and `TG_*` env vars are configured).

Re-running over an existing game repo updates the skills/manifest/hooks but
skips the scaffold if a `package.json` already exists (update mode).

## Build a game

```bash
cd ~/my-game
npm install
npm run setup            # optional: interactively enter asset-gen API keys
```

`npm run setup` prompts for each key (press Enter to skip) and writes `.env`.
You can also `cp .env.example .env` and edit by hand. All keys are optional —
without them the pipeline falls back to procedural assets.

Then open the repo in Claude Code and run:

```
/godogen  build a small low-poly kart racer with 3 laps and a lap timer
```

The agent reads the pipeline stages on demand and iterates against the live
browser at `http://127.0.0.1:5173`.

## Improving the skills

After a full generation session, ask the agent to review the run:

> Analyze this session. Were the instructions optimal? Flag anything that was
> too obvious, missing, or misleading. Did any tool pollute context with noise?
> Did the capture loop catch the real problems?

See [setup.md](setup.md) for full workstation setup.
