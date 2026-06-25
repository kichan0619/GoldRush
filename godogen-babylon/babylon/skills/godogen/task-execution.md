# Stage: Task Execution

**When:** before the first task, and as the loop for every task after scaffold.

## Plan each task

- Read `STRUCTURE.md`, `package.json`, `src/game/scene.ts`, `architecture.md`,
  `scene-generation.md`, and `quirks.md` before touching code.
- Use `${BABYLON_HELP_COMMAND}` for Babylon APIs, loaders, exact import paths,
  Vite behavior, and capture/rendering setup.
- Decide concrete scope: state owner, files/modules, runtime assets,
  verification command, and the browser evidence that proves it.
- Preserve dependency versions unless the task is an engine/tool migration.
- Keep `npm run dev` running at `http://127.0.0.1:5173`.

## Default loop

1. Start or reuse `npm run dev`.
2. Implement the next visible/playable slice.
3. Let Vite hot-reload the scene.
4. Capture when the change is visual:
   ```bash
   node scripts/capture.mjs still screenshots/{task}/still.png
   ```
5. `npm run check`.
6. Fix TypeScript and runtime console errors before tuning.
7. `npm run build` once the slice is clean.
8. Update `STRUCTURE.md` / `PLAN.md` if ownership, state, assets, or status
   changed.

For long-running visible work, capture a sequence:

```bash
node scripts/capture.mjs frames screenshots/{task} 30
```

## Browser runtime is the truth

A passing `npm run build` is necessary but not sufficient. Required for valid
verification:

- Chrome/Chromium available (or `CHROME_BIN` set).
- WebGL2 available on the canvas; hardware GPU preferred (the capture script
  warns on a software renderer but still completes).
- Browser console forwarding stays on so runtime errors reach the terminal.

## Final proof

```bash
bash .claude/hooks/capture_result.sh screenshots/result/1
```

The result folder must contain `video.webm` and `video.mp4`. The MP4 should be
15–30s and show task-relevant behavior the whole time. If the scene is static,
make the camera or a scripted presentation vary the view.

## Stop conditions (a task is done when)

- `npm run check` passes.
- `npm run build` passes.
- Vite dev server runs at `http://127.0.0.1:5173`.
- WebGL2 hardware rendering confirmed (or software fallback explicitly accepted
  on a GPU-less host).
- The task's verification criteria from `PLAN.md` are visible in capture.
- `STRUCTURE.md` matches the shipped shape.
