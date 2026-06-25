#!/usr/bin/env python3
"""Asset Generator CLI — text-to-image (Gemini / xAI Grok), image-to-3D (Tripo3D).

Subcommands:
  image   Generate a PNG from a prompt. --model grok (cheap) | gemini (precise).
  video   Generate an MP4 from a prompt + reference image (Grok).
  glb     Convert a PNG to a static GLB (Tripo3D).
  budget  Manage the optional spend ceiling: `budget init --cents N` / `budget status`.

Every generation subcommand accepts --estimate to print the cost in cents and
exit without calling a provider (no key required), so a pipeline can plan spend
up front.

Output: a JSON result object on stdout. Progress/diagnostics on stderr.

API KEYS ARE READ FROM THE ENVIRONMENT — nothing is hardcoded:
  GOOGLE_API_KEY   Gemini   (image --model gemini)
  XAI_API_KEY      xAI Grok (image --model grok, video)
  TRIPO3D_API_KEY  Tripo3D  (glb)

Copy .env.example to .env and fill in your own keys. If a required key is
missing, the relevant subcommand exits with a clear JSON error so the pipeline
can fall back to procedural stand-in assets instead of crashing.

The SDK imports (google-genai, xai-sdk, tripo3d, pillow, requests) are loaded
lazily inside each backend so the file imports cleanly even when only some
providers are installed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def load_dotenv() -> None:
    """Populate os.environ from the nearest .env, walking up from cwd.

    No external dependency (python-dotenv not required). Existing environment
    variables win over .env, and placeholder/blank values are ignored so a
    half-filled .env doesn't shadow a real exported key. Lines are KEY=VALUE;
    blanks and # comments are skipped.
    """
    here = Path.cwd()
    for directory in (here, *here.parents):
        env_path = directory / ".env"
        if not env_path.is_file():
            continue
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value
        break  # nearest .env only

# --- Budget tracking (optional) -------------------------------------------------
# When assets/budget.json exists, every generation is checked against and logged
# to it, so a run can be capped at a spend ceiling. No file => no budgeting.
BUDGET_FILE = Path("assets/budget.json")

GEMINI_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_COSTS = {"512": 5, "1K": 7, "2K": 10, "4K": 15}  # cents
GROK_IMAGE_MODEL = "grok-imagine-image"
GROK_IMAGE_COST = 2  # cents
GROK_VIDEO_MODEL = "grok-imagine-video"
GROK_VIDEO_COST_PER_SEC = 5  # cents
GLB_COST = 30  # cents


def result_json(
    ok: bool,
    path: str | None = None,
    cost_cents: int = 0,
    error: str | None = None,
    **extra: object,
) -> None:
    out: dict[str, object] = {"ok": ok, "cost_cents": cost_cents}
    if path:
        out["path"] = path
    if error:
        out["error"] = error
    out.update(extra)
    print(json.dumps(out))


def fail(message: str) -> None:
    result_json(False, error=message)
    sys.exit(1)


def emit_estimate(cost_cents: int, service: str) -> None:
    """Print the cost without generating, then exit 0. Needs no API key."""
    result_json(True, cost_cents=cost_cents, estimate=True, service=service)
    sys.exit(0)


# Network calls retry on transient failures (timeouts, connection drops, 429,
# 5xx) with exponential backoff. Permanent failures (4xx other than 429) are
# returned immediately — retrying them just wastes time and money.
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY = 1.0  # seconds; doubles each attempt


def with_retry(send, *, is_retryable, attempts: int = RETRY_ATTEMPTS,
               base_delay: float = RETRY_BASE_DELAY, sleep=time.sleep):
    """Call ``send()`` up to ``attempts`` times with exponential backoff.

    ``send`` returns a response object; ``is_retryable(resp)`` decides whether a
    *successful return* should still be retried (e.g. a 429/5xx HTTP status).
    Exceptions raised by ``send`` are treated as transient and retried until the
    final attempt, where the exception propagates. ``sleep`` is injectable so
    tests run without real delays.
    """
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            resp = send()
        except Exception as e:  # noqa: BLE001 — transient network errors, retried
            last_exc = e
            if attempt == attempts - 1:
                raise
        else:
            if attempt == attempts - 1 or not is_retryable(resp):
                return resp
        sleep(base_delay * (2 ** attempt))
    # Unreachable: the loop either returns or raises, but satisfies type checkers.
    raise last_exc if last_exc else RuntimeError("retry loop exhausted")


def _is_placeholder(key: str) -> bool:
    """A key that is blank or still looks like the .env.example placeholder."""
    return (not key) or key.lower().startswith("your-") or key.endswith("-here")


def require_key(env_name: str, service: str) -> str:
    key = os.environ.get(env_name, "").strip()
    if _is_placeholder(key):
        fail(
            f"{service} needs {env_name}. Set a real key in .env "
            f"(copy .env.example). Falling back to procedural assets is fine."
        )
    return key


# --- Budget helpers ------------------------------------------------------------

def _load_budget() -> dict | None:
    if not BUDGET_FILE.exists():
        return None
    try:
        budget = json.loads(BUDGET_FILE.read_text())
    except (json.JSONDecodeError, OSError) as e:
        fail(f"budget file {BUDGET_FILE} is unreadable or corrupt: {e}")
    if not isinstance(budget, dict):
        fail(f"budget file {BUDGET_FILE} must contain a JSON object")
    return budget


def _spent(budget: dict) -> int:
    """Total cents recorded in the budget log."""
    return sum(v for entry in budget.get("log", []) for v in entry.values())


def check_budget(cost_cents: int) -> None:
    budget = _load_budget()
    if budget is None:
        return
    spent = _spent(budget)
    remaining = budget.get("budget_cents", 0) - spent
    if cost_cents > remaining:
        fail(f"Budget exceeded: need {cost_cents}¢, only {remaining}¢ left ({spent}¢ spent)")


def record_spend(cost_cents: int, service: str) -> None:
    budget = _load_budget()
    if budget is None:
        return
    budget.setdefault("log", []).append({service: cost_cents})
    BUDGET_FILE.write_text(json.dumps(budget, indent=2) + "\n")


def budget_init(cents: int) -> None:
    """Create (or reset) the spend ceiling at assets/budget.json."""
    if cents < 0:
        fail("budget ceiling must be >= 0")
    BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
    BUDGET_FILE.write_text(
        json.dumps({"budget_cents": cents, "log": []}, indent=2) + "\n"
    )
    result_json(True, path=str(BUDGET_FILE), budget_cents=cents, spent_cents=0,
                remaining_cents=cents)


def budget_status() -> None:
    """Report budget/spent/remaining, or a clear message when no budget is set."""
    budget = _load_budget()
    if budget is None:
        result_json(True, configured=False,
                    note=f"no budget file at {BUDGET_FILE}; spending is uncapped")
        return
    ceiling = budget.get("budget_cents", 0)
    spent = _spent(budget)
    result_json(True, configured=True, budget_cents=ceiling, spent_cents=spent,
                remaining_cents=ceiling - spent)


# --- Environment check ---------------------------------------------------------

# (env var, service label, install hint, what it unlocks)
PROVIDERS = [
    ("GOOGLE_API_KEY", "Gemini", "pip install google-genai pillow", "precise images (image --model gemini)"),
    ("XAI_API_KEY", "xAI Grok", "pip install requests", "cheap images + video (image --model grok, video)"),
    ("TRIPO3D_API_KEY", "Tripo3D", "pip install tripo3d", "image-to-3D GLB (glb)"),
]

# service label -> import names that must all be importable for it to work.
_SDK_IMPORTS = {
    "Gemini": ["google.genai", "PIL"],
    "xAI Grok": ["requests"],
    "Tripo3D": ["tripo3d"],
}


def _can_import(module: str) -> bool:
    import importlib.util
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


def doctor() -> None:
    """Report key + SDK readiness per provider. Always exits 0 (it's a probe).

    Nothing here is fatal: every provider is optional and the pipeline falls
    back to procedural assets, so this reports status rather than failing.
    """
    providers = []
    for env_name, service, hint, unlocks in PROVIDERS:
        raw = os.environ.get(env_name, "").strip()
        if not raw:
            key_state = "missing"
        elif _is_placeholder(raw):
            key_state = "placeholder"
        else:
            key_state = "set"
        sdk_ready = all(_can_import(m) for m in _SDK_IMPORTS.get(service, []))
        providers.append({
            "service": service,
            "env": env_name,
            "key": key_state,
            "sdk_installed": sdk_ready,
            "ready": key_state == "set" and sdk_ready,
            "unlocks": unlocks,
            "install_hint": hint,
        })
    ready = [p["service"] for p in providers if p["ready"]]
    result_json(
        True,
        python=sys.version.split()[0],
        providers=providers,
        ready_services=ready,
        note=("no providers fully configured; the pipeline will use procedural "
              "stand-in assets") if not ready else "",
    )


# --- Image backends ------------------------------------------------------------

def gen_image_gemini(prompt: str, out: Path, size: str, aspect: str, ref: Path | None) -> None:
    cost = GEMINI_COSTS.get(size, 7)
    check_budget(cost)
    key = require_key("GOOGLE_API_KEY", "Gemini")
    try:
        from google import genai
        from google.genai import types
        from PIL import Image
    except ImportError as e:
        fail(f"Gemini deps missing ({e}). pip install google-genai pillow")

    client = genai.Client(api_key=key)
    parts: list[object] = [prompt]
    if ref is not None:
        parts.append(Image.open(ref))
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=aspect),
    )
    resp = client.models.generate_content(model=GEMINI_MODEL, contents=parts, config=config)
    candidates = getattr(resp, "candidates", None) or []
    if not candidates:
        fail("Gemini returned no candidates")
    for part in candidates[0].content.parts:
        if getattr(part, "inline_data", None) is not None:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(part.inline_data.data)
            record_spend(cost, "gemini")
            result_json(True, str(out), cost)
            return
    fail("Gemini returned no image data")


def gen_image_grok(prompt: str, out: Path, aspect: str) -> None:
    check_budget(GROK_IMAGE_COST)
    key = require_key("XAI_API_KEY", "xAI Grok")
    try:
        import requests
    except ImportError as e:
        fail(f"requests missing ({e}). pip install requests")

    def retryable(r) -> bool:
        return r.status_code == 429 or r.status_code >= 500

    resp = with_retry(
        lambda: requests.post(
            "https://api.x.ai/v1/images/generations",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": GROK_IMAGE_MODEL, "prompt": prompt, "aspect_ratio": aspect, "n": 1},
            timeout=120,
        ),
        is_retryable=retryable,
    )
    if not resp.ok:
        fail(f"Grok image error ({resp.status_code}): {resp.text[:200]}")
    data = resp.json()
    items = data.get("data") or []
    if not items:
        fail(f"Grok returned no image data: {json.dumps(data)[:200]}")
    url = items[0].get("url")
    b64 = items[0].get("b64_json")
    out.parent.mkdir(parents=True, exist_ok=True)
    if b64:
        import base64
        out.write_bytes(base64.b64decode(b64))
    elif url:
        img = with_retry(
            lambda: requests.get(url, timeout=120),
            is_retryable=retryable,
        )
        out.write_bytes(img.content)
    else:
        fail("Grok returned neither url nor b64_json")
    record_spend(GROK_IMAGE_COST, "grok")
    result_json(True, str(out), GROK_IMAGE_COST)


def gen_video_grok(prompt: str, out: Path, ref: Path, duration: int) -> None:
    cost = GROK_VIDEO_COST_PER_SEC * duration
    check_budget(cost)
    require_key("XAI_API_KEY", "xAI Grok")
    # Video generation is provider-specific and long-running; left as a clearly
    # marked stub so the dependency surface and cost model are documented without
    # shipping an unverified API integration. Wire to the xAI video endpoint when
    # you have a key to test against.
    fail(
        "video generation is not implemented in this generator stub "
        f"(would cost {cost}¢ for {duration}s). Provide a walk-cycle as frames or a GLB instead."
    )


def gen_glb_tripo(image: Path, out: Path) -> None:
    check_budget(GLB_COST)
    require_key("TRIPO3D_API_KEY", "Tripo3D")
    if not image.is_file():
        fail(f"input image not found: {image}")
    fail(
        "GLB generation is not implemented in this generator stub "
        f"(would cost {GLB_COST}¢). Use a primitive-built mesh in scene.ts as a stand-in."
    )


# --- CLI -----------------------------------------------------------------------

def estimate_for(args: argparse.Namespace) -> int:
    """Cost in cents for a generation command, without calling any provider."""
    if args.cmd == "image":
        return GEMINI_COSTS.get(args.size, 7) if args.model == "gemini" else GROK_IMAGE_COST
    if args.cmd == "video":
        return GROK_VIDEO_COST_PER_SEC * args.duration
    if args.cmd == "glb":
        return GLB_COST
    raise ValueError(f"no cost model for {args.cmd!r}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="godogen asset generator")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_img = sub.add_parser("image", help="generate a PNG")
    p_img.add_argument("--prompt", required=True)
    p_img.add_argument("-o", "--out", required=True)
    p_img.add_argument("--model", choices=["grok", "gemini"], default="grok")
    p_img.add_argument("--size", choices=["512", "1K", "2K", "4K"], default="1K")
    p_img.add_argument("--aspect-ratio", default="1:1")
    p_img.add_argument("--image", help="reference image for image-to-image (gemini)")
    p_img.add_argument("--estimate", action="store_true",
                       help="print cost in cents and exit without generating")

    p_vid = sub.add_parser("video", help="generate an MP4 from a reference image")
    p_vid.add_argument("--prompt", required=True)
    p_vid.add_argument("-o", "--out", required=True)
    p_vid.add_argument("--image", required=True)
    p_vid.add_argument("--duration", type=int, default=2)
    p_vid.add_argument("--estimate", action="store_true",
                       help="print cost in cents and exit without generating")

    p_glb = sub.add_parser("glb", help="convert a PNG to a GLB")
    p_glb.add_argument("--image", required=True)
    p_glb.add_argument("-o", "--out", required=True)
    p_glb.add_argument("--estimate", action="store_true",
                       help="print cost in cents and exit without generating")

    p_bud = sub.add_parser("budget", help="manage the optional spend ceiling")
    bud_sub = p_bud.add_subparsers(dest="budget_cmd", required=True)
    p_bud_init = bud_sub.add_parser("init", help="create/reset the spend ceiling")
    p_bud_init.add_argument("--cents", type=int, required=True, help="ceiling in cents")
    bud_sub.add_parser("status", help="show budget / spent / remaining")

    sub.add_parser("doctor", help="check provider keys + SDKs are configured")

    args = parser.parse_args()

    # Any unexpected error (network failure, SDK exception, bad provider
    # response) is converted to the same {ok:false, error} JSON contract the
    # rest of the tool uses, so the pipeline can fall back to procedural assets
    # instead of seeing a raw traceback. SystemExit from fail()/argparse and
    # KeyboardInterrupt are BaseExceptions, so they pass through untouched.
    try:
        if args.cmd == "doctor":
            doctor()
            return

        if args.cmd == "budget":
            if args.budget_cmd == "init":
                budget_init(args.cents)
            else:
                budget_status()
            return

        if getattr(args, "estimate", False):
            emit_estimate(estimate_for(args), args.cmd)

        if args.cmd == "image":
            if args.model == "gemini":
                gen_image_gemini(
                    args.prompt, Path(args.out), args.size, args.aspect_ratio,
                    Path(args.image) if args.image else None,
                )
            else:
                gen_image_grok(args.prompt, Path(args.out), args.aspect_ratio)
        elif args.cmd == "video":
            gen_video_grok(args.prompt, Path(args.out), Path(args.image), args.duration)
        elif args.cmd == "glb":
            gen_glb_tripo(Path(args.image), Path(args.out))
    except Exception as e:  # noqa: BLE001 — deliberate catch-all at the CLI boundary
        fail(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
