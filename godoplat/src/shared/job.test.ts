import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, isTerminal, JOB_STATES } from "./job.js";

test("isTerminal: only done/failed/timeout are terminal", () => {
  assert.equal(isTerminal("done"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("timeout"), true);
  assert.equal(isTerminal("queued"), false);
  assert.equal(isTerminal("generating"), false);
});

test("canTransition: legal forward moves are allowed", () => {
  assert.equal(canTransition("queued", "provisioning"), true);
  assert.equal(canTransition("provisioning", "generating"), true);
  assert.equal(canTransition("generating", "building"), true);
  assert.equal(canTransition("building", "capturing"), true);
  assert.equal(canTransition("capturing", "done"), true);
});

test("canTransition: any active state may fail or timeout", () => {
  for (const s of ["provisioning", "generating", "building", "capturing"] as const) {
    assert.equal(canTransition(s, "failed"), true);
    assert.equal(canTransition(s, "timeout"), true);
  }
});

test("canTransition: illegal moves are rejected", () => {
  assert.equal(canTransition("queued", "done"), false); // can't skip the pipeline
  assert.equal(canTransition("queued", "timeout"), false); // not yet running
  assert.equal(canTransition("generating", "queued"), false); // no going back
  assert.equal(canTransition("done", "generating"), false); // terminal is terminal
});

test("terminal states have no outgoing transitions", () => {
  for (const s of ["done", "failed", "timeout"] as const) {
    for (const to of JOB_STATES) {
      assert.equal(canTransition(s, to), false);
    }
  }
});
