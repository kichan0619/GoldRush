import { Engine, Scene } from "./babylon";
import { createScene } from "../game/scene";
import type { GameState } from "../game/state";

// Owns the canvas, engine, render loop, and resize wiring. Game-specific code
// lives in src/game/** — this file stays stable across games so the capture
// pipeline and hot-reload contract don't move.
export class BabylonApp {
  readonly engine: Engine;
  readonly scene: Scene;
  private state: GameState;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true, // required so the capture script can read pixels
      stencil: true,
      antialias: true,
    });

    const { scene, state } = createScene(this.engine, canvas);
    this.scene = scene;
    this.state = state;

    window.addEventListener("resize", this.onResize);
    this.exposeWebGLInfoForCapture();
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      this.state.update?.(dt);
      this.scene.render();
    });
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.scene.dispose();
    this.engine.dispose();
  }

  private onResize = (): void => {
    this.engine.resize();
  };

  // The capture script reads window.__WEBGL_INFO__ to detect software renderers
  // (SwiftShader/llvmpipe/…) and warn. Harmless in normal play.
  private exposeWebGLInfoForCapture(): void {
    try {
      const gl = this.engine._gl as WebGL2RenderingContext | undefined;
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg ? gl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
      const vendor = dbg ? gl?.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "unknown";
      (window as unknown as Record<string, unknown>).__WEBGL_INFO__ = { renderer, vendor };
    } catch {
      // Non-fatal — capture falls back to "unknown".
    }
  }
}
