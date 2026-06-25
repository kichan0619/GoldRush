---
name: babylon-help
display_name: Babylon Help
short_description: Look up Babylon.js / Vite / browser APIs for this project
description: |
  Reference lookup for Babylon.js APIs, loaders, exact import paths, Vite integration, and browser capture issues. Use when you need to confirm how a Babylon API works for the version installed in this project.
---

# Babylon Help

Reference/lookup skill for Babylon.js questions while building this game. This is
not a pipeline stage — invoke it when you need to confirm an API.

## Source of truth, in order

1. **The installed package** — `node_modules/@babylonjs/core` and
   `@babylonjs/loaders` for THIS project's version. Read the `.d.ts` types and
   source rather than guessing; APIs differ across major versions.
   ```bash
   ls node_modules/@babylonjs/core/
   grep -rl "class ArcRotateCamera" node_modules/@babylonjs/core/Cameras/
   ```
2. **This project's import barrel** — `src/app/babylon.ts`. Add a re-export
   there instead of importing deep paths in game modules.
3. **Official docs** — https://doc.babylonjs.com/ (typedoc at
   https://doc.babylonjs.com/typedoc/). Match the doc version to the installed
   one.

## Common import paths (modular @babylonjs/core)

| Need | Import |
|------|--------|
| Engine | `@babylonjs/core/Engines/engine` |
| Scene | `@babylonjs/core/scene` |
| Math (Vector3/Color3/Color4) | `@babylonjs/core/Maths/math` |
| ArcRotateCamera | `@babylonjs/core/Cameras/arcRotateCamera` |
| FreeCamera | `@babylonjs/core/Cameras/freeCamera` |
| HemisphericLight | `@babylonjs/core/Lights/hemisphericLight` |
| DirectionalLight | `@babylonjs/core/Lights/directionalLight` |
| MeshBuilder | `@babylonjs/core/Meshes/meshBuilder` |
| StandardMaterial | `@babylonjs/core/Materials/standardMaterial` |
| SceneLoader | `@babylonjs/core/Loading/sceneLoader` |
| glTF/GLB loader (side effect) | `@babylonjs/core/Loading/sceneLoader` + `@babylonjs/loaders/glTF` |

## Side-effect imports (easy to miss)

The modular build won't register some features unless imported for side effects.
These are collected in `src/app/babylon.ts`:

```ts
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Meshes/Builders/groundBuilder";
```

If a `MeshBuilder.CreateX` or a loader silently no-ops, the matching side-effect
import is missing.

## Vite integration

- Asset URLs: `import url from "../assets/x.glb?url"`.
- Dev server is `127.0.0.1:5173` (fixed in `vite.config.ts`, `strictPort`).
- `npm run check` = `tsc --noEmit`; `npm run build` = type-check + `vite build`.

## Browser capture issues

- Blank screenshots → engine needs `preserveDrawingBuffer: true` (set in
  `BabylonApp`).
- Software renderer warning → see `godogen/capture.md`; fix ANGLE/drivers on a
  GPU host, accept it on a GPU-less host.
- `capture.mjs` uses `playwright-core` driving system Chrome via `CHROME_BIN` /
  common install paths — it does **not** download a browser.

## Performance

- Many identical meshes → thin instances (`mesh.thinInstanceAdd`) or
  `createInstance`, not unique meshes in a loop.
- Reuse materials; mutate vectors in place in hot `update(dt)` paths.
