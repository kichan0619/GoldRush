import {
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color3,
  Color4,
  type Engine,
} from "../app/babylon";
import type { GameState } from "./state";

// PLACEHOLDER SCENE.
//
// This is the starting point godogen replaces. It renders a spinning cube on a
// ground plane so a freshly-scaffolded repo proves the engine, render loop, and
// browser capture all work end to end before any real game code exists.
//
// The /godogen pipeline rewrites this file (see scene-generation.md). Keep the
// signature — createScene(engine, canvas) -> { scene, state } — stable so
// BabylonApp and HMR keep working.
export function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): { scene: Scene; state: GameState } {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 3,
    Math.PI / 3,
    8,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 40;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.7;
  const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
  sun.intensity = 0.6;

  const ground = MeshBuilder.CreateGround("ground", { width: 12, height: 12 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.15, 0.16, 0.2);
  ground.material = groundMat;

  const cube = MeshBuilder.CreateBox("cube", { size: 1.5 }, scene);
  cube.position.y = 1.2;
  const cubeMat = new StandardMaterial("cubeMat", scene);
  cubeMat.diffuseColor = new Color3(0.3, 0.7, 1);
  cube.material = cubeMat;

  const state: GameState = {
    update(dt: number) {
      cube.rotation.y += dt * 1.2;
      cube.rotation.x += dt * 0.4;
    },
  };

  return { scene, state };
}
