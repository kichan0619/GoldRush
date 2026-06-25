# Stage: Decomposer

**When:** after the visual target, before scaffolding.

Turn the design brief into a risk-ordered task plan and explicit verification
criteria. Output is `PLAN.md` at the repo root.

## PLAN.md structure

```markdown
# PLAN

## Game
<2-3 sentence summary of the game and its core loop>

## Verification criteria
<bullet list of what must be visibly true in browser capture for "done">
- e.g. "player kart drives and turns with arrow keys, visible in video"
- e.g. "lap counter increments when crossing the start line"
- e.g. "3 laps ends the race and shows a finish state"

## Risks (do these first)
<the parts most likely to break or invalidate the whole approach>
- R1: <risk> — spike: <smallest test that proves it works>
- R2: ...

## Tasks
- [ ] T1 <task> — verify: <browser-visible check>
- [ ] T2 ...

## Status log
<append-only notes as tasks complete>
```

## Method

1. **Identify risks first.** What, if it doesn't work, makes the whole game
   impossible? (physics feel, a loader, performance with N entities, input
   latency.) Schedule a tiny spike for each risk before the main build.
2. **Slice into visible increments.** Every task should change something
   observable in the browser. Avoid "set up architecture" tasks with no visible
   output — fold that into the first visible slice.
3. **Write verification as browser-observable facts.** "Compiles" is never a
   criterion. Each task names what a screenshot or video must show.
4. **Order:** risk spikes → core loop → content → polish → final video.

## Rules

- Keep `PLAN.md` the single source of truth for task status. Update it as you go.
- If the brief is ambiguous, make a reasonable call, record it in the Game
  section, and proceed — don't stall the pipeline on clarification.
