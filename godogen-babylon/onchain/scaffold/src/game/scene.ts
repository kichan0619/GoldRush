import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";
import { Chain, type BoardState } from "./chain";

const HUD = {
  status: document.getElementById("status"),
  turn: document.getElementById("turn"),
  addr: document.getElementById("addr"),
};

const STATUS_LABEL = ["Waiting", "In progress", "X won", "O won", "Draw"];

/// Builds a 3x3 board, polls the contract for state, renders X/O marks, and
/// lets you click an empty cell to submit a move as the side whose turn it is.
/// The chain is the source of truth — the scene only mirrors it.
export function createScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.06, 0.075, 1);

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 0.62, 9, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  new HemisphericLight("light", new Vector3(0.4, 1, 0.3), scene);

  const xMat = mat(scene, "x", new Color3(1, 0.35, 0.36));
  const oMat = mat(scene, "o", new Color3(0.36, 0.75, 0.92));
  const boardMat = mat(scene, "board", new Color3(0.18, 0.2, 0.26));

  // 3x3 cell tiles centered at origin, plus a slot for each placed mark.
  const tiles: AbstractMesh[] = [];
  const marks: (AbstractMesh | null)[] = Array(9).fill(null);
  const SPAN = 2.1;
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const tile = MeshBuilder.CreateBox(`tile${i}`, { width: 1.9, height: 0.2, depth: 1.9 }, scene);
    tile.position = new Vector3((c - 1) * SPAN, 0, (1 - r) * SPAN);
    tile.material = boardMat;
    tile.metadata = { cell: i };
    tiles.push(tile);
  }

  const chain = new Chain();
  const state: { update?: (dt: number) => void } = {};
  let busy = false;
  let last = "";

  // Read the current on-chain board once immediately, so the scene reflects the
  // live game state on load instead of waiting for the first poll tick.
  if (chain.deployed) {
    void chain
      .read()
      .then((b) => {
        last = b.cells.join("") + b.status;
        render(b);
      })
      .catch(() => {
        if (HUD.status) HUD.status.textContent = "chain unreachable (is anvil up?)";
      });
  }

  function placeMark(cell: number, side: number) {
    if (marks[cell]) return;
    const r = Math.floor(cell / 3);
    const c = cell % 3;
    const pos = new Vector3((c - 1) * SPAN, 0.6, (1 - r) * SPAN);
    let mesh: AbstractMesh;
    if (side === 1) {
      mesh = MeshBuilder.CreateBox(`m${cell}`, { width: 1.2, height: 0.4, depth: 0.25 }, scene);
      mesh.rotation.y = Math.PI / 4;
      const cross = MeshBuilder.CreateBox(`m${cell}b`, { width: 1.2, height: 0.4, depth: 0.25 }, scene);
      cross.rotation.y = -Math.PI / 4;
      cross.parent = mesh;
      mesh.material = xMat;
      cross.material = xMat;
    } else {
      mesh = MeshBuilder.CreateTorus(`m${cell}`, { diameter: 1.2, thickness: 0.32 }, scene);
      mesh.material = oMat;
    }
    mesh.position = pos;
    marks[cell] = mesh;
  }

  function render(b: BoardState) {
    for (let i = 0; i < 9; i++) if (b.cells[i]) placeMark(i, b.cells[i]!);
    if (HUD.status) HUD.status.textContent = STATUS_LABEL[b.status] ?? "?";
    if (HUD.turn)
      HUD.turn.textContent = b.status === 1 ? `Turn: ${b.turn === 1 ? "X" : "O"} (click a cell)` : "";
    if (HUD.addr) HUD.addr.textContent = `contract ${chain.address.slice(0, 10)}…`;
  }

  // Click an empty tile → submit a move as the current side.
  scene.onPointerDown = async (_evt, pick) => {
    if (busy || !pick.hit || !pick.pickedMesh) return;
    const meta = pick.pickedMesh.metadata as { cell?: number } | null;
    if (!meta || meta.cell === undefined) return;
    if (!chain.deployed) return;
    try {
      const b = await chain.read();
      if (b.status !== 1 || b.cells[meta.cell] !== 0) return;
      busy = true;
      await chain.move(meta.cell, b.turn);
    } catch (e) {
      console.error("[chain] move failed:", e);
    } finally {
      busy = false;
    }
  };

  // Poll the chain ~1/s and reflect it. (Throttled inside the render loop.)
  let acc = 0;
  state.update = (dt: number) => {
    acc += dt;
    if (acc < 1 || busy) return;
    acc = 0;
    if (!chain.deployed) {
      if (HUD.status) HUD.status.textContent = "waiting for deployment…";
      return;
    }
    void chain
      .read()
      .then((b) => {
        const key = b.cells.join("") + b.status;
        if (key !== last) {
          last = key;
          render(b);
        }
      })
      .catch(() => {
        if (HUD.status) HUD.status.textContent = "chain unreachable (is anvil up?)";
      });
  };

  return { scene, state };
}

function mat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
}
