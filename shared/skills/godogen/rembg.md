# Stage: Background Removal (rembg)

**When:** only when a generated asset needs a transparent cut-out (sprites,
props, item icons placed over a scene).

## Strategy: generate on a solid background first

Cut-out quality depends almost entirely on the source. Generate the asset on a
**solid, high-contrast background** the subject never contains:

- Subject is warm/bright → use a solid dark-green or deep-blue background.
- Subject is cool/dark → use a solid magenta or bright-green background.

Put the background color in the prompt explicitly, e.g. `"... , solid
dark-green background, centered, full subject visible"`.

## Remove the background

Using the `rembg` tool (install separately: `pip install rembg onnxruntime`):

```bash
rembg i src/assets/textures/sprite_raw.png src/assets/textures/sprite.png
```

For a chroma-key style background you chose deliberately, a color-key pass is
often cleaner than a learned matte — but `rembg` handles most game sprites well.

## Troubleshooting

- **Halos / fringe:** the background wasn't solid enough, or the subject shares
  the background color. Regenerate with a more contrasting background.
- **Subject edges eaten:** subject too close to frame edge — regenerate with
  "centered, full subject visible, margin around subject".
- **Batch:** loop over a directory; keep raw inputs outside `src/assets/**` so
  only the cleaned outputs are bundled at runtime.

## Placement

Save the cleaned, transparent PNG under `src/assets/**` and import with `?url`.
Keep the `*_raw.png` source outside runtime paths.
