# Stage: Scene Generation

**When:** creating or replacing the playable scene (`src/game/scene.ts`).

Concrete patterns for building Babylon scenes that read well on camera and hold
up under capture.

## Replace the placeholder

The scaffold ships a spinning-cube placeholder. Replace the body of
`createScene` but keep the signature and the `{ scene, state }` return.

## Skeleton

```ts
import {
  Scene, ArcRotateCamera, FreeCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Vector3, Color3, Color4, type Engine,
} from "../app/babylon";
import type { GameState } from "./state";
import { Input } from "./input";

export function createScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(/* palette bg */ 0.05, 0.06, 0.09, 1);

  // camera: pick one that frames the gameplay
  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.0, 18, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);

  // lights: hemi for ambient fill + directional for form
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.7;
  new DirectionalLight("sun", new Vector3(-1, -2, -1), scene).intensity = 0.6;

  // world + entities here ...
  const input = new Input();

  const state: GameState = {
    update(dt: number) {
      // advance gameplay using dt and input.axis(...)
    },
  };
  return { scene, state };
}
```

## Camera choices

- **ArcRotate** — orbit/inspect, top-down-ish, racing chase from behind.
- **Free/Universal** — first-person or scripted fly-throughs.
- For capture, a slowly moving or orbiting camera reads better than a static
  one. A static compile-clean page is **not** proof of a playable game.

## Readability (tie to the palette in ASSETS.md)

- Distinct, saturated colors for interactive objects; muted ground/sky.
- Add a ground plane and at least one directional light so 3D shapes read as 3D.
- Flat/low-poly: `StandardMaterial` with `diffuseColor` and low specular reads
  clean and renders fast.

## Many entities

```ts
// thin instances for hundreds of identical meshes
const base = MeshBuilder.CreateBox("rock", { size: 1 }, scene);
base.thinInstanceAdd(matrixArray); // one draw call
```

Prefer instancing/cloning over building unique meshes in a loop.

## Verify

After every visible change:

```bash
node scripts/capture.mjs still screenshots/{task}/still.png
```

For motion, capture a short sequence and check it actually moves:

```bash
node scripts/capture.mjs frames screenshots/{task} 30
```

Read `quirks.md` for the Babylon/Vite gotchas that bite while doing this.
