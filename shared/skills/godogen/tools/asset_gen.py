#!/usr/bin/env python3
"""Asset Generator CLI — text-to-image (Gemini / xAI Grok), image-to-3D (Tripo3D).

Subcommands:
  image   Generate a PNG from a prompt. --model grok (cheap) | gemini (precise).
  video   Generate an MP4 from a prompt + reference image (Grok).
  glb     Convert a PNG to a static GLB (Tripo3D).

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


def result_json(ok: bool, path: str | None = None, cost_cents: int = 0, error: str | None = None) -> None:
    out: dict[str, object] = {"ok": ok, "cost_cents": cost_cents}
    if path:
        out["path"] = path
    if error:
        out["error"] = error
    print(json.dumps(out))


def fail(message: str) -> None:
    result_json(False, error=message)
    sys.exit(1)


def require_key(env_name: str, service: str) -> str:
    key = os.environ.get(env_name, "").strip()
    placeholderish = (not key) or key.lower().startswith("your-") or key.endswith("-here")
    if placeholderish:
        fail(
            f"{service} needs {env_name}. Set a real key in .env "
            f"(copy .env.example). Falling back to procedural assets is fine."
        )
    return key


# --- Budget helpers ------------------------------------------------------------

def _load_budget() -> dict | None:
    if not BUDGET_FILE.exists():
        return None
    return json.loads(BUDGET_FILE.read_text())


def check_budget(cost_cents: int) -> None:
    budget = _load_budget()
    if budget is None:
        return
    spent = sum(v for entry in budget.get("log", []) for v in entry.values())
    remaining = budget.get("budget_cents", 0) - spent
    if cost_cents > remaining:
        fail(f"Budget exceeded: need {cost_cents}¢, only {remaining}¢ left ({spent}¢ spent)")


def record_spend(cost_cents: int, service: str) -> None:
    budget = _load_budget()
    if budget is None:
        return
    budget.setdefault("log", []).append({service: cost_cents})
    BUDGET_FILE.write_text(json.dumps(budget, indent=2) + "\n")


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
    for part in resp.candidates[0].content.parts:
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

    resp = requests.post(
        "https://api.x.ai/v1/images/generations",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": GROK_IMAGE_MODEL, "prompt": prompt, "aspect_ratio": aspect, "n": 1},
        timeout=120,
    )
    if not resp.ok:
        fail(f"Grok image error ({resp.status_code}): {resp.text[:200]}")
    data = resp.json()
    url = data.get("data", [{}])[0].get("url")
    b64 = data.get("data", [{}])[0].get("b64_json")
    out.parent.mkdir(parents=True, exist_ok=True)
    if b64:
        import base64
        out.write_bytes(base64.b64decode(b64))
    elif url:
        img = requests.get(url, timeout=120)
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

    p_vid = sub.add_parser("video", help="generate an MP4 from a reference image")
    p_vid.add_argument("--prompt", required=True)
    p_vid.add_argument("-o", "--out", required=True)
    p_vid.add_argument("--image", required=True)
    p_vid.add_argument("--duration", type=int, default=2)

    p_glb = sub.add_parser("glb", help="convert a PNG to a GLB")
    p_glb.add_argument("--image", required=True)
    p_glb.add_argument("-o", "--out", required=True)

    args = parser.parse_args()

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


if __name__ == "__main__":
    main()
