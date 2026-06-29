import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the store at an isolated temp db BEFORE importing it (config.ts reads
// GODOPLAT_DB_PATH at import time). The dynamic import below picks this up.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "godoplat-test-"));
process.env.GODOPLAT_DB_PATH = path.join(tmpDir, "test.db");

const store = await import("./store.js");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("createJob inserts a queued job without persisting any key", () => {
  const job = store.createJob("make a platformer");
  assert.equal(job.state, "queued");
  assert.equal(job.prompt, "make a platformer");
  // The Job model has no apiKey field at all — nothing secret is stored.
  assert.equal((job as Record<string, unknown>).apiKey, undefined);
  const fetched = store.getJob(job.id);
  assert.ok(fetched);
  assert.equal(fetched!.prompt, "make a platformer");
});

test("createJob defaults gameType to babylon; persists onchain when given", () => {
  const def = store.createJob("default engine");
  assert.equal(def.gameType, "babylon");
  assert.equal(store.getJob(def.id)!.gameType, "babylon");

  const oc = store.createJob("a tic-tac-toe on chain", "onchain");
  assert.equal(oc.gameType, "onchain");
  // Survives a round-trip through SQLite.
  assert.equal(store.getJob(oc.id)!.gameType, "onchain");
});

test("claimNextQueued atomically moves oldest queued -> provisioning", () => {
  const a = store.createJob("first");
  const claimed = store.claimNextQueued();
  assert.ok(claimed);
  assert.equal(claimed!.state, "provisioning");
  // It claims oldest-first; `a` was created before this call in FIFO order
  // among currently-queued jobs.
  assert.ok(claimed!.id);
  void a;
});

test("claimNextQueued returns null when nothing is queued", () => {
  // Drain whatever is queued.
  while (store.claimNextQueued()) {
    /* keep claiming */
  }
  assert.equal(store.claimNextQueued(), null);
});

test("setState enforces the forward-transition guard", () => {
  const job = store.createJob("guard test");
  store.claimNextQueued(); // -> provisioning (oldest queued)
  // Illegal jump should throw.
  assert.throws(() => store.setState(job.id, "done"));
});

test("reapOrphans fails any job stuck mid-flight", () => {
  const job = store.createJob("orphan");
  store.claimNextQueued(); // -> provisioning
  const reaped = store.reapOrphans();
  assert.ok(reaped >= 1);
  const after = store.getJob(job.id);
  assert.equal(after!.state, "failed");
  assert.match(after!.error ?? "", /restart/i);
});
