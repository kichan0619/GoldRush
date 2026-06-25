/**
 * In-memory, ephemeral store for caller-supplied Anthropic API keys (BYOK).
 *
 * The server and worker run in the same process (see src/server/index.ts), so a
 * module-level Map is enough to hand a job's key from the HTTP handler to the
 * worker. The key is taken out (and deleted) when the worker claims the job and
 * is NEVER persisted: not to SQLite, not to disk, not to logs.
 *
 * Consequence by design: if the process restarts while a job is still queued,
 * its key is gone and the worker fails that job with a "resubmit" message. That
 * is the correct trade-off — we would rather lose a queued job than persist a
 * secret.
 */

const keys = new Map<string, string>();

/** Stash a job's API key. Called by the server right after createJob(). */
export function putKey(jobId: string, apiKey: string): void {
  keys.set(jobId, apiKey);
}

/** Retrieve and remove a job's API key. Returns undefined if absent (e.g. the
 *  process restarted after the job was queued). */
export function takeKey(jobId: string): string | undefined {
  const k = keys.get(jobId);
  keys.delete(jobId);
  return k;
}

/** Drop a job's key without returning it (cleanup on early failure paths). */
export function dropKey(jobId: string): void {
  keys.delete(jobId);
}

/** Test-only: number of keys currently held. */
export function _size(): number {
  return keys.size;
}
