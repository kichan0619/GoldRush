import { defineConfig } from "vite";

// Babylon games run as a single-page app. The capture script and the godogen
// pipeline both expect the dev server on 127.0.0.1:5173.
export default defineConfig({
  // Relative asset paths so the built game works when served from a subpath
  // (GoldRush Studio serves each game under /play/<id>/), not only from root.
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
  // Keep large Babylon chunks from tripping the default warning on every build.
  esbuild: {
    legalComments: "none",
  },
});
