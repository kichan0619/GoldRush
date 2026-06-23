// Central re-export barrel for the Babylon APIs the game uses.
//
// Importing from one place keeps tree-shaking predictable and gives the game
// code a single, stable import path ("../app/babylon"). Add re-exports here as
// the game grows rather than importing deep @babylonjs/core paths everywhere.

export { Engine } from "@babylonjs/core/Engines/engine";
export { Scene } from "@babylonjs/core/scene";
export { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
export { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
export { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
export { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

// Side-effect imports Babylon needs for a working scene with these APIs.
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Rendering/edgesRenderer";
