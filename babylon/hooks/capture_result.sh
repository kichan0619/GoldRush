#!/usr/bin/env bash
# Record the final proof video for a Babylon game and bundle it as
# screenshots/result/{N}/{video.webm,video.mp4}.
#
# Usage:
#   bash .claude/hooks/capture_result.sh screenshots/result/1 [seconds] [url]
#
# Requires: the Vite dev server running, Chrome/Chromium, and ffmpeg.
set -euo pipefail

OUT_DIR="${1:?usage: capture_result.sh <out-dir> [seconds] [url]}"
SECONDS_LEN="${2:-20}"
URL="${3:-http://127.0.0.1:5173}"

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

mkdir -p "$OUT_DIR"

echo "[capture_result] recording ${SECONDS_LEN}s from $URL"
node scripts/capture.mjs video "$OUT_DIR" "$SECONDS_LEN" "$URL"

WEBM="$OUT_DIR/video.webm"
MP4="$OUT_DIR/video.mp4"

if [ ! -f "$WEBM" ]; then
    echo "[capture_result] error: $WEBM was not produced" >&2
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[capture_result] warning: ffmpeg not found — leaving webm only ($WEBM)" >&2
    exit 0
fi

echo "[capture_result] transcoding to mp4"
ffmpeg -y -i "$WEBM" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 22 -movflags +faststart \
    "$MP4"

echo "[capture_result] wrote $MP4"
