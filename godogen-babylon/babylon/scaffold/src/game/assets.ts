// Asset loading helpers. Generated/runtime assets live under src/assets/** and
// are imported with Vite's ?url suffix so the bundler fingerprints them:
//
//   import heroUrl from "../assets/models/hero.glb?url";
//   const hero = await loadGlb(scene, heroUrl);
//
// Keep reference images, prompts, and debug captures OUT of src/assets/** —
// only files the game actually loads at runtime belong there.
import "@babylonjs/loaders/glTF";
import { SceneLoader } from "../app/babylon";
import type { Scene } from "../app/babylon";
import type { AbstractMesh } from "../app/babylon";

export interface LoadedModel {
  meshes: AbstractMesh[];
  root: AbstractMesh | undefined;
}

/** Load a GLB (already imported as a ?url string) into the scene. */
export async function loadGlb(scene: Scene, url: string): Promise<LoadedModel> {
  const result = await SceneLoader.ImportMeshAsync("", "", url, scene);
  return { meshes: result.meshes, root: result.meshes[0] };
}
