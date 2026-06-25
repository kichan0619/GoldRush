# GoldRush Studio

**Type a sentence. Get a playable Babylon.js game in your browser.**

GoldRush Studio is a self-hosted, **bring-your-own-key** web platform that turns
a natural-language prompt into a real, playable 3D browser game. You describe the
game; it plans, writes, builds, and visually self-corrects the game inside a
sandboxed container, then hands you back something you can play and share — no
game-dev or coding required.

Under the hood it pairs two pieces:

| Directory | What it is |
| --- | --- |
| [`godoplat/`](godoplat) | **GoldRush Studio** — the web platform. Prompt in a browser → queued job → headless generation in a Docker sandbox → playable game served back at `/play/<id>/`, with a gallery and share links. Bring-your-own-key, memory-only. |
| [`godogen-babylon/`](godogen-babylon) | **The generation engine** — the Claude Code skill set + Vite/Babylon.js scaffold that actually builds each game. Usable on its own in Claude Code; built on [htdt/godogen](https://github.com/htdt/godogen) (MIT). |

Want the hosted, one-prompt-to-playable-game experience? Use `godoplat/`. Just
want the CLI generator? Use `godogen-babylon/` on its own.

## Demo

> **Add real captures here.** Every generation job already produces them
> automatically (the capture step writes a screenshot + video). After your first
> successful run, drop two files into [`docs/`](docs/) and they'll render below:
>
> - `docs/demo-pipeline.png` — the Studio UI mid-run (prompt + live pipeline)
> - `docs/demo-game.gif` — a finished game playing in the browser
>
> Then replace this callout with:
> `![Studio](docs/demo-pipeline.png)` and `![Game](docs/demo-game.gif)`.

> _Suggested first prompt:_ `a small low-poly kart racer with 3 laps and a lap timer`

## Bring Your Own Key (BYOK)

GoldRush Studio never ships or stores an Anthropic key. **Each user enters their
own key in the web UI**, per generation. The key is held in memory only for the
life of that job, passed to the sandbox container as an env var, then dropped —
never written to the database, to disk, or to logs, and never baked into the
generated game. See [`godoplat/README.md`](godoplat/README.md#security).

## Quickstart (the web platform)

```bash
# Build the job sandbox image from the REPO ROOT (it needs both subdirs).
docker build -f godoplat/docker/Dockerfile.job -t godoplat-job:latest .

# Build + run the platform.
cd godoplat
npm install
npm run build:all
npm start            # http://localhost:8080
```

Open the page, paste your Anthropic key, describe a game, and submit. The
finished game is served at `/play/<id>/`.

Full prerequisites, configuration, scripts, and the security model are in
[`godoplat/README.md`](godoplat/README.md). For the generator internals and how
the autonomous build loop works, see
[`godogen-babylon/README.md`](godogen-babylon/README.md).

## Layout

```
.
├── godogen-babylon/   the generator (skills, scaffold, publish.sh, asset tooling)
├── godoplat/          the web platform (Fastify API + worker + React UI + Docker job)
└── .github/workflows/ CI: generator tests, scaffold type-check, platform build+tests
```

## Deployment scope

GoldRush Studio is designed for **single-user, local deployment** — you run your
own instance with your own key, so there is intentionally no auth, rate-limiting,
or quota. Hosting it publicly for multiple users would require adding auth,
per-key isolation, and an egress-allowlist network for the job containers.

## License

MIT. The generator retains upstream attribution to
[htdt/godogen](https://github.com/htdt/godogen); see
[`godogen-babylon/LICENSE`](godogen-babylon/LICENSE).
