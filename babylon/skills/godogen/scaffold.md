# Stage: Scaffold

**When:** after decomposition, before writing game code.

The published repo already contains the Babylon + Vite scaffold (it was copied
by `publish.sh`). This stage is about verifying and recording it, not recreating
it.

## Verify the shell

```bash
npm install          # if node_modules is absent
npm run check        # tsc --noEmit must pass on the untouched scaffold
npm run dev          # Vite serves at http://127.0.0.1:5173
```

Then capture the placeholder scene to confirm the whole loop works before
touching game code:

```bash
node scripts/capture.mjs still screenshots/scaffold/still.png
```

A spinning cube on a ground plane proves engine + render loop + WebGL2 +
capture are all functional. If this fails, fix the environment (Node version,
Chrome path via `CHROME_BIN`, WebGL2) before proceeding.

## Scaffold shape (do not fight it)

- `src/main.ts` → `BabylonApp` → `createScene(engine, canvas)`.
- `src/app/**` is stable infrastructure — engine, render loop, resize, capture
  hook, the `babylon.ts` import barrel. **Don't rewrite per game.**
- `src/game/**` is the game — this is what you edit:
  - `scene.ts` (the placeholder to replace), `state.ts` (the `update(dt)`
    contract), `input.ts`, `assets.ts`.
- `src/assets/**` for runtime assets (`?url` imports); `public/**` for stable
  direct URLs only.

## Write STRUCTURE.md

Record the architecture so later tasks (and a resumed session) don't re-derive
it:

```markdown
# STRUCTURE
- Entry: src/main.ts -> BabylonApp -> createScene()
- State owner: src/game/state.ts (GameState.update(dt))
- Modules: <list game modules and what each owns>
- Assets: <runtime asset contracts and paths>
- Verify: npm run check / npm run build / capture still
```

Keep `STRUCTURE.md` in sync whenever module ownership, state, or asset contracts
change.
