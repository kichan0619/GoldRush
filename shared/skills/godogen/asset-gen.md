# Stage: Asset Generation (CLI reference)

**When:** generating assets, after `asset-planner.md` produced a manifest.

Generate PNG images (Gemini or xAI Grok) and GLB models (Tripo3D) from text.
The CLI lives at `${GODOGEN_SKILL_DIR}/tools/asset_gen.py`. Run from the repo
root. **All keys come from `.env` / the environment** — see `.env.example`.

> If keys are missing, the CLI exits with a clear JSON error. That is the signal
> to fall back to procedural stand-ins, not to retry.

## Models

| Model | Flag | Cost | Best for |
|-------|------|------|----------|
| `grok-imagine-image` | `--model grok` | 2¢ | textures, simple objects, props, abstract backgrounds |
| `gemini-3.1-flash-image-preview` | `--model gemini` | 5–15¢ (by size) | references, characters, precise layout |

**Grok** is cheap and high-quality but imprecise — great when exact adherence
doesn't matter. **Gemini** reliably follows the prompt — use it when precision
matters. Default is `grok`.

### Gemini sizes / cost

| `--size` | cost |
|------|------|
| `512` | 5¢ |
| `1K` | 7¢ |
| `2K` | 10¢ |
| `4K` | 15¢ |

## Generate an image

```bash
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py image \
  --prompt "the full prompt" -o src/assets/textures/car.png
```

- `--model` (default `grok`): `grok` (2¢) | `gemini` (5–15¢)
- `--size` (default `1K`): Grok `1K`/`2K`; Gemini `512`/`1K`/`2K`/`4K`
- `--aspect-ratio` (default `1:1`): both support `1:1 16:9 9:16 4:3 3:4 3:2 2:3`
- `--image <path>`: reference for image-to-image edits (Gemini)

Typical combos:
- `--model gemini --size 1K` — references, character sprites (7¢)
- `--model gemini --size 2K --aspect-ratio 16:9` — backgrounds, title screens (10¢)
- `--model grok` — textures, props, item kits (2¢)

## Output placement

Runtime-loaded outputs go under `src/assets/**` (imported via Vite `?url`) or
`public/**` when a stable direct URL is needed. Keep references, prompt scratch,
and debug crops OUT of those runtime paths.

```ts
import carUrl from "../assets/textures/car.png?url";
```

## Transparency

For sprites/props that need a cut-out, generate on a solid contrasting
background, then read `rembg.md` to remove it.

## Video / GLB

`video` and `glb` subcommands document the cost model and dependency surface but
are stubs in this generator — they exit with a clear message. Prefer a frame
sequence or a primitive-built mesh as a stand-in until you wire the provider
endpoints against real keys.

## Check what's configured

Before generating, `doctor` reports which providers are usable (key set + SDK
installed) without needing any key or network:

```bash
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py doctor
# {"ok": true, "ready_services": ["xAI Grok"], "providers": [...]}
```

Use `ready_services` to pick a model that will actually work; if it's empty,
go straight to procedural stand-ins.

## Estimate cost before spending

Any generation subcommand accepts `--estimate` to print the cost in cents and
exit **without** calling a provider (no key required). Use it to plan a batch
before committing spend:

```bash
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py image --model gemini --size 2K \
  --prompt x -o x.png --estimate
# {"ok": true, "cost_cents": 10, "estimate": true, "service": "image"}
```

## Optional spend ceiling

Set a budget so generations stop once a ceiling is hit (otherwise spending is
uncapped):

```bash
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py budget init --cents 500
python3 ${GODOGEN_SKILL_DIR}/tools/asset_gen.py budget status
# {"ok": true, "configured": true, "budget_cents": 500, "spent_cents": 0, "remaining_cents": 500}
```

Once set, every `image`/`gemini` generation is checked against the remaining
balance and logged. When a request would exceed it, the CLI fails with a clear
`Budget exceeded` JSON error — the signal to fall back to procedural assets.

