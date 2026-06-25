import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root of the godoplat project (two levels up from src/shared). */
export const PROJECT_ROOT = path.resolve(here, "..", "..");

export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
/** DB path. `GODOPLAT_DB_PATH` overrides it (used by tests for an isolated db). */
export const DB_PATH = process.env.GODOPLAT_DB_PATH ?? path.join(DATA_DIR, "godoplat.db");

/** Per-job host storage. */
export function jobDir(id: string): string {
  return path.join(JOBS_DIR, id);
}
export function jobDistDir(id: string): string {
  return path.join(jobDir(id), "dist");
}
export function jobMediaDir(id: string): string {
  return path.join(jobDir(id), "media");
}

/** Tunables (env-overridable). */
export const config = {
  port: Number(process.env.PORT ?? 8080),
  /** Docker image tag for the job sandbox. */
  jobImage: process.env.GODOPLAT_JOB_IMAGE ?? "godoplat-job:latest",
  /** Whole-container wall-clock ceiling (ms). Worker kills past this. */
  jobTimeoutMs: Number(process.env.GODOPLAT_JOB_TIMEOUT_MS ?? 20 * 60 * 1000),
  /** Agent iteration cap passed to `claude --max-turns`. */
  maxTurns: Number(process.env.GODOPLAT_MAX_TURNS ?? 60),
  /** Container resource limits. */
  memory: process.env.GODOPLAT_JOB_MEMORY ?? "4g",
  cpus: process.env.GODOPLAT_JOB_CPUS ?? "2",
  pidsLimit: Number(process.env.GODOPLAT_JOB_PIDS ?? 512),
  /** Optional asset-gen keys forwarded into the game repo .env. These are the
   *  deployer's own optional art-generation keys (Gemini/Grok/Tripo3D); leave
   *  blank for procedural assets. The Anthropic key is NOT here — it is BYOK:
   *  supplied per-job by the caller, held in memory (secret-store), passed to
   *  the container as an env var, and never written to disk. */
  assetKeys: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "",
    XAI_API_KEY: process.env.XAI_API_KEY ?? "",
    TRIPO3D_API_KEY: process.env.TRIPO3D_API_KEY ?? "",
  },
} as const;
