# Stage: Quirks

**When:** before writing code. Babylon.js + Vite + browser gotchas that waste
the most time.

## Imports & tree-shaking

- Import through `src/app/babylon.ts`, not deep `@babylonjs/core/...` paths
  scattered across modules. Add to the barrel when you need a new API.
- Some Babylon features only work after a **side-effect import** (mesh builders,
  loaders, materials). They're collected in `babylon.ts`. If a builder/loader
  silently does nothing, a side-effect import is probably missing.
- glTF/GLB loading needs `import "@babylonjs/loaders/glTF";` (done in
  `assets.ts`). Without it, `ImportMeshAsync` fails on `.glb`.

## Vite assets

- Import runtime assets with the `?url` suffix so Vite fingerprints them:
  ```ts
  import heroUrl from "../assets/models/hero.glb?url";
  ```
- Files in `public/**` are served at the root path verbatim — use only when you
  need a stable URL. Everything else belongs in `src/assets/**`.

## HMR

- `main.ts` disposes the app on `import.meta.hot.dispose`. If you add engines,
  observers, or global listeners outside the scene, dispose them too or
  hot-reload will stack render loops and leak.
- Keep all per-game state reachable from the object `createScene` returns so a
  reload rebuilds cleanly.

## Capture / WebGL

- The capture script needs `preserveDrawingBuffer: true` on the engine (already
  set in `BabylonApp`). Don't remove it or screenshots come back blank.
- `BabylonApp` publishes `window.__WEBGL_INFO__` for the software-renderer
  warning. Harmless in play; keep it.
- On a displayless Linux host, `capture.mjs` re-execs under `xvfb-run`. Install
  `xvfb` or capture fails with a clear message.

## Rendering pitfalls

- A mesh with no material renders with the default white material — usually fine
  for a stand-in, but set `StandardMaterial.diffuseColor` for readable color.
- No light → everything is black (except emissive). Always add at least a
  `HemisphericLight`.
- Z-fighting on coplanar surfaces: offset by a tiny amount or use
  `material.zOffset`.
- Drive all motion from `dt` (seconds), never frame count — otherwise speed
  depends on framerate and capture won't match play.

## TypeScript strictness

- The scaffold runs `strict` + `noUnusedLocals` + `noUnusedParameters`. Prefix
  intentionally-unused params with `_`. `npm run check` must stay green.
