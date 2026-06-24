#!/usr/bin/env python3
"""Test suite for the godogen-babylon generator.

Stdlib unittest only — no pip dependencies, so CI needs nothing but Python 3.
Run from the repo root:

    python3 -m unittest discover -s test -v
    # or
    python3 test/test_generator.py

Covers the parts that would silently break a publish: template rendering, the
Claude stop-hook merge, frontmatter injection, .env loading + placeholder
rejection in the asset CLI, and a real end-to-end publish.sh run.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HELPERS = REPO / "scripts" / "publish"
ASSET_GEN = REPO / "shared" / "skills" / "godogen" / "tools" / "asset_gen.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class RenderDirTest(unittest.TestCase):
    def setUp(self):
        self.render = load_module("render_dir", HELPERS / "render_dir.py")
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_substitutes_known_vars(self):
        out = self.render.render_text("hi ${NAME}", {"NAME": "Claude"})
        self.assertEqual(out, "hi Claude")

    def test_leaves_unknown_placeholders_untouched(self):
        # Shell snippets like ${1:-x} must survive.
        out = self.render.render_text("${KNOWN} and ${UNKNOWN}", {"KNOWN": "x"})
        self.assertEqual(out, "x and ${UNKNOWN}")

    def test_longest_key_first(self):
        # FOO must not shadow FOOBAR.
        out = self.render.render_text("${FOOBAR}", {"FOO": "a", "FOOBAR": "b"})
        self.assertEqual(out, "b")

    def test_renders_files_in_tree_and_skips_binary(self):
        (self.tmp / "a.md").write_text("agent: ${AGENT_NAME}", encoding="utf-8")
        (self.tmp / "img.bin").write_bytes(b"\x00\x01\x02\xff\xfe")
        subprocess.run(
            [sys.executable, str(HELPERS / "render_dir.py"), str(self.tmp), "AGENT_NAME=Claude"],
            check=True, capture_output=True,
        )
        self.assertEqual((self.tmp / "a.md").read_text(encoding="utf-8"), "agent: Claude")
        self.assertEqual((self.tmp / "img.bin").read_bytes(), b"\x00\x01\x02\xff\xfe")


class StopHookMergeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg = self.tmp / ".claude"
        (self.cfg / "hooks").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self):
        subprocess.run(
            [sys.executable, str(HELPERS / "merge_claude_stop_hook.py"), str(self.cfg), "stop_post_task_gate.py"],
            check=True, capture_output=True,
        )

    def test_creates_settings_with_stop_hook(self):
        self._run()
        settings = json.loads((self.cfg / "settings.json").read_text())
        cmds = [h["command"] for e in settings["hooks"]["Stop"] for h in e["hooks"]]
        self.assertTrue(any("stop_post_task_gate.py" in c for c in cmds))

    def test_idempotent(self):
        self._run()
        self._run()
        settings = json.loads((self.cfg / "settings.json").read_text())
        self.assertEqual(len(settings["hooks"]["Stop"]), 1)

    def test_preserves_existing_hooks(self):
        (self.cfg / "settings.json").write_text(json.dumps({
            "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo existing"}]}]}
        }))
        self._run()
        settings = json.loads((self.cfg / "settings.json").read_text())
        cmds = [h["command"] for e in settings["hooks"]["Stop"] for h in e["hooks"]]
        self.assertIn("echo existing", cmds)
        self.assertTrue(any("stop_post_task_gate.py" in c for c in cmds))


class FrontmatterInjectTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, path: Path):
        subprocess.run(
            [sys.executable, str(HELPERS / "inject_claude_lookup_frontmatter.py"), str(path)],
            check=True, capture_output=True,
        )

    def test_injects_into_existing_frontmatter(self):
        f = self.tmp / "SKILL.md"
        f.write_text("---\nname: babylon-help\n---\n\n# body\n", encoding="utf-8")
        self._run(f)
        self.assertIn("lookup: true", f.read_text(encoding="utf-8"))

    def test_idempotent(self):
        f = self.tmp / "SKILL.md"
        f.write_text("---\nname: x\n---\n", encoding="utf-8")
        self._run(f)
        once = f.read_text(encoding="utf-8")
        self._run(f)
        self.assertEqual(once, f.read_text(encoding="utf-8"))


class AssetGenEnvTest(unittest.TestCase):
    def setUp(self):
        self.asset = load_module("asset_gen", ASSET_GEN)
        self.tmp = Path(tempfile.mkdtemp())
        self.cwd = os.getcwd()
        os.chdir(self.tmp)
        # Don't let a real ambient key mask the test.
        self.saved = os.environ.pop("GOOGLE_API_KEY", None)

    def tearDown(self):
        os.chdir(self.cwd)
        if self.saved is not None:
            os.environ["GOOGLE_API_KEY"] = self.saved
        else:
            os.environ.pop("GOOGLE_API_KEY", None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_loads_dotenv(self):
        (self.tmp / ".env").write_text("GOOGLE_API_KEY=real-key-123\n", encoding="utf-8")
        self.asset.load_dotenv()
        self.assertEqual(os.environ.get("GOOGLE_API_KEY"), "real-key-123")

    def test_existing_env_wins_over_dotenv(self):
        os.environ["GOOGLE_API_KEY"] = "from-env"
        (self.tmp / ".env").write_text("GOOGLE_API_KEY=from-file\n", encoding="utf-8")
        self.asset.load_dotenv()
        self.assertEqual(os.environ["GOOGLE_API_KEY"], "from-env")

    def test_placeholder_value_rejected(self):
        os.environ["GOOGLE_API_KEY"] = "your-gemini-api-key-here"
        with self.assertRaises(SystemExit):
            self.asset.require_key("GOOGLE_API_KEY", "Gemini")

    def test_blank_value_rejected(self):
        os.environ.pop("GOOGLE_API_KEY", None)
        with self.assertRaises(SystemExit):
            self.asset.require_key("GOOGLE_API_KEY", "Gemini")

    def test_real_value_accepted(self):
        os.environ["GOOGLE_API_KEY"] = "sk-real-value"
        self.assertEqual(self.asset.require_key("GOOGLE_API_KEY", "Gemini"), "sk-real-value")


class PublishEndToEndTest(unittest.TestCase):
    """Run the real publish.sh and assert the produced game repo is correct."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_publish_produces_rendered_game_repo(self):
        target = self.tmp / "game"
        result = subprocess.run(
            ["bash", str(REPO / "publish.sh"), "--agent", "claude", "--out", str(target)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

        # Expected structure
        for rel in [
            "CLAUDE.md",
            ".claude/skills/godogen/SKILL.md",
            ".claude/skills/babylon-help/SKILL.md",
            ".claude/hooks/capture_result.sh",
            "package.json",
            "src/main.ts",
            "scripts/setup-env.mjs",
            ".env.example",
        ]:
            self.assertTrue((target / rel).is_file(), f"missing {rel}")

        # Template variables must be rendered, none left raw
        skill = (target / ".claude/skills/godogen/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("/godogen", skill)
        self.assertNotIn("${AGENT_NAME}", skill)
        self.assertNotIn("${GODOGEN_COMMAND}", skill)
        self.assertNotIn("${GODOGEN_SKILL_DIR}", skill)

        manifest = (target / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("Claude", manifest)
        self.assertNotIn("${", manifest.replace("${1", "").replace("${2", ""))

        # .env.example must stay placeholder-only (no real keys leaked)
        env_example = (target / ".env.example").read_text(encoding="utf-8")
        self.assertIn("your-gemini-api-key-here", env_example)

    def test_publish_rejects_unknown_engine(self):
        result = subprocess.run(
            ["bash", str(REPO / "publish.sh"), "--engine", "godot", "--out", str(self.tmp / "x")],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
