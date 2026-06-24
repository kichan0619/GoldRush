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


class AssetGenRobustnessTest(unittest.TestCase):
    """The asset CLI must keep its {ok:false, error} contract under bad input."""

    def setUp(self):
        self.asset = load_module("asset_gen", ASSET_GEN)
        self.tmp = Path(tempfile.mkdtemp())
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(ASSET_GEN), *args],
            capture_output=True, text=True, cwd=self.tmp,
        )

    def test_corrupt_budget_file_fails_cleanly(self):
        budget = self.tmp / "assets" / "budget.json"
        budget.parent.mkdir(parents=True)
        budget.write_text("{not valid json", encoding="utf-8")
        with self.assertRaises(SystemExit):
            self.asset.check_budget(1)

    def test_non_object_budget_file_fails_cleanly(self):
        budget = self.tmp / "assets" / "budget.json"
        budget.parent.mkdir(parents=True)
        budget.write_text("[1, 2, 3]", encoding="utf-8")
        with self.assertRaises(SystemExit):
            self.asset.check_budget(1)

    def test_missing_key_emits_json_not_traceback(self):
        # No XAI_API_KEY -> the CLI must print {ok:false,...} JSON, not crash.
        env = {k: v for k, v in os.environ.items() if k != "XAI_API_KEY"}
        result = subprocess.run(
            [sys.executable, str(ASSET_GEN), "image", "--model", "grok",
             "--prompt", "a cat", "-o", "out.png"],
            capture_output=True, text=True, cwd=self.tmp, env=env,
        )
        self.assertNotEqual(result.returncode, 0)
        payload = json.loads(result.stdout.strip())
        self.assertFalse(payload["ok"])
        self.assertIn("XAI_API_KEY", payload["error"])

    def test_stub_video_returns_structured_error(self):
        os.environ["XAI_API_KEY"] = "sk-real-value"
        try:
            with self.assertRaises(SystemExit):
                self.asset.gen_video_grok("walk", Path("out.mp4"), Path("ref.png"), 2)
        finally:
            os.environ.pop("XAI_API_KEY", None)


class BudgetCommandTest(unittest.TestCase):
    """budget init/status must close the spend-tracking loop end to end."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(ASSET_GEN), *args],
            capture_output=True, text=True, cwd=self.tmp,
        )

    def test_status_without_budget_reports_unconfigured(self):
        out = json.loads(self._run("budget", "status").stdout.strip())
        self.assertTrue(out["ok"])
        self.assertFalse(out["configured"])

    def test_init_then_status_roundtrip(self):
        init = json.loads(self._run("budget", "init", "--cents", "500").stdout.strip())
        self.assertEqual(init["budget_cents"], 500)
        self.assertEqual(init["remaining_cents"], 500)
        self.assertTrue((self.tmp / "assets" / "budget.json").is_file())

        status = json.loads(self._run("budget", "status").stdout.strip())
        self.assertTrue(status["configured"])
        self.assertEqual(status["budget_cents"], 500)
        self.assertEqual(status["spent_cents"], 0)

    def test_init_rejects_negative(self):
        self.assertNotEqual(self._run("budget", "init", "--cents", "-1").returncode, 0)

    def test_status_reflects_recorded_spend(self):
        self._run("budget", "init", "--cents", "100")
        # Simulate a generation having charged the budget.
        budget = self.tmp / "assets" / "budget.json"
        data = json.loads(budget.read_text())
        data["log"].append({"grok": 2})
        budget.write_text(json.dumps(data))
        status = json.loads(self._run("budget", "status").stdout.strip())
        self.assertEqual(status["spent_cents"], 2)
        self.assertEqual(status["remaining_cents"], 98)


class EstimateModeTest(unittest.TestCase):
    """--estimate prints the cost and exits 0 without any provider call/key."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, *args):
        # Strip every provider key so a true estimate can't accidentally call out.
        env = {k: v for k, v in os.environ.items()
               if k not in ("XAI_API_KEY", "GOOGLE_API_KEY", "TRIPO3D_API_KEY")}
        return subprocess.run(
            [sys.executable, str(ASSET_GEN), *args],
            capture_output=True, text=True, cwd=self.tmp, env=env,
        )

    def test_grok_image_estimate(self):
        r = self._run("image", "--model", "grok", "--prompt", "x", "-o", "o.png", "--estimate")
        self.assertEqual(r.returncode, 0)
        out = json.loads(r.stdout.strip())
        self.assertTrue(out["ok"] and out["estimate"])
        self.assertEqual(out["cost_cents"], 2)

    def test_gemini_size_estimate(self):
        r = self._run("image", "--model", "gemini", "--size", "4K",
                      "--prompt", "x", "-o", "o.png", "--estimate")
        self.assertEqual(json.loads(r.stdout.strip())["cost_cents"], 15)

    def test_video_duration_estimate(self):
        r = self._run("video", "--prompt", "x", "--image", "r.png",
                      "-o", "o.mp4", "--duration", "3", "--estimate")
        self.assertEqual(json.loads(r.stdout.strip())["cost_cents"], 15)

    def test_glb_estimate(self):
        r = self._run("glb", "--image", "r.png", "-o", "o.glb", "--estimate")
        self.assertEqual(json.loads(r.stdout.strip())["cost_cents"], 30)


class RetryTest(unittest.TestCase):
    """with_retry backs off on transient failures and gives up cleanly."""

    def setUp(self):
        self.asset = load_module("asset_gen", ASSET_GEN)

    def test_retries_then_succeeds(self):
        class Resp:
            def __init__(self, status): self.status_code = status
        calls = {"n": 0}

        def send():
            calls["n"] += 1
            return Resp(503) if calls["n"] < 3 else Resp(200)

        resp = self.asset.with_retry(
            send, is_retryable=lambda r: r.status_code >= 500,
            base_delay=0, sleep=lambda _: None,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(calls["n"], 3)

    def test_returns_last_response_after_exhausting_attempts(self):
        class Resp:
            status_code = 500
        resp = self.asset.with_retry(
            lambda: Resp(), is_retryable=lambda r: True,
            attempts=3, base_delay=0, sleep=lambda _: None,
        )
        self.assertEqual(resp.status_code, 500)

    def test_does_not_retry_permanent_failure(self):
        calls = {"n": 0}

        class Resp:
            status_code = 400

        def send():
            calls["n"] += 1
            return Resp()

        self.asset.with_retry(send, is_retryable=lambda r: r.status_code >= 500,
                              base_delay=0, sleep=lambda _: None)
        self.assertEqual(calls["n"], 1)

    def test_exception_propagates_after_final_attempt(self):
        calls = {"n": 0}

        def send():
            calls["n"] += 1
            raise ConnectionError("boom")

        with self.assertRaises(ConnectionError):
            self.asset.with_retry(send, is_retryable=lambda r: False,
                                  attempts=2, base_delay=0, sleep=lambda _: None)
        self.assertEqual(calls["n"], 2)


class DoctorTest(unittest.TestCase):
    """doctor probes provider readiness without keys or network, never fatal."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, extra_env=None):
        env = {k: v for k, v in os.environ.items()
               if k not in ("XAI_API_KEY", "GOOGLE_API_KEY", "TRIPO3D_API_KEY")}
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            [sys.executable, str(ASSET_GEN), "doctor"],
            capture_output=True, text=True, cwd=self.tmp, env=env,
        )

    def test_doctor_exits_zero_with_no_keys(self):
        r = self._run()
        self.assertEqual(r.returncode, 0)
        out = json.loads(r.stdout.strip())
        self.assertTrue(out["ok"])
        self.assertEqual(out["ready_services"], [])
        self.assertEqual({p["service"] for p in out["providers"]},
                         {"Gemini", "xAI Grok", "Tripo3D"})

    def test_doctor_classifies_key_states(self):
        r = self._run({"GOOGLE_API_KEY": "your-gemini-api-key-here",
                       "XAI_API_KEY": "sk-real-value"})
        states = {p["service"]: p["key"] for p in json.loads(r.stdout.strip())["providers"]}
        self.assertEqual(states["Gemini"], "placeholder")
        self.assertEqual(states["xAI Grok"], "set")
        self.assertEqual(states["Tripo3D"], "missing")


class PublishUpdateModeTest(unittest.TestCase):
    """Re-publishing over an existing repo updates skills but keeps the scaffold."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _publish(self, target: Path):
        return subprocess.run(
            ["bash", str(REPO / "publish.sh"), "--agent", "claude", "--out", str(target)],
            capture_output=True, text=True,
        )

    def test_rerun_preserves_user_scaffold_edits(self):
        target = self.tmp / "game"
        self.assertEqual(self._publish(target).returncode, 0)

        # Simulate the user having edited a scaffold file after first publish.
        pkg = target / "package.json"
        edited = pkg.read_text(encoding="utf-8").replace(
            '"name": "babylon-game"', '"name": "my-custom-game"', 1
        )
        pkg.write_text(edited, encoding="utf-8")
        marker = target / "src" / "game" / "scene.ts"
        marker.write_text(marker.read_text(encoding="utf-8") + "\n// my edit\n",
                          encoding="utf-8")

        # Re-publish: update mode must skip the scaffold (package.json present).
        result = self._publish(target)
        self.assertEqual(result.returncode, 0)
        self.assertIn("update mode", result.stdout)

        # User edits survive.
        self.assertIn("my-custom-game", pkg.read_text(encoding="utf-8"))
        self.assertIn("// my edit", marker.read_text(encoding="utf-8"))

        # Skills are still (re)rendered and present.
        skill = target / ".claude/skills/godogen/SKILL.md"
        self.assertTrue(skill.is_file())
        self.assertNotIn("${AGENT_NAME}", skill.read_text(encoding="utf-8"))


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
