# Decompose → PLAN.md

Turn the user's brief into a risk-ordered plan before writing any Solidity.

## Output: PLAN.md

Write `PLAN.md` with these sections:

1. **Game** — one paragraph: what the game is, who the players are, how a turn
   works, and how it ends (win/draw conditions). Restate it in your own words so
   the rules are unambiguous before you encode them.
2. **On-chain state** — the minimal state the contract must hold: board/grid,
   whose turn, players, status, counters. Prefer the smallest representation
   (packed structs, fixed arrays) — every slot costs gas.
3. **Moves / transitions** — each action a player can take, and for each: the
   preconditions the contract MUST validate (caller is a player, their turn, the
   move is legal, the game is live) and the state change it makes.
4. **End conditions** — exactly how win and draw are detected on chain.
5. **Risks** (ordered hardest-first) — the parts most likely to be wrong:
   usually win-detection, turn-order enforcement, and draw/edge cases. Spike
   these first.
6. **Evidence criteria** — the concrete checks that mark the game done (mirror
   `eval.md`): which property/invariant tests must exist, the gas ceiling per
   move, "no high/medium Slither findings", and the playthrough assertion.
7. **Tasks** — a checklist, smallest-visible-slice first. Each task names the
   tests that will prove it.

## Rules

- Keep it turn-based and discrete (see SKILL.md constraint). If the brief implies
  real-time/physics, restate it as a turn-based variant and note the adaptation.
- Order tasks so the riskiest rule (e.g. win detection) is validated earliest,
  by tests, before building breadth.
- Don't design the client yet — chain first. The client is downstream of a
  correct, tested contract.
