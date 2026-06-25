# GoldRush

A monorepo with two pieces that fit together:

| Directory | What it is |
| --- | --- |
| [`godogen-babylon/`](godogen-babylon) | The **generator** — a Claude Code skill set + scaffold that autonomously builds a Babylon.js browser game from a natural-language prompt. Runs locally in Claude Code. A derivative of [htdt/godogen](https://github.com/htdt/godogen) (MIT), narrowed to the Babylon.js + Claude path. |
| [`godoplat/`](godoplat) | **GoldRush Studio** — a self-hosted web platform that wraps the generator: type a prompt in a browser, and it runs the generator headlessly in a Docker sandbox and gives you back a playable game. |

If you just want the CLI generator, use `godogen-babylon/` on its own. If you
want the one-prompt-to-playable-game web app, use `godoplat/` (it builds the
generator into its sandbox image).

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
