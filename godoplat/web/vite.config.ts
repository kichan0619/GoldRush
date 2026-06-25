import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend builds into web/dist, which the Fastify server serves at root.
// In dev, /api, /play and /_jobs are proxied to the backend on :8080.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8080",
      "/play": "http://localhost:8080",
      "/_jobs": "http://localhost:8080",
    },
  },
});
