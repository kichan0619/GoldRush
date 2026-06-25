// Interactive API-key setup. Reads the key definitions from .env.example,
// shows any existing value from .env (masked), and prompts for each one. Press
// Enter to keep the current value / skip. Writes the result to .env.
//
//   npm run setup
//
// Keys left blank stay blank — the pipeline runs key-free and falls back to
// procedural assets, so skipping everything is a valid choice. .env is
// gitignored; nothing here is committed.
import { readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";

const ROOT = process.cwd();
const EXAMPLE = join(ROOT, ".env.example");
const ENV = join(ROOT, ".env");

// Parse a dotenv-ish file into { keys: [{key, value, comment}], order }.
// Comment lines immediately above a KEY=VALUE become that key's help text.
function parseEnvFile(text) {
  const entries = [];
  const values = {};
  let pendingComment = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      pendingComment = [];
      continue;
    }
    if (line.trimStart().startsWith("#")) {
      pendingComment.push(line.replace(/^\s*#\s?/, ""));
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    values[key] = value;
    if (!entries.some((e) => e.key === key)) {
      entries.push({ key, comment: pendingComment.join(" ").trim() });
    }
    pendingComment = [];
  }
  return { entries, values };
}

function isPlaceholder(value) {
  if (!value) return true;
  const v = value.toLowerCase();
  return v.startsWith("your-") || v.endsWith("-here");
}

function mask(value) {
  if (!value || isPlaceholder(value)) return "(not set)";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(EXAMPLE))) {
    console.error("error: .env.example not found. Run this from the game repo root.");
    process.exit(1);
  }

  const example = parseEnvFile(await readFile(EXAMPLE, "utf-8"));
  const current = (await exists(ENV)) ? parseEnvFile(await readFile(ENV, "utf-8")).values : {};

  if (!stdin.isTTY) {
    console.error(
      "No interactive terminal. Copy .env.example to .env and edit it by hand:\n" +
        "  cp .env.example .env",
    );
    process.exit(1);
  }

  console.log("\ngodogen-babylon — API key setup");
  console.log("Press Enter to keep the current value / leave blank. All keys are optional;");
  console.log("without them the pipeline falls back to procedural assets.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  const result = {};

  for (const { key, comment } of example.entries) {
    const existing = current[key] && !isPlaceholder(current[key]) ? current[key] : "";
    if (comment) console.log(`# ${comment}`);
    const shown = existing ? ` [${mask(existing)}]` : "";
    const answer = (await rl.question(`${key}${shown}: `)).trim();
    result[key] = answer !== "" ? answer : existing;
    console.log("");
  }

  rl.close();

  // Render .env preserving the example's comments + key order.
  const lines = [];
  lines.push("# Written by `npm run setup`. Edit freely. This file is gitignored.");
  lines.push("");
  for (const { key, comment } of example.entries) {
    if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=${result[key] ?? ""}`);
    lines.push("");
  }
  await writeFile(ENV, lines.join("\n").replace(/\n+$/, "\n"), "utf-8");

  const setCount = example.entries.filter(({ key }) => result[key] && !isPlaceholder(result[key])).length;
  console.log(`Wrote .env (${setCount}/${example.entries.length} keys set).`);
  if (setCount === 0) {
    console.log("No keys set — that's fine. Asset generation will use procedural stand-ins.");
  }
}

main().catch((err) => {
  console.error(`setup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
