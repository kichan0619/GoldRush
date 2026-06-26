// Browser capture for Babylon games. Drives Chrome/Chromium via playwright-core
// against the running Vite dev server (http://127.0.0.1:5173 by default).
//
// Usage:
//   node scripts/capture.mjs still  <png-path> [url]
//   node scripts/capture.mjs frames <out-dir> <frame-count> [url] [fps]
//   node scripts/capture.mjs video  <out-dir> <seconds> [url]
//
// On a Linux host with no display it re-execs itself under `xvfb-run`. It reads
// the live WebGL2 renderer and warns loudly (but does not fail) when it lands on
// a software rasterizer — on a GPU host that warning means a misconfiguration.
import { statSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const DEFAULT_URL = process.env.GODOGEN_CAPTURE_URL ?? "http://127.0.0.1:5173";
const WIDTH = Number.parseInt(process.env.GODOGEN_CAPTURE_WIDTH ?? "1280", 10);
const HEIGHT = Number.parseInt(process.env.GODOGEN_CAPTURE_HEIGHT ?? "720", 10);
const FPS = Number.parseInt(process.env.GODOGEN_CAPTURE_FPS ?? "30", 10);
const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|lavapipe|softpipe|mesa offscreen|software/i;

// --- Re-exec under xvfb on a displayless Linux host ---
if (
  process.platform !== "darwin" &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY &&
  process.env.GODOGEN_UNDER_XVFB !== "1" &&
  process.env.GODOGEN_CAPTURE_NO_XVFB !== "1"
) {
  const result = spawnSync(
    "xvfb-run",
    ["-a", "-s", "-screen 0 1920x1080x24", process.execPath, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, GODOGEN_UNDER_XVFB: "1" } },
  );
  if (result.error) {
    const msg =
      result.error.code === "ENOENT"
        ? "xvfb-run is required when no display is available (apt-get install xvfb)"
        : result.error.message;
    console.error(`[capture] ${msg}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/capture.mjs still  <png-path> [url]",
      "  node scripts/capture.mjs frames <out-dir> <frame-count> [url] [fps]",
      "  node scripts/capture.mjs video  <out-dir> <seconds> [url]",
    ].join("\n"),
  );
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // keep scanning
    }
  }
  throw new Error("No Chrome/Chromium found. Install it or set CHROME_BIN.");
}

async function launchPage(url) {
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: [
      "--use-gl=angle",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("console", (msg) => console.error(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[browser] pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForSelector("#game", { timeout: 15_000 });
  await delay(800); // let the first frames render

  await reportRenderer(page);
  return { browser, context, page };
}

async function reportRenderer(page) {
  const info = await page.evaluate(() => window.__WEBGL_INFO__ ?? null).catch(() => null);
  const renderer = info?.renderer ?? "unknown";
  console.error(`[capture] WebGL2 renderer: ${renderer}`);
  if (typeof renderer === "string" && SOFTWARE_RENDERERS.test(renderer)) {
    console.error(
      "[capture] WARNING: software WebGL renderer detected. Capture will still " +
        "complete, but on a GPU host this is a misconfiguration to fix (ANGLE/Vulkan/drivers).",
    );
  }
}

async function captureStill(pngPath, url) {
  const { browser, page } = await launchPage(url);
  try {
    await mkdir(dirname(pngPath), { recursive: true });
    await page.screenshot({ path: pngPath });
    console.error(`[capture] wrote ${pngPath}`);
  } finally {
    await browser.close();
  }
}

async function captureFrames(outDir, count, url, fps) {
  const { browser, page } = await launchPage(url);
  try {
    await mkdir(outDir, { recursive: true });
    const interval = 1000 / fps;
    for (let i = 1; i <= count; i++) {
      const name = `frame${String(i).padStart(5, "0")}.png`;
      await page.screenshot({ path: join(outDir, name) });
      await delay(interval);
    }
    console.error(`[capture] wrote ${count} frames to ${outDir}`);
  } finally {
    await browser.close();
  }
}

async function captureVideo(outDir, seconds, url) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  page.on("console", (msg) => console.error(`[browser] ${msg.type()}: ${msg.text()}`));
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForSelector("#game", { timeout: 15_000 });
    await reportRenderer(page);
    await delay(seconds * 1000);
    const video = page.video();
    await context.close(); // finalizes the .webm
    if (video) {
      const src = await video.path();
      const dest = join(outDir, "video.webm");
      if (src !== dest) await rename(src, dest);
      console.error(`[capture] wrote ${dest}`);
      console.error(
        "[capture] transcode to mp4:\n" +
          `  ffmpeg -y -i ${join(outDir, "video.webm")} -c:v libx264 -pix_fmt yuv420p ` +
          `-preset medium -crf 22 -movflags +faststart ${join(outDir, "video.mp4")}`,
      );
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const [mode, a, b, c, d] = process.argv.slice(2);
  try {
    if (mode === "still") {
      if (!a) return usage(), process.exit(2);
      await captureStill(a, b ?? DEFAULT_URL);
    } else if (mode === "frames") {
      if (!a || !b) return usage(), process.exit(2);
      await captureFrames(a, Number.parseInt(b, 10), c ?? DEFAULT_URL, d ? Number.parseInt(d, 10) : FPS);
    } else if (mode === "video") {
      if (!a || !b) return usage(), process.exit(2);
      await captureVideo(a, Number.parseInt(b, 10), c ?? DEFAULT_URL);
    } else {
      usage();
      process.exit(2);
    }
  } catch (err) {
    console.error(`[capture] error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
