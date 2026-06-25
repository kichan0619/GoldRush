/**
 * In-memory, ephemeral store for caller-supplied Anthropic credentials (BYOK):
 * the API key and an optional custom base URL (relay / 中转站).
 *
 * The server and worker run in the same process (see src/server/index.ts), so a
 * module-level Map is enough to hand a job's credentials from the HTTP handler
 * to the worker. They are taken out (and deleted) when the worker claims the job
 * and are NEVER persisted: not to SQLite, not to disk, not to logs.
 *
 * Consequence by design: if the process restarts while a job is still queued,
 * its credentials are gone and the worker fails that job with a "resubmit"
 * message. That is the correct trade-off — we would rather lose a queued job
 * than persist a secret.
 */

const creds = new Map<string, JobCredentials>();

/** Per-job credentials handed from the HTTP layer to the worker. */
export interface JobCredentials {
  apiKey: string;
  /** Optional custom Anthropic endpoint (e.g. a relay / 中转站). */
  baseUrl?: string;
}

/** Stash a job's credentials. Called by the server right after createJob(). */
export function putKey(jobId: string, cred: JobCredentials): void {
  creds.set(jobId, cred);
}

/** Retrieve and remove a job's credentials. Returns undefined if absent (e.g.
 *  the process restarted after the job was queued). */
export function takeKey(jobId: string): JobCredentials | undefined {
  const c = creds.get(jobId);
  creds.delete(jobId);
  return c;
}

/** Drop a job's credentials without returning them (cleanup on early failure). */
export function dropKey(jobId: string): void {
  creds.delete(jobId);
}

/** Test-only: number of credentials currently held. */
export function _size(): number {
  return creds.size;
}
