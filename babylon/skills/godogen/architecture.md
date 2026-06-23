# Babylon Gameplay Architecture

**When:** before designing game code.

The stance the generated game code should follow. Keep the stable app layer
stable; put all game logic behind the scene contract.

## Layering

```
src/main.ts        entry — creates BabylonApp, starts loop, wires HMR dispose
src/app/           STABLE. Engine, render loop, resize, capture hook, imports.
src/game/          THE GAME. Everything you write lives here.
```

Do not put gameplay in `src/app/**`, and do not reach into the engine from
random modules — go through `src/game/scene.ts`.

## The scene contract

```ts
export function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): { scene: Scene; state: GameState }
```

- Build the Babylon `Scene` here: camera, lights, world, entities.
- Return a `GameState` whose `update(dt)` advances gameplay each frame. `dt` is
  seconds. The render loop in `BabylonApp` calls it.
- Keep mutable gameplay state on the returned object (or modules it closes
  over), never on globals — so HMR can rebuild cleanly.

## Code-first scenes

Babylon scenes here are built in TypeScript, not loaded from an editor file.
Favor:

- **Composition over inheritance.** Small functions that build/spawn entities,
  not deep class trees.
- **One owner per concern.** Input, spawning, scoring, camera each owned by one
  module with a clear update entry point.
- **Determinism where it matters.** Drive motion from `dt`, not frame count, so
  capture and real play match.

## Performance defaults

- Reuse materials and meshes; clone or thin-instance for many copies rather than
  building N unique meshes.
- Dispose what you create when state resets (HMR dispose already tears down the
  whole scene; in-game resets must clean up themselves).
- Keep the per-frame `update(dt)` allocation-free in hot paths (no per-frame
  `new Vector3()` in large loops — mutate in place).

## Input

Use `src/game/input.ts` (`Input.isDown(code)`, `Input.axis(neg, pos)`) and poll
inside `update(dt)`. Don't scatter `addEventListener` across modules.

Read `scene-generation.md` for concrete patterns when you build or replace the
scene, and `quirks.md` before writing code.
