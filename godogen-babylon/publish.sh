#!/usr/bin/env bash
# Publish godogen-babylon runtime files into a target game repo.
#
# Usage:
#   ./publish.sh --agent claude --out <target_dir> [--force] [--video_hook]
#   ./publish.sh --agent claude <target_dir> [--force] [--video_hook]
#
# This is a Babylon.js + Claude Code generator. The structure mirrors the
# upstream multi-engine layout (shared/ + <engine>/) so Godot/Bevy or a Codex
# render flavor can be slotted in later, but only --engine babylon / --agent
# claude are wired up here.
#
# --video_hook installs the optional Stop hook (off by default). When enabled it
# is best-effort: with `tg-push` and TG_* env vars present at runtime it pushes
# the latest screenshots/result/{N}/video.mp4 to Telegram, otherwise it no-ops.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
HELPERS="$REPO_ROOT/scripts/publish"

ENGINE="babylon"
AGENT="claude"
OUT=""
FORCE=0
VIDEO_HOOK=0

usage() {
    sed -n '1,15p' "$0" >&2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --engine) ENGINE="${2:-}"; shift 2 ;;
        --agent)  AGENT="${2:-}";  shift 2 ;;
        --out)    OUT="${2:-}";    shift 2 ;;
        --force)  FORCE=1;         shift   ;;
        --video_hook) VIDEO_HOOK=1; shift  ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "error: unknown option $1" >&2; usage; exit 1 ;;
        *)
            if [ -n "$OUT" ]; then
                echo "error: target specified more than once" >&2
                exit 1
            fi
            OUT="$1"
            shift
            ;;
    esac
done

case "$ENGINE" in
    babylon)
        ENGINE_NAME="Babylon"
        HELP_SKILL="babylon-help"
        HELP_COMMAND="/babylon-help"
        ;;
    onchain)
        ENGINE_NAME="On-Chain"
        HELP_SKILL=""          # no engine help skill for the on-chain track (yet)
        HELP_COMMAND=""
        ;;
    godot|bevy) echo "error: --engine $ENGINE is not wired up in this generator yet (babylon, onchain)" >&2; exit 1 ;;
    *) echo "error: --engine must be babylon or onchain" >&2; usage; exit 1 ;;
esac

case "$AGENT" in
    claude)
        MANIFEST="CLAUDE.md"
        SKILLS_DIR_REL=".claude/skills"
        HOOK_CONFIG_DIR=".claude"
        AGENT_NAME="Claude"
        GODOGEN_COMMAND="/godogen"
        ;;
    codex) echo "error: --agent codex is not wired up in this generator yet (claude only)" >&2; exit 1 ;;
    *) echo "error: --agent must be claude" >&2; usage; exit 1 ;;
esac

if [ -z "$OUT" ]; then
    echo "error: --out <target_dir> is required" >&2
    usage
    exit 1
fi

TARGET="$(cd "$OUT" 2>/dev/null && pwd || (mkdir -p "$OUT" && cd "$OUT" && pwd))"

if [ "$FORCE" -eq 1 ] && [ -d "$TARGET" ]; then
    echo "Force: cleaning $TARGET"
    rm -rf "${TARGET:?}"
    mkdir -p "$TARGET"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Stage skills: shared godogen stages + engine-specific stages, merged ---
mkdir -p "$TMP/skills/godogen"
rsync -a --exclude='__pycache__/' "$REPO_ROOT/shared/skills/godogen/" "$TMP/skills/godogen/"
rsync -a --exclude='__pycache__/' "$REPO_ROOT/$ENGINE/skills/godogen/" "$TMP/skills/godogen/"

# Engine help skill (e.g. babylon-help), if this engine ships one.
if [ -n "$HELP_SKILL" ] && [ -d "$REPO_ROOT/$ENGINE/skills/$HELP_SKILL" ]; then
    rsync -a --exclude='__pycache__/' "$REPO_ROOT/$ENGINE/skills/$HELP_SKILL" "$TMP/skills/"
fi

# --- Render template variables across the staged skills ---
python3 "$HELPERS/render_dir.py" "$TMP/skills" \
    "AGENT_ID=$AGENT" \
    "AGENT_NAME=$AGENT_NAME" \
    "SKILLS_DIR=$SKILLS_DIR_REL" \
    "GODOGEN_SKILL_DIR=$SKILLS_DIR_REL/godogen" \
    "BABYLON_HELP_SKILL_DIR=$SKILLS_DIR_REL/$HELP_SKILL" \
    "HOOK_CONFIG_DIR=$HOOK_CONFIG_DIR" \
    "ENGINE_NAME=$ENGINE_NAME" \
    "GODOGEN_COMMAND=$GODOGEN_COMMAND" \
    "BABYLON_HELP_COMMAND=$HELP_COMMAND"

# Claude lookup frontmatter for the reference (non-pipeline) help skill, if present.
if [ -n "$HELP_SKILL" ] && [ -f "$TMP/skills/$HELP_SKILL/SKILL.md" ]; then
    python3 "$HELPERS/inject_claude_lookup_frontmatter.py" "$TMP/skills/$HELP_SKILL/SKILL.md"
fi

echo "Publishing $ENGINE/$AGENT to: $TARGET"

# --- Copy staged skills into the target ---
mkdir -p "$TARGET/$SKILLS_DIR_REL"
rsync -a --delete "$TMP/skills/" "$TARGET/$SKILLS_DIR_REL/"

# --- Engine Vite scaffold (only when the target has no package.json yet) ---
if [ ! -f "$TARGET/package.json" ]; then
    rsync -a "$REPO_ROOT/$ENGINE/scaffold/" "$TARGET/"
    echo "Created $ENGINE_NAME scaffold"
else
    echo "Existing package.json found — skipped scaffold (update mode)"
fi

# --- Manifest (CLAUDE.md) rendered from the engine manifest ---
mkdir -p "$TMP/game"
cp "$REPO_ROOT/$ENGINE/game-engine.md" "$TMP/game/game-engine.md"
python3 "$HELPERS/render_dir.py" "$TMP/game" \
    "AGENT_NAME=$AGENT_NAME" \
    "GODOGEN_COMMAND=$GODOGEN_COMMAND" \
    "ENGINE_NAME=$ENGINE_NAME" \
    "BABYLON_HELP_COMMAND=$HELP_COMMAND"
cp "$TMP/game/game-engine.md" "$TARGET/$MANIFEST"
echo "Created $MANIFEST"

# --- Hooks: engine capture hook (+ optional Telegram stop hook) ---
mkdir -p "$TARGET/$HOOK_CONFIG_DIR/hooks"
rsync -a "$REPO_ROOT/$ENGINE/hooks/" "$TARGET/$HOOK_CONFIG_DIR/hooks/"

if [ "$VIDEO_HOOK" -eq 1 ]; then
    cp "$REPO_ROOT/shared/hooks/stop_post_task_gate.py" "$TARGET/$HOOK_CONFIG_DIR/hooks/stop_post_task_gate.py"
    python3 "$HELPERS/render_dir.py" "$TARGET/$HOOK_CONFIG_DIR/hooks" "AGENT_NAME=$AGENT_NAME"
    python3 "$HELPERS/merge_claude_stop_hook.py" "$TARGET/$HOOK_CONFIG_DIR" "stop_post_task_gate.py"
    echo "Installed optional Telegram stop hook"
fi

chmod +x "$TARGET/$HOOK_CONFIG_DIR/hooks/"*.sh 2>/dev/null || true

echo "Done. Next:"
echo "  cd $TARGET && npm install"
echo "  npm run setup          # interactively enter your API keys (optional)"
echo "  Open the repo in Claude Code and run $GODOGEN_COMMAND"
