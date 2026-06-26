import { Engine } from "@babylonjs/core";
import { createScene } from "../game/scene";

// Owns the canvas, engine, render loop, resize. Stays stable across games so
// the capture pipeline (#game canvas + window.__WEBGL_INFO__) and hot-reload
// contract don't move. Game-specific code lives in src/game/**.
export class App {
  readonly engine: Engine;
  private readonly scene: ReturnType<typeof createScene>["scene"];
  private readonly state: ReturnType<typeof createScene>["state"];

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

  private onResize = (): void => this.engine.resize();

  private exposeWebGLInfoForCapture(): void {
    try {
      const gl = (this.engine as unknown as { _gl?: WebGL2RenderingContext })._gl;
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg ? gl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
      const vendor = dbg ? gl?.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "unknown";
      (window as unknown as Record<string, unknown>).__WEBGL_INFO__ = { renderer, vendor };
    } catch {
      // Non-fatal — capture falls back to "unknown".
    }
  }
}
