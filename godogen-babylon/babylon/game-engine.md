# Babylon.js Game (built with godogen)

This repo is a Babylon.js browser game built and maintained by ${AGENT_NAME}
through the **godogen** skill pipeline.

## How to work in this repo

Run the generator skill to build or substantially extend the game from a
natural-language brief:

```
${GODOGEN_COMMAND}  <describe the game or the change you want>
```

The skill reads its pipeline stages on demand from
`.claude/skills/godogen/`. Use `${BABYLON_HELP_COMMAND}` for Babylon.js / Vite /
browser API questions.

## Project shape

- `src/main.ts` — entry; creates `BabylonApp` and starts the render loop.
- `src/app/` — stable engine/loop layer (don't rewrite per game).
  - `BabylonApp.ts` owns the engine, render loop, resize, capture hooks.
  - `babylon.ts` is the single Babylon import barrel.
- `src/game/` — the game. **This is what godogen edits.**
  - `scene.ts` — `createScene(engine, canvas) -> { scene, state }`. Keep this
    signature stable so the app and HMR keep working.
  - `state.ts` — the `GameState` contract; `update(dt)` runs each frame.
  - `input.ts`, `assets.ts` — helpers; extend as needed.
- `src/assets/**` — runtime-loaded assets (imported via Vite `?url`).
- `public/**` — only for files needing a stable direct URL.
- `scripts/capture.mjs` — browser screenshot/video capture.

## Commands

```bash
npm install            # first time
npm run dev            # Vite dev server at http://127.0.0.1:5173
npm run check          # tsc --noEmit
npm run build          # type-check + production build
node scripts/capture.mjs still screenshots/{task}/still.png   # ad hoc screenshot
bash .claude/hooks/capture_result.sh screenshots/result/1     # final proof video
```

## Working rules

- **Trust frames, not the compiler.** A clean `npm run check` is necessary but
  not sufficient. Verify visible work with a browser screenshot or video. If a
  requirement isn't visible in capture, treat it as unfinished.
- Keep `npm run dev` alive; let Vite hot-reload the scene as the inner loop.
- Keep state in the context-hygiene files: `PLAN.md`, `STRUCTURE.md`,
  `MEMORY.md`, `ASSETS.md`.
- Chrome/Chromium + WebGL2 are required for capture. If missing, report it
  rather than working around it.

## Asset generation (optional)

AI asset generation needs API keys (Gemini / xAI / Tripo3D). Run `npm run
setup` to enter them interactively (press Enter to skip any), or copy
`.env.example` to `.env` and edit by hand. Without keys the pipeline falls back
to procedural stand-in assets.
