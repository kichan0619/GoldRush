# Stage: Asset Planner

**When:** only if a budget is provided, after scaffolding and before generating
assets. If no budget is given, skip this stage and use procedural stand-ins
(primitives, vertex colors, simple materials).

Plan the concrete asset list and assign a spend before generating anything.

## Budget file

Create `assets/budget.json` so `asset_gen.py` enforces and logs spend:

```json
{
  "budget_cents": 200,
  "log": []
}
```

Every generation checks remaining budget and appends to `log`. When the budget
is exhausted, generation fails cleanly and you fall back to procedural assets.

## Plan into ASSETS.md

Extend `ASSETS.md` (created in the visual-target stage) with an asset manifest:

```markdown
## Asset manifest
| id | kind | path | model | est ¢ | prompt |
|----|------|------|-------|-------|--------|
| kart | image | src/assets/textures/kart.png | grok | 2 | "..." |
| track_bg | image | public/track_bg.png | gemini 2K | 10 | "..." |
| hero | glb | src/assets/models/hero.glb | tripo3d | 30 | from hero_ref.png |
```

## Allocation rules

- **Grok (2¢)** for textures, simple objects, item kits, abstract backgrounds —
  anywhere exact prompt adherence doesn't matter.
- **Gemini (5–15¢)** for anything that must match a precise description:
  references, characters, layout-sensitive backgrounds, 3D reference frames.
- Generate references **once**, reuse across poses/variants.
- Leave headroom — don't plan to the last cent. Procedural stand-ins are an
  acceptable fallback for low-importance assets.

Read `asset-gen.md` for the exact CLI once the plan is set.
