#!/usr/bin/env bash
# Install the solidcraft-model-viewer skill from GitHub (or a local checkout).
#
# Examples:
#   curl -fsSL https://raw.githubusercontent.com/gh-patrickr/skills/main/solidcraft-model-viewer/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/gh-patrickr/skills/main/solidcraft-model-viewer/scripts/install.sh | bash -s -- --antigravity
#   curl -fsSL https://raw.githubusercontent.com/gh-patrickr/skills/main/solidcraft-model-viewer/scripts/install.sh | bash -s -- --claude --codex
#   bash scripts/install.sh --project
set -euo pipefail

REPO="${SC_VIEWER_REPO:-gh-patrickr/skills}"
REF="${SC_VIEWER_REF:-main}"
SKILL_NAME="solidcraft-model-viewer"
FROM_DIR=""
TARGETS=()

usage() {
  cat <<'EOF'
Install the solidcraft-model-viewer skill.

Usage:
  install.sh [TARGET...] [--ref BRANCH_OR_TAG] [--from LOCAL_SKILL_DIR]

Targets (combine any, or omit to auto-pick ~/.gemini/config/skills if present, else ~/.agents/skills):
  --antigravity   Install into ~/.gemini/config/skills/solidcraft-model-viewer
  --claude        Install into ~/.claude/skills/solidcraft-model-viewer
  --codex         Install into ~/.codex/skills/solidcraft-model-viewer
  --agents        Install into ~/.agents/skills/solidcraft-model-viewer (cross-tool)
  --project       Install into ./.agents/skills/solidcraft-model-viewer (current workspace)
  --dir PATH      Install into an explicit directory PATH

Options:
  --ref REF       Git branch or tag on GitHub (default: main)
  --from DIR      Copy from a local solidcraft-model-viewer directory instead of downloading
  -h, --help      Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --antigravity) TARGETS+=("$HOME/.gemini/config/skills/$SKILL_NAME") ;;
    --claude)      TARGETS+=("$HOME/.claude/skills/$SKILL_NAME") ;;
    --codex)       TARGETS+=("$HOME/.codex/skills/$SKILL_NAME") ;;
    --agents)      TARGETS+=("$HOME/.agents/skills/$SKILL_NAME") ;;
    --project)     TARGETS+=("$PWD/.agents/skills/$SKILL_NAME") ;;
    --dir)
      [ $# -ge 2 ] || { echo "error: --dir requires a path" >&2; exit 2; }
      TARGETS+=("$2")
      shift
      ;;
    --ref)
      [ $# -ge 2 ] || { echo "error: --ref requires a branch or tag" >&2; exit 2; }
      REF="$2"
      shift
      ;;
    --from)
      [ $# -ge 2 ] || { echo "error: --from requires a directory path" >&2; exit 2; }
      FROM_DIR="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  if [ -d "$HOME/.gemini/config" ]; then
    TARGETS+=("$HOME/.gemini/config/skills/$SKILL_NAME")
  else
    TARGETS+=("$HOME/.agents/skills/$SKILL_NAME")
  fi
fi

TMPDIR_WORK=""
cleanup() {
  if [ -n "$TMPDIR_WORK" ] && [ -d "$TMPDIR_WORK" ]; then
    rm -rf "$TMPDIR_WORK"
  fi
}
trap cleanup EXIT

if [ -n "$FROM_DIR" ]; then
  SRC_DIR="$FROM_DIR"
else
  TMPDIR_WORK="$(mktemp -d "${TMPDIR:-/tmp}/sc-viewer-install.XXXXXX")"
  ARCHIVE_URL="https://github.com/${REPO}/archive/${REF}.tar.gz"
  echo "Downloading ${SKILL_NAME} from ${ARCHIVE_URL} ..."
  curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TMPDIR_WORK"
  SRC_DIR="$(find "$TMPDIR_WORK" -maxdepth 2 -type d -name "$SKILL_NAME" | head -n 1)"
fi

if [ -z "${SRC_DIR:-}" ] || [ ! -f "$SRC_DIR/SKILL.md" ] || [ ! -f "$SRC_DIR/assets/solidcraft-viewer.html" ]; then
  echo "error: could not locate a valid ${SKILL_NAME} directory (missing SKILL.md or assets/solidcraft-viewer.html)" >&2
  exit 1
fi

SRC_REAL="$(cd "$SRC_DIR" && pwd -P)"

for dest in "${TARGETS[@]}"; do
  if [ -z "$dest" ] || [ "$dest" = "/" ] || [ "$dest" = "$HOME" ]; then
    echo "error: refusing to install into unsafe path: '$dest'" >&2
    exit 1
  fi
  if [ -d "$dest" ]; then
    DEST_REAL="$(cd "$dest" && pwd -P)"
    if [ "$DEST_REAL" = "$SRC_REAL" ]; then
      echo "Skipping $dest (already points to source)"
      continue
    fi
  fi

  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  mkdir -p "$dest"
  # Copy skill files, skipping any local build caches/node_modules.
  (
    cd "$SRC_REAL"
    tar --exclude='node_modules' --exclude='shots' --exclude='__pycache__' --exclude='.DS_Store' -cf - .
  ) | tar -xf - -C "$dest"
  chmod +x "$dest/scripts/sc_view.py" "$dest/scripts/install.sh" 2>/dev/null || true
  echo "Installed ${SKILL_NAME} -> $dest"
done

echo ""
echo "Try it on the included demo model:"
echo "  python3 \"${TARGETS[0]}/scripts/sc_view.py\" \"${TARGETS[0]}/examples/demo-bracket.glb\" -o demo-bracket.html"
