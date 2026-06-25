# GoldRush Studio (`godoplat`)

A self-hosted platform that turns a text prompt into a playable **Babylon.js**
browser game, by running the [`godogen-babylon`](../godogen-babylon) generator
headlessly inside a throwaway Docker container and driving it with Claude Code.

> **Bring Your Own Key (BYOK).** Each generation uses *your* Anthropic API key,
> entered in the web UI per run. The key is held **in memory only** for the life
> of that job, passed to the sandbox container as an env var, and then dropped.
> It is **never** written to the database, to disk, or to logs, and never ends
> up in the generated game. See [Security](#security).

## How it works

```
 browser (you enter prompt + your Anthropic key)
   │  POST /api/jobs   { prompt, apiKey }
   ▼
 Fastify server ── createJob(prompt) ──▶ SQLite   (prompt only, no key)
   │             ── putKey(id, key) ──▶ in-memory secret store
   ▼
 worker (same process, single concurrency)
   │  takeKey(id)  →  docker run (key as env var, --no-new-privileges, capped mem/cpu)
   ▼
 container: publish.sh → claude /godogen <prompt> → npm build → Chromium screenshot+video
   │  @@STAGE:x@@ markers → job state   (logs scrubbed of key shapes before storing)
   ▼
 artifacts copied out → /play/<id>/ (playable) + thumbnail/video → gallery
```

## Prerequisites

- **Docker** (the job sandbox image). Build context must be the **monorepo root**
  (the parent that contains both `godogen-babylon/` and `godoplat/`).
- **Node.js ≥ 20** and npm.
- An **Anthropic API key** — supplied at run time in the UI, not stored here.
- (Optional) art-gen keys (`GOOGLE_API_KEY` / `XAI_API_KEY` / `TRIPO3D_API_KEY`)
  in `godoplat/.env`. Without them the generator falls back to procedural assets.

## Quickstart

```bash
# 1) Build the job sandbox image — run from the MONOREPO ROOT, not godoplat/.
docker build -f godoplat/docker/Dockerfile.job -t godoplat-job:latest .

# 2) Build + run the platform.
cd godoplat
cp .env.example .env          # optional: fill in art-gen keys (NOT the Anthropic key)
npm install
npm run build:all             # builds the server (tsc) and the web UI (vite)
npm start                     # serves API + UI on http://localhost:8080
```

Open <http://localhost:8080>, paste your Anthropic key, type a prompt
(e.g. `a small low-poly kart racer with 3 laps and a lap timer`), and submit.
Watch the pipeline; the finished game appears at `/play/<id>/` and in the gallery.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build:server` | Type-check + compile the backend to `dist/`. |
| `npm run build:web` | Install + Vite-build the web UI into `web/dist/`. |
| `npm run build:all` | Both of the above. |
| `npm start` | Run the compiled server (`dist/server/index.js`). |
| `npm run dev` | Run the server from source with watch (tsx). |
| `npm test` | Run the unit tests (`node --test`, via tsx). |

## Configuration

All host config lives in `godoplat/.env` (see `.env.example`). Notable knobs:
`PORT`, `GODOPLAT_JOB_IMAGE`, `GODOPLAT_JOB_TIMEOUT_MS`, `GODOPLAT_MAX_TURNS`,
and container limits `GODOPLAT_JOB_MEMORY` / `GODOPLAT_JOB_CPUS` /
`GODOPLAT_JOB_PIDS`. The Anthropic key is **not** a config value — it is BYOK.

## Security

- **BYOK, memory-only.** The caller's Anthropic key arrives in the request body,
  is stored in an in-memory map keyed by job id (`src/shared/secret-store.ts`),
  taken out (and deleted) when the worker claims the job, and passed to the
  container as an env var. It is never persisted. If the process restarts while a
  job is still queued, that job fails with a "please resubmit" message — by
  design, we lose the job rather than persist the secret.
- **Log scrubbing.** Container output shown in the UI is passed through
  `src/shared/redact.ts`, which masks `sk-ant-…` shapes and the caller's exact
  key before anything is stored or displayed.
- **Sandbox.** Jobs run in a non-root container with `--no-new-privileges` and
  capped memory/cpu/pids. Never run the image `--privileged`.
- **This is a single-user, local deployment.** There is intentionally **no**
  auth / rate-limiting / quota — every user runs their own instance with their
  own key. If you ever host this publicly for multiple users, you must add auth,
  per-key isolation, and an egress-allowlist network for the job containers.

## Tests

```bash
npm test
```

Covers the job state machine, the in-memory secret store (taken-once semantics),
log redaction, and the SQLite store (atomic claim, transition guard, orphan
reaping) against an isolated temp database.
