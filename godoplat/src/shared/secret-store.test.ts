import { test } from "node:test";
import assert from "node:assert/strict";
import { putKey, takeKey, dropKey, _size } from "./secret-store.js";

test("takeKey returns the stored credentials and removes them", () => {
  putKey("job-1", { apiKey: "sk-ant-secret" });
  assert.deepEqual(takeKey("job-1"), { apiKey: "sk-ant-secret" });
  // Second take must be undefined — the credentials are consumed.
  assert.equal(takeKey("job-1"), undefined);
});

test("baseUrl (relay) is carried alongside the key", () => {
  putKey("job-relay", { apiKey: "sk-ant-x", baseUrl: "https://relay.example/v1" });
  assert.deepEqual(takeKey("job-relay"), {
    apiKey: "sk-ant-x",
    baseUrl: "https://relay.example/v1",
  });
});

test("takeKey on an unknown job is undefined (e.g. after a restart)", () => {
  assert.equal(takeKey("never-existed"), undefined);
});

test("dropKey removes without returning", () => {
  putKey("job-2", { apiKey: "sk-ant-x" });
  dropKey("job-2");
  assert.equal(takeKey("job-2"), undefined);
});

test("credentials do not leak between jobs", () => {
  putKey("job-a", { apiKey: "key-a" });
  putKey("job-b", { apiKey: "key-b" });
  assert.deepEqual(takeKey("job-a"), { apiKey: "key-a" });
  assert.deepEqual(takeKey("job-b"), { apiKey: "key-b" });
});

test("store does not retain credentials after they are taken", () => {
  const before = _size();
  putKey("job-c", { apiKey: "key-c" });
  takeKey("job-c");
  assert.equal(_size(), before);
});
