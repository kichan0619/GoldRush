#!/usr/bin/env python3
"""Inject Claude Code lookup frontmatter into a helper SKILL.md.

Claude Code reads a skill's YAML frontmatter to decide when to surface it. The
``babylon-help`` skill is a reference/lookup skill (not a pipeline entrypoint),
so when publishing for Claude we add a ``lookup: true`` marker plus a couple of
trigger hints. Codex ignores this and uses generate_codex_metadata.py instead.

Usage:
    inject_claude_lookup_frontmatter.py <path-to-SKILL.md>

Idempotent: re-running on an already-injected file leaves it unchanged.
"""

from __future__ import annotations

import sys
from pathlib import Path

MARKER = "lookup: true"
INJECT = (
    "lookup: true\n"
    "lookup_hint: Babylon.js / Vite / browser API questions, import paths, "
    "loader behavior, capture issues\n"
)


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"error: {path} not found", file=sys.stderr)
        sys.exit(1)

    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"[frontmatter] already present in {path}")
        return

    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        # No frontmatter block — create one.
        new = "---\n" + INJECT + "---\n\n" + text
        path.write_text(new, encoding="utf-8")
        print(f"[frontmatter] created frontmatter in {path}")
        return

    # Find the closing fence of the existing frontmatter and inject before it.
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            lines.insert(i, INJECT)
            path.write_text("".join(lines), encoding="utf-8")
            print(f"[frontmatter] injected lookup frontmatter into {path}")
            return

    print(f"error: unterminated frontmatter in {path}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
