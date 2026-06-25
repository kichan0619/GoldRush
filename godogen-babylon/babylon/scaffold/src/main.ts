import "./style.css";
import { BabylonApp } from "./app/BabylonApp";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Canvas #game not found in index.html");
}

const app = new BabylonApp(canvas);
app.start();

// Vite HMR: dispose the old app so hot-reloading game code doesn't leak engines
// or stack render loops. The scene rebuilds from the updated module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
