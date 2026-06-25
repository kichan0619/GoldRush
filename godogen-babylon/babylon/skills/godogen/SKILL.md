---
name: godogen
display_name: Godogen
short_description: Generate or update complete Babylon.js browser games
default_prompt: "Use ${GODOGEN_COMMAND} to build or update this Babylon.js browser game from a natural-language design brief."
description: |
  Generate or update a complete Babylon.js browser game from a natural-language description. Use when the user wants ${AGENT_NAME} to make, rebuild, or substantially extend a Babylon.js project end to end.
---

# Babylon Game Generator

Generate and update Babylon.js browser games from natural language.

## Stage files

Read each stage file from `${GODOGEN_SKILL_DIR}/` **only when you reach that
stage** — don't preload them all.

| File | Purpose | When to read |
|------|---------|--------------|
| `visual-target.md` | Reference image + art direction | Pipeline start |
| `decomposer.md` | Risk-ordered task plan → PLAN.md | After visual target |
| `scaffold.md` | Vite/Babylon project shell | After decomposition |
| `architecture.md` | Babylon gameplay architecture stance | Before designing game code |
| `asset-planner.md` | Budget + plan assets | Only if a budget is provided |
| `asset-gen.md` | Asset generation CLI reference | When generating assets |
| `rembg.md` | Background removal | Only when an asset needs transparency |
| `task-execution.md` | Task workflow + commands | Before the first task |
| `quirks.md` | Babylon/browser gotchas | Before writing code |
| `scene-generation.md` | Scene/world implementation patterns | When creating/replacing the scene |
| `capture.md` | Browser screenshot/video capture | Before screenshots or video |
| *(babylon-help skill)* | Babylon/Vite/browser API lookup | For Babylon-specific questions |

## Pipeline

```text
User request
  |
  +- PLAN.md exists? (resume check)
  |    +- yes: read PLAN.md, STRUCTURE.md, MEMORY.md, ASSETS.md if present -> jump to task execution
  |    +- no:  run the fresh pipeline below
  |
  +- Visual target      -> reference.png + ASSETS.md (art direction)
  +- Decompose          -> PLAN.md (risks + verification criteria + tasks)
  +- Scaffold/refresh   -> package.json + src/ + STRUCTURE.md
  |
  +- If budget provided (and no asset manifest yet):
  |    +- Plan + generate assets -> ASSETS.md manifest + PLAN.md asset assignments
  |
  +- Start Vite dev server at http://127.0.0.1:5173
  +- Run risk spikes first, then the main build, smallest visible slice at a time
  +- Screenshot frequently while iterating; fix what the frames show
  +- When presentation media is required:
       +- Record browser video -> screenshots/result/{N}/video.mp4
```

## Execution contract

- Keep `npm run dev` alive at `http://127.0.0.1:5173`; Vite hot reload is the
  inner loop. Edit `src/game/**` → scene reloads → capture/inspect.
- `createScene(engine, canvas) -> { scene, state }` in `src/game/scene.ts` is
  the contract the app and HMR depend on. Keep the signature stable.
- Run `npm run check` before larger edits and `npm run build` before final media.
- Chrome/Chromium + WebGL2 are required for capture. If missing, **stop and
  report** the missing dependency rather than working around it.

## Visual verification (the core rule)

Do not trust code alone. Verify visible work in the browser with screenshots or
recorded video. **When code and media disagree, trust the media.** If a
requirement is not visible in browser capture, treat it as unfinished and make
it the next task.

## Context hygiene

Keep state in files, not in the conversation:

- `PLAN.md` — task statuses + verification criteria
- `STRUCTURE.md` — architecture/module ownership reference
- `MEMORY.md` — discoveries, quirks, what worked or failed
- `ASSETS.md` — art direction + asset manifest

Update the relevant file after each completed task.

## Babylon help

Use `${BABYLON_HELP_COMMAND}` for Babylon API questions, loader behavior, exact
import paths, Vite integration, or capture issues. Prefer the installed
`@babylonjs/*` package types for the project's version, then official docs.
