import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { config, JOBS_DIR, jobDir, PROJECT_ROOT } from "../shared/config.js";
import {
  createJob,
  getJob,
  listJobs,
  reapOrphans,
  deleteJob,
} from "../db/store.js";
import type { CreateJobRequest } from "../shared/job.js";
import { isGameType, DEFAULT_GAME_TYPE, isTerminal } from "../shared/job.js";
import { putKey, dropKey } from "../shared/secret-store.js";
import { startWorker, cancelJob } from "../worker/index.js";

const MAX_PROMPT_LEN = 500;

/** Minimal extension → MIME map for serving built game files under /play. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export function buildServer() {
  const app = Fastify({ logger: true });

  // --- API -----------------------------------------------------------------
  app.post<{ Body: CreateJobRequest }>("/api/jobs", async (req, reply) => {
    const prompt = (req.body?.prompt ?? "").trim();
    const apiKey = (req.body?.apiKey ?? "").trim();
    const baseUrl = (req.body?.baseUrl ?? "").trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt is required" });
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      return reply.code(400).send({ error: `prompt too long (max ${MAX_PROMPT_LEN})` });
    }
    if (!apiKey) {
      return reply.code(400).send({ error: "Anthropic API key is required (BYOK)" });
    }
    const gameType = isGameType(req.body?.gameType) ? req.body.gameType : DEFAULT_GAME_TYPE;

    // Edit mode: when parentJobId is given, the new job refines an existing game.
    // Validate the parent is a finished job whose source bundle we still have.
    let parentJobId: string | null = null;
    const reqParent = (req.body?.parentJobId ?? "").trim();
    if (reqParent) {
      const parent = getJob(reqParent);
      if (!parent) {
        return reply.code(400).send({ error: "parentJobId not found" });
      }
      if (parent.state !== "done") {
        return reply.code(400).send({ error: "parent game is not finished" });
      }
      if (!fs.existsSync(path.join(jobDir(parent.id), "source.tar.gz"))) {
        return reply.code(400).send({ error: "parent game has no editable source" });
      }
      parentJobId = parent.id;
    }

    // Credentials are held in memory only (secret-store), keyed by job id, and
    // consumed by the worker. createJob persists prompt + gameType + parentJobId
    // only — the key and base URL never touch SQLite, disk, or logs.
    const job = createJob(prompt, gameType, parentJobId);
    putKey(job.id, { apiKey, baseUrl: baseUrl || undefined });
    return reply.code(201).send(job);
  });

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "not found" });
    return job;
  });

  app.get("/api/jobs", async () => {
    return listJobs();
  });

  // Cancel a running/queued job (keeps the row, marks it canceled/failed).
  app.post<{ Params: { id: string } }>("/api/jobs/:id/cancel", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "not found" });
    if (isTerminal(job.state)) {
      return reply.code(409).send({ error: "job already finished" });
    }
    cancelJob(job.id);
    return reply.send({ ok: true });
  });

  // Delete a job entirely: cancel if still running, then drop the row, its
  // in-memory key, and its on-disk artifacts.
  app.delete<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "not found" });
    if (!isTerminal(job.state)) cancelJob(job.id);
    dropKey(job.id);
    deleteJob(job.id);
    // Best-effort artifact cleanup; the row is already gone either way.
    try {
      fs.rmSync(jobDir(job.id), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return reply.send({ ok: true });
  });

  // --- Static: finished games + media, served per job ----------------------
  // Each job's built game lives at data/jobs/<id>/dist and is exposed at
  // /play/<id>/. Media (thumbnail/video) at /media/<id>/.
  app.register(fastifyStatic, {
    root: JOBS_DIR,
    prefix: "/_jobs/", // raw passthrough (dist + media under each id)
    decorateReply: false,
  });

  // Friendly /play/:id/ → data/jobs/:id/dist/index.html (+ assets)
  app.get<{ Params: { id: string; "*": string } }>(
    "/play/:id/*",
    async (req, reply) => {
      const { id } = req.params;
      const rest = req.params["*"] || "index.html";
      const distRoot = path.join(jobDir(id), "dist");
      const target = path.join(distRoot, rest);
      // Path-traversal guard: resolved target must stay inside distRoot.
      const resolved = path.resolve(target);
      if (!resolved.startsWith(path.resolve(distRoot) + path.sep)) {
        return reply.code(400).send({ error: "bad path" });
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return reply.code(404).send({ error: "not found" });
      }
      // Set a correct Content-Type. ES module scripts (Vite output uses
      // <script type="module">) are blocked by browsers unless served with a
      // JavaScript MIME type, so an unset/wrong type causes a blank page.
      const type = MIME[path.extname(resolved).toLowerCase()];
      if (type) reply.type(type);
      return reply.send(fs.createReadStream(resolved));
    },
  );
  app.get<{ Params: { id: string } }>("/play/:id", async (req, reply) => {
    return reply.redirect(`/play/${req.params.id}/`);
  });

  // --- Static: built frontend (web/dist) at root ---------------------------
  const webDist = path.join(PROJECT_ROOT, "web", "dist");
  if (fs.existsSync(webDist)) {
    app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      decorateReply: true,
    });
    // SPA fallback for client routes.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/play") || req.url.startsWith("/_jobs")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

async function main() {
  // Static roots must exist before @fastify/static registers them.
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const reaped = reapOrphans();
  if (reaped > 0) {
    // eslint-disable-next-line no-console
    console.log(`[server] reaped ${reaped} orphaned job(s) from a previous run`);
  }
  const app = buildServer();
  // Run the worker in-process for the single-node slice.
  startWorker();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

// Run when invoked directly.
main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
