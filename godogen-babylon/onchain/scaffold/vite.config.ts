import { defineConfig } from "vite";

// On-chain game client. Relative base so the built game works when served from
// a subpath (GoldRush Studio serves each game under /play/<id>/). The capture
// pipeline and godogen scaffold both expect the dev server on 127.0.0.1:5173.
export default defineConfig({
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
  esbuild: {
    legalComments: "none",
  },
});
