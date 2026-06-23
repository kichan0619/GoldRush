#!/usr/bin/env python3
"""Merge a Stop hook entry into a Claude Code settings.json.

Claude Code reads hooks from ``<HOOK_CONFIG_DIR>/settings.json``. This helper
adds (idempotently) a Stop hook that runs the given hook script, without
clobbering any hooks the target repo already configures.

Usage:
    merge_claude_stop_hook.py <hook_config_dir> <hook_script_name>

e.g. merge_claude_stop_hook.py /path/to/game/.claude stop_post_task_gate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    config_dir = Path(sys.argv[1])
    hook_script = sys.argv[2]
    settings_path = config_dir / "settings.json"

    command = f"python3 \"$CLAUDE_PROJECT_DIR/{config_dir.name}/hooks/{hook_script}\""

    settings: dict = {}
    if settings_path.is_file():
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"error: {settings_path} is not valid JSON", file=sys.stderr)
            sys.exit(1)

    hooks = settings.setdefault("hooks", {})
    stop_entries = hooks.setdefault("Stop", [])

    # Skip if our command is already wired up.
    for entry in stop_entries:
        for h in entry.get("hooks", []):
            if h.get("command") == command:
                print(f"[stop-hook] already present in {settings_path}")
                return

    stop_entries.append({"hooks": [{"type": "command", "command": command}]})
    settings_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(f"[stop-hook] added Stop hook to {settings_path}")


if __name__ == "__main__":
    main()
