// Mirror of the backend's job shape (kept local so the web build is standalone).
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

export const PIPELINE: JobState[] = [
  "queued",
  "provisioning",
  "generating",
  "building",
  "capturing",
  "done",
];

export const TERMINAL: JobState[] = ["done", "failed", "timeout"];

export interface Job {
  id: string;
  prompt: string;
  gameType: "babylon" | "onchain";
  state: JobState;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  gamePath: string | null;
  thumbnailPath: string | null;
  videoPath: string | null;
  logTail: string | null;
}

export function isTerminal(s: JobState): boolean {
  return TERMINAL.includes(s);
}
