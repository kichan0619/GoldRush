import { App } from "./app/App";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Canvas #game not found in index.html");
}

const app = new App(canvas);
app.start();

// Vite HMR: dispose the old app so hot-reloading game code doesn't leak engines
// or stack render loops.
if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
