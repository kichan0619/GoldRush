import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "./redact.js";

test("plain text is left untouched", () => {
  const s = "[entrypoint] npm install completed in 12s";
  assert.equal(redact(s), s);
});

test("an Anthropic key shape is masked", () => {
  const out = redact("using sk-ant-api03-AbC123_def-456 to call the API");
  assert.ok(!out.includes("AbC123_def-456"));
  assert.ok(out.includes("sk-ant-***REDACTED***"));
});

test("the caller's exact key is masked even with a non-standard shape", () => {
  const key = "proxy-key-9f8e7d6c5b4a"; // not an sk-ant shape
  const out = redact(`Authorization: Bearer ${key}`, key);
  assert.ok(!out.includes(key));
  assert.ok(out.includes("***REDACTED***"));
});

test("multiple occurrences of the key are all masked", () => {
  const key = "sk-ant-api03-ZZZ999aaa";
  const out = redact(`${key} ... and again ${key}`, key);
  assert.equal(out.includes(key), false);
});

test("short/empty extras are ignored (no over-masking)", () => {
  const s = "build ok";
  assert.equal(redact(s, "", "abc"), s); // <8 chars are not treated as secrets
});
