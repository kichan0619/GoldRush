#!/usr/bin/env bash
# Job entrypoint: runs the full generate → build → capture pipeline inside the
# sandbox container, emitting machine-readable stage markers on stdout so the
# host worker can map them to job states. Exits non-zero on any failure.
#
# Inputs (container env vars, set by the worker):
#   ANTHROPIC_API_KEY   required — read by the claude CLI. NEVER written to disk.
#   GODOPLAT_PROMPT     required — the game description.
#   GODOPLAT_MAX_TURNS  agent iteration cap (default 60).
#   GOOGLE_API_KEY / XAI_API_KEY / TRIPO3D_API_KEY  optional asset-gen keys.
#
# Outputs (worker docker-cp's these out):
#   /game/dist                         built game
#   /game/screenshots/result/1/        still.png + video.webm/mp4
set -euo pipefail

stage() { echo "@@STAGE:$1@@"; }
log()   { echo "[entrypoint] $*"; }

: "${GODOPLAT_PROMPT:?GODOPLAT_PROMPT is required}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
MAX_TURNS="${GODOPLAT_MAX_TURNS:-60}"

# --- provisioning: stage the generator and publish a fresh game repo ---------
stage provisioning
log "copying generator to writable /work"
cp -a /gen/. /work/
cd /work
log "publishing game repo to /game"
./publish.sh --agent claude --out /game

# Write ONLY optional asset keys into the game repo .env (the generator reads
# them from there). The Anthropic key is deliberately NOT written — it stays a
# process env var so generated code can't read it off disk.
{
  for k in GOOGLE_API_KEY XAI_API_KEY TRIPO3D_API_KEY; do
    v="${!k:-}"
    [ -n "$v" ] && echo "$k=$v"
  done
} > /game/.env
log "wrote /game/.env ($(wc -l < /game/.env) asset key(s))"

cd /game
log "npm install"
npm install --no-audit --no-fund

# --- generating: drive the autonomous build via Claude Code headless ---------
stage generating
log "running claude headless (max-turns=$MAX_TURNS)"
# stream-json keeps stdout machine-parseable; we tee it to a log for the tail.
claude -p "/godogen ${GODOPLAT_PROMPT}" \
  --dangerously-skip-permissions \
  --max-turns "$MAX_TURNS" \
  --output-format stream-json --verbose \
  2>&1 | tee /game/.claude-run.log || {
    log "claude exited non-zero; continuing to build whatever exists"
  }

# --- building: type-check + production build ---------------------------------
stage building
log "npm run build"
npm run build

# --- capturing: serve the build, screenshot + record -------------------------
stage capturing
log "starting dev server on 5173"
npm run dev >/game/.dev.log 2>&1 &
DEV_PID=$!
trap 'kill "$DEV_PID" 2>/dev/null || true' EXIT

# Wait for the strict port 5173 to answer (up to ~30s).
for i in $(seq 1 60); do
  if (echo > /dev/tcp/127.0.0.1/5173) 2>/dev/null; then
    log "dev server is up"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 60 ]; then
    log "dev server did not come up on 5173"
    exit 1
  fi
done

mkdir -p screenshots/result/1
log "capturing still + video (capture.mjs handles xvfb itself)"
node scripts/capture.mjs still screenshots/result/1/still.png
node scripts/capture.mjs video screenshots/result/1 6 || log "video capture failed (non-fatal)"

stage done
log "pipeline complete"
