import { test } from "node:test";
import assert from "node:assert/strict";
import { putKey, takeKey, dropKey, _size } from "./secret-store.js";

test("takeKey returns the stored key and removes it", () => {
  putKey("job-1", "sk-ant-secret");
  assert.equal(takeKey("job-1"), "sk-ant-secret");
  // Second take must be undefined — the key is consumed.
  assert.equal(takeKey("job-1"), undefined);
});

test("takeKey on an unknown job is undefined (e.g. after a restart)", () => {
  assert.equal(takeKey("never-existed"), undefined);
});

test("dropKey removes without returning", () => {
  putKey("job-2", "sk-ant-x");
  dropKey("job-2");
  assert.equal(takeKey("job-2"), undefined);
});

test("keys do not leak between jobs", () => {
  putKey("job-a", "key-a");
  putKey("job-b", "key-b");
  assert.equal(takeKey("job-a"), "key-a");
  assert.equal(takeKey("job-b"), "key-b");
});

test("store does not retain keys after they are taken", () => {
  const before = _size();
  putKey("job-c", "key-c");
  takeKey("job-c");
  assert.equal(_size(), before);
});
