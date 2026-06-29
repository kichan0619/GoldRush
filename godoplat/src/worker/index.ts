import fs from "node:fs";
import path from "node:path";
import { config, jobDir, jobDistDir, jobMediaDir } from "../shared/config.js";
import {
  claimNextQueued,
  patchJob,
  setState,
} from "../db/store.js";
import type { Job, JobState } from "../shared/job.js";
import { takeKey } from "../shared/secret-store.js";
import { redact } from "../shared/redact.js";
import {
  copyOut,
  dockerAvailable,
  removeContainer,
  runContainer,
} from "./docker.js";

/**
 * Single-concurrency orchestrator for the slice. Polls SQLite for a queued
 * job, runs it in a throwaway container, maps the container's @@STAGE:x@@
 * markers to job states, enforces a wall-clock timeout, then extracts
 * artifacts. One job at a time keeps port 5173 / resource use predictable.
 */

const POLL_MS = 1500;
const LOG_TAIL_LINES = 40;

// Marker emitted by docker/entrypoint.sh. Maps 1:1 to a forward state.
const STAGE_TO_STATE: Record<string, JobState> = {
  provisioning: "provisioning",
  generating: "generating",
  building: "building",
  capturing: "capturing",
  // `done` is set by us only after artifacts are verified, not on the marker.
};

let running = false;
let stopped = false;

export function startWorker(): void {
  if (running) return;
  running = true;
  if (!dockerAvailable()) {
    // eslint-disable-next-line no-console
    console.error(
      "[worker] docker is not available — jobs will stay queued. " +
        "Install/start Docker, then restart.",
    );
  }
  void loop();
}

export function stopWorker(): void {
  stopped = true;
}

async function loop(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[worker] started");
  while (!stopped) {
    const job = claimNextQueued();
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    try {
      await runJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[worker] job ${job.id} crashed:`, msg);
      try {
        patchJob(job.id, { finishedAt: Date.now() });
        forceFail(job.id, `worker error: ${msg}`);
      } catch {
        /* terminal-state write race; ignore */
      }
    }
  }
}

async function runJob(job: Job): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] running job ${job.id}: ${job.prompt}`);

  // BYOK: the caller's Anthropic credentials were stashed in memory by the
  // server. Take them (which also deletes them). If gone — e.g. the process
  // restarted after this job was queued — we can't run, so fail with a clear,
  // actionable message.
  const cred = takeKey(job.id);
  if (!cred) {
    finalize(
      job.id,
      "failed",
      "Anthropic 凭据不可用（服务可能重启过，内存中的 key 已丢失）。请重新提交。",
    );
    return;
  }
  const { apiKey, baseUrl } = cred;

  const containerName = `godoplat-${job.id.slice(0, 8)}`;
  patchJob(job.id, { containerId: containerName });

  // Rolling tail buffer for surfacing failures.
  const tail: string[] = [];
  let lastStage: JobState = "provisioning";

  // The on-chain engine needs a Foundry-equipped image; babylon uses the default.
  const image = job.gameType === "onchain" ? config.onchainJobImage : config.jobImage;

  // Edit mode: mount the parent game's stored source read-only at /seed; the
  // entrypoint restores it into /game so the agent edits the existing game.
  const editing = !!job.parentJobId;
  const readonlyMount = editing
    ? { hostPath: jobDir(job.parentJobId as string), containerPath: "/seed" }
    : undefined;

  const handle = runContainer({
    image,
    containerName,
    readonlyMount,
    env: {
      ANTHROPIC_API_KEY: apiKey,
      // Forward a custom endpoint (relay / 中转站) when provided. Relays vary in
      // which auth var they read, so when a base URL is set we also pass
      // ANTHROPIC_AUTH_TOKEN (same value) to cover both conventions.
      ...(baseUrl
        ? { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: apiKey }
        : {}),
      GODOPLAT_PROMPT: job.prompt,
      GODOPLAT_ENGINE: job.gameType,
      ...(editing ? { GODOPLAT_EDIT: "1" } : {}),
      GODOPLAT_MAX_TURNS: String(config.maxTurns),
      ...config.assetKeys,
    },
    memory: config.memory,
    cpus: config.cpus,
    pidsLimit: config.pidsLimit,
    onLine: (line) => {
      // Scrub any secret shape (and the caller's exact key) before it can be
      // persisted to the db / shown in the UI.
      const safe = redact(line, apiKey);
      tail.push(safe);
      if (tail.length > LOG_TAIL_LINES) tail.shift();
      const m = safe.match(/@@STAGE:(\w+)@@/);
      if (m && m[1]) {
        const next = STAGE_TO_STATE[m[1]];
        if (next && next !== lastStage) {
          lastStage = next;
          try {
            setState(job.id, next);
          } catch {
            /* illegal transition (e.g. after timeout) — ignore */
          }
        }
      }
      patchJob(job.id, { logTail: tail.join("\n") });
    },
  });

  // Wall-clock guard: kill the container if it overruns.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // eslint-disable-next-line no-console
    console.warn(`[worker] job ${job.id} exceeded ${config.jobTimeoutMs}ms — killing`);
    handle.kill();
  }, config.jobTimeoutMs);

  const exitCode = await handle.done;
  clearTimeout(timer);

  if (timedOut) {
    finalize(job.id, "timeout", "wall-clock timeout exceeded");
    removeContainer(containerName);
    return;
  }
  if (exitCode !== 0) {
    finalize(job.id, "failed", `container exited ${exitCode}`, tail.join("\n"));
    removeContainer(containerName);
    return;
  }

  // Extract artifacts before removing the container.
  const ok = extractArtifacts(containerName, job.id);
  removeContainer(containerName);

  if (!ok) {
    finalize(job.id, "failed", "build produced no playable dist/index.html", tail.join("\n"));
    return;
  }
  finalizeDone(job.id);
}

/** Copy dist/, media, and the source bundle out of the container into host job
 *  storage. The source bundle (source.tar.gz) lets a later edit job restore this
 *  game and iterate on it. */
function extractArtifacts(containerName: string, id: string): boolean {
  fs.mkdirSync(jobDir(id), { recursive: true });
  copyOut(containerName, "/game/dist", jobDir(id)); // creates dist/ under jobDir
  fs.mkdirSync(jobMediaDir(id), { recursive: true });
  copyOut(containerName, "/game/screenshots/result/1/still.png", path.join(jobMediaDir(id), "still.png"));
  // Capture writes video.webm, optionally transcoded to video.mp4.
  copyOut(containerName, "/game/screenshots/result/1/video.mp4", path.join(jobMediaDir(id), "video.mp4"));
  copyOut(containerName, "/game/screenshots/result/1/video.webm", path.join(jobMediaDir(id), "video.webm"));
  // Source bundle for iterative edits (best-effort; absence just disables editing).
  copyOut(containerName, "/game/source.tar.gz", path.join(jobDir(id), "source.tar.gz"));

  const index = path.join(jobDistDir(id), "index.html");
  return fs.existsSync(index);
}

function finalizeDone(id: string): void {
  const mediaRel = `/_jobs/${id}/media`;
  const still = path.join(jobMediaDir(id), "still.png");
  const mp4 = path.join(jobMediaDir(id), "video.mp4");
  const webm = path.join(jobMediaDir(id), "video.webm");
  patchJob(id, {
    finishedAt: Date.now(),
    gamePath: `/play/${id}/`,
    thumbnailPath: fs.existsSync(still) ? `${mediaRel}/still.png` : null,
    videoPath: fs.existsSync(mp4)
      ? `${mediaRel}/video.mp4`
      : fs.existsSync(webm)
        ? `${mediaRel}/video.webm`
        : null,
  });
  setState(id, "done");
}

function finalize(id: string, state: JobState, error: string, logTail?: string): void {
  patchJob(id, { finishedAt: Date.now(), error, ...(logTail ? { logTail } : {}) });
  try {
    setState(id, state);
  } catch {
    /* already terminal */
  }
}

/** Force a job into failed regardless of current state (crash path). */
function forceFail(id: string, error: string): void {
  patchJob(id, { state: "failed", error, finishedAt: Date.now() });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
