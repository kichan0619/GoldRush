/**
 * Shared job model + state machine for GoldRush Studio.
 *
 * A "job" is one prompt → playable game generation run. The server creates it,
 * the worker drives it through the states below inside a throwaway Docker
 * container, and the frontend polls it.
 */

/** Lifecycle states. Terminal states: done, failed, timeout. */
export const JOB_STATES = [
  "queued",
  "provisioning",
  "generating",
  "building",
  "capturing",
  "done",
  "failed",
  "timeout",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_STATES: readonly JobState[] = ["done", "failed", "timeout"];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Allowed forward transitions. The worker is the only writer. */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  queued: ["provisioning", "failed"],
  provisioning: ["generating", "failed", "timeout"],
  generating: ["building", "failed", "timeout"],
  building: ["capturing", "failed", "timeout"],
  capturing: ["done", "failed", "timeout"],
  done: [],
  failed: [],
  timeout: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface Job {
  id: string;
  prompt: string;
  state: JobState;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  containerId: string | null;
  error: string | null;
  /** Host-relative path to the served game dir (dist/), once built. */
  gamePath: string | null;
  thumbnailPath: string | null;
  videoPath: string | null;
  /** Last slice of container logs, for surfacing failures in the UI. */
  logTail: string | null;
}

/** Shape returned to the frontend (same as Job for now; kept separate so the
 *  internal model can grow fields the API doesn't expose). */
export type JobView = Job;

export interface CreateJobRequest {
  prompt: string;
  /**
   * Caller-supplied Anthropic API key (BYOK). Lives only in the request body
   * and an in-memory store keyed by job id — it is deliberately NOT part of the
   * persisted `Job` model, never written to SQLite, disk, or logs.
   */
  apiKey: string;
}
