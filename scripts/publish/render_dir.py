#!/usr/bin/env python3
"""Render template variables across every file in a directory tree, in place.

publish.sh stages the skill/scaffold files into a temp dir, then calls this to
substitute ``${VAR}`` placeholders with the engine/agent-specific values for the
chosen publish target (e.g. ``${AGENT_NAME}`` -> ``Claude``).

Usage:
    render_dir.py <dir> KEY=VALUE [KEY=VALUE ...]

Rules:
- Only ``${KEY}`` placeholders whose KEY is passed on the command line are
  replaced. Any other ``${...}`` text is left untouched, so shell snippets and
  TS template literals in the scaffold survive verbatim.
- Binary files (anything that is not valid UTF-8) are skipped, so images and
  other assets in the scaffold pass through unharmed.
"""

from __future__ import annotations

import sys
from pathlib import Path


def parse_vars(pairs: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            print(f"error: expected KEY=VALUE, got {pair!r}", file=sys.stderr)
            sys.exit(2)
        key, value = pair.split("=", 1)
        key = key.strip()
        if not key:
            print(f"error: empty key in {pair!r}", file=sys.stderr)
            sys.exit(2)
        out[key] = value
    return out


def render_text(text: str, variables: dict[str, str]) -> str:
    # Replace longest keys first so a key that is a prefix of another (e.g. FOO
    # vs FOOBAR) can't shadow it.
    for key in sorted(variables, key=len, reverse=True):
        text = text.replace("${" + key + "}", variables[key])
    return text


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        sys.exit(1)

    variables = parse_vars(sys.argv[2:])

    rendered = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable — leave as-is
        updated = render_text(original, variables)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            rendered += 1

    print(f"[render_dir] rendered {rendered} file(s) under {root}")


if __name__ == "__main__":
    main()
