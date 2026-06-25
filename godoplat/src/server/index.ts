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
} from "../db/store.js";
import type { CreateJobRequest } from "../shared/job.js";
import { putKey } from "../shared/secret-store.js";
import { startWorker } from "../worker/index.js";

const MAX_PROMPT_LEN = 500;

export function buildServer() {
  const app = Fastify({ logger: true });

  // --- API -----------------------------------------------------------------
  app.post<{ Body: CreateJobRequest }>("/api/jobs", async (req, reply) => {
    const prompt = (req.body?.prompt ?? "").trim();
    const apiKey = (req.body?.apiKey ?? "").trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt is required" });
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      return reply.code(400).send({ error: `prompt too long (max ${MAX_PROMPT_LEN})` });
    }
    if (!apiKey) {
      return reply.code(400).send({ error: "Anthropic API key is required (BYOK)" });
    }
    // The key is held in memory only (secret-store), keyed by job id, and
    // consumed by the worker. createJob persists the prompt only — the key
    // never touches SQLite, disk, or logs.
    const job = createJob(prompt);
    putKey(job.id, apiKey);
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
