# Stage: Visual Target

**When:** pipeline start, before decomposition.

Establish what the finished game should *look like* before writing any code, so
every later iteration has a concrete reference to judge frames against.

## Output

1. `reference.png` — a single reference image capturing the intended art
   direction (palette, mood, camera, key shapes). Keep it at the repo root or
   under a non-runtime path (NOT `src/assets/**`).
2. `ASSETS.md` — art-direction notes (not the full asset manifest yet):
   - palette (3–6 hex colors)
   - visual style (e.g. "low-poly flat-shaded", "neon wireframe", "soft pastel")
   - camera framing (top-down, third-person chase, side 2.5D)
   - mood / lighting

## How

If asset-gen keys are configured, generate the reference with Gemini (precise):

```bash
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py image \
  --model gemini --size 2K --aspect-ratio 16:9 \
  --prompt "<one rich paragraph: subject, setting, style, lighting, camera>" \
  -o reference.png
```

If no keys are set, **skip generation** and instead write the art-direction
decisions directly into `ASSETS.md` as text. The pipeline must work key-free;
the reference image is a helpful anchor, not a hard requirement.

## Guidance

- One coherent look. Resist listing five styles — pick one and commit.
- Tie the palette to gameplay readability (player vs hazard vs pickup must be
  distinguishable at a glance).
- This stage is art direction only. Concrete per-asset planning happens later in
  `asset-planner.md` (and only if a budget is provided).
