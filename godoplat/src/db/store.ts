import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { DATA_DIR, DB_PATH } from "../shared/config.js";
import {
  type Job,
  type JobState,
  type GameType,
  DEFAULT_GAME_TYPE,
  canTransition,
} from "../shared/job.js";

/**
 * SQLite-backed job store. Single-node, synchronous (better-sqlite3), durable.
 * The server inserts queued jobs; the worker is the only updater of state.
 */

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      prompt       TEXT NOT NULL,
      gameType     TEXT NOT NULL DEFAULT 'babylon',
      state        TEXT NOT NULL,
      createdAt    INTEGER NOT NULL,
      startedAt    INTEGER,
      finishedAt   INTEGER,
      containerId  TEXT,
      error        TEXT,
      gamePath     TEXT,
      thumbnailPath TEXT,
      videoPath    TEXT,
      logTail      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(createdAt);
  `);
  // Migration for DBs created before gameType existed: add the column if missing.
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "gameType")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN gameType TEXT NOT NULL DEFAULT 'babylon'`);
  }
  return db;
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    prompt: row.prompt as string,
    gameType: ((row.gameType as string) ?? DEFAULT_GAME_TYPE) as GameType,
    state: row.state as JobState,
    createdAt: row.createdAt as number,
    startedAt: (row.startedAt as number) ?? null,
    finishedAt: (row.finishedAt as number) ?? null,
    containerId: (row.containerId as string) ?? null,
    error: (row.error as string) ?? null,
    gamePath: (row.gamePath as string) ?? null,
    thumbnailPath: (row.thumbnailPath as string) ?? null,
    videoPath: (row.videoPath as string) ?? null,
    logTail: (row.logTail as string) ?? null,
  };
}

export function createJob(prompt: string, gameType: GameType = DEFAULT_GAME_TYPE): Job {
  const job: Job = {
    id: randomUUID(),
    prompt,
    gameType,
    state: "queued",
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    containerId: null,
    error: null,
    gamePath: null,
    thumbnailPath: null,
    videoPath: null,
    logTail: null,
  };
  getDb()
    .prepare(
      `INSERT INTO jobs (id, prompt, gameType, state, createdAt) VALUES (@id, @prompt, @gameType, @state, @createdAt)`,
    )
    .run({
      id: job.id,
      prompt: job.prompt,
      gameType: job.gameType,
      state: job.state,
      createdAt: job.createdAt,
    });
  return job;
}

export function getJob(id: string): Job | null {
  const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToJob(row) : null;
}

export function listJobs(limit = 100): Job[] {
  const rows = getDb()
    .prepare(`SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToJob);
}

/**
 * Atomically claim the oldest queued job, moving it to `provisioning`. Returns
 * null when nothing is waiting. The UPDATE...WHERE state='queued' guard makes
 * this safe even if two workers race (only one row update wins).
 */
export function claimNextQueued(): Job | null {
  const dbh = getDb();
  const claim = dbh.transaction((): Job | null => {
    const row = dbh
      .prepare(`SELECT * FROM jobs WHERE state = 'queued' ORDER BY createdAt ASC LIMIT 1`)
      .get() as Record<string, unknown> | undefined;
    if (!row) return null;
    const id = row.id as string;
    const res = dbh
      .prepare(
        `UPDATE jobs SET state = 'provisioning', startedAt = @now WHERE id = @id AND state = 'queued'`,
      )
      .run({ id, now: Date.now() });
    if (res.changes === 0) return null; // lost the race
    return getJob(id);
  });
  return claim();
}

/** Update job state with a forward-transition guard. Throws on illegal moves. */
export function setState(id: string, to: JobState): void {
  const job = getJob(id);
  if (!job) throw new Error(`job ${id} not found`);
  if (job.state === to) return;
  if (!canTransition(job.state, to)) {
    throw new Error(`illegal transition ${job.state} -> ${to} for job ${id}`);
  }
  getDb().prepare(`UPDATE jobs SET state = ? WHERE id = ?`).run(to, id);
}

/** Patch arbitrary fields (containerId, paths, error, logTail, finishedAt). */
export function patchJob(
  id: string,
  fields: Partial<Omit<Job, "id" | "prompt" | "createdAt">>,
): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb()
    .prepare(`UPDATE jobs SET ${setClause} WHERE id = @id`)
    .run({ ...fields, id });
}

/**
 * On startup, any job left mid-flight by a crashed worker is stuck in a
 * non-terminal, non-queued state. Mark them failed so they don't hang forever.
 */
export function reapOrphans(): number {
  const res = getDb()
    .prepare(
      `UPDATE jobs SET state = 'failed', error = 'worker restarted mid-job', finishedAt = @now
       WHERE state IN ('provisioning','generating','building','capturing')`,
    )
    .run({ now: Date.now() });
  return res.changes;
}
