# Workstation setup

What you need to run godogen-babylon and the game repos it produces.

## Core toolchain

- **Node.js 22.12+** and npm — `node --version`
- **Python 3** — for `publish.sh` helpers and the asset-gen CLI
- **Google Chrome or Chromium** with hardware WebGL2 — for browser capture
- **ffmpeg** — to transcode captured `video.webm` → `video.mp4`
- **Claude Code**

Check Chrome is discoverable:

```bash
command -v google-chrome || command -v chromium || command -v chromium-browser
# macOS default:
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

If Chrome lives somewhere unusual, set `CHROME_BIN=/path/to/chrome`. The capture
script (`scripts/capture.mjs`) also honors it.

### Linux headless capture

On a server with no display, capture runs under `xvfb-run`. Install:

```bash
sudo apt-get install -y xvfb ffmpeg
# hardware GL is strongly preferred; verify with:
vulkaninfo --summary | sed -n '1,40p'
```

The capture script auto-wraps itself in `xvfb-run` when no `DISPLAY` /
`WAYLAND_DISPLAY` is set. It warns loudly if WebGL2 falls back to a software
renderer (SwiftShader/llvmpipe/…) but still completes.

## API keys (optional — asset generation only)

Copy `.env.example` to `.env` and fill in whichever you have. The pipeline runs
without any of them (procedural stand-in assets). Keys unlock generated art.
In a published game repo, the easiest way is the interactive prompt:

```bash
npm run setup     # prompts for each key, writes .env (Enter to skip)
```

| Env var | Service | Used for |
|---------|---------|----------|
| `GOOGLE_API_KEY` | Gemini (AI Studio) | precise references, characters |
| `XAI_API_KEY` | xAI Grok | textures, simple objects, video |
| `TRIPO3D_API_KEY` | Tripo3D | image-to-3D (GLB) |

Asset-gen Python deps (only if you use generation):

```bash
pip install requests pillow google-genai xai-sdk tripo3d
```

## Optional: Telegram proof push

`publish.sh --video_hook` installs a Stop hook that sends the final result video
to Telegram. It needs [`tg-push`](https://github.com/htdt/tg-push) on PATH and
`TG_BOT_TOKEN` / `TG_CHAT_ID` set. Without them the hook silently no-ops.

## Running long jobs on a server

A full generation run can take a while.

- Keep the session alive across SSH drops with `tmux` or `screen`.
- A GPU instance renders and captures much faster than software GL.
- Use Claude Code's remote-control interface to check in and steer the run.
