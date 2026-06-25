# Stage: Capture

**When:** before taking screenshots or recording video.

Babylon games run in the browser. Keep the Vite dev server alive and capture
from the running page.

Primary URL:

```text
http://127.0.0.1:5173
```

## Requirements

Chrome or Chromium with WebGL2. Hardware GPU strongly preferred. The capture
script reads the live WebGL2 renderer and logs `[capture] WARNING` on a software
renderer (SwiftShader/llvmpipe/lavapipe/…) — capture still completes, so a
GPU-less host can produce media at reduced quality.

If the host has a GPU but capture still falls back to software, fix the browser
GPU path (ANGLE backend, drivers) before trusting the media as final proof.

If Chrome/Chromium or WebGL2 is missing entirely, **report it** — do not
improvise around it.

Useful checks:

```bash
node --version
command -v google-chrome || command -v chromium || command -v chromium-browser
# macOS:
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Set `CHROME_BIN=/path/to/chrome` if Chrome is installed outside the common
paths.

## Ad hoc screenshot (cheap — use often)

With `npm run dev` running:

```bash
node scripts/capture.mjs still screenshots/{task}/still.png
```

## Frame sequence (motion debugging)

```bash
node scripts/capture.mjs frames screenshots/{task} 60
```

Writes `frame00001.png`, `frame00002.png`, … Use to verify motion, not as the
final presentation path.

## Browser video (final proof)

```bash
node scripts/capture.mjs video screenshots/result/{N} 20
ffmpeg -y -i screenshots/result/{N}/video.webm \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 22 -movflags +faststart \
  screenshots/result/{N}/video.mp4
```

Or via the hook (does both steps):

```bash
bash .claude/hooks/capture_result.sh screenshots/result/{N}
```

## Validation standard

- `npm run check` and `npm run build` pass.
- Vite responds at `http://127.0.0.1:5173`.
- `still` writes a real PNG.
- final video writes `video.webm` + `video.mp4`, 15–30s, visually proving the
  task. A static compile-clean page is not proof — vary camera/presentation if
  needed.
