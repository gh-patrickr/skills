#!/usr/bin/env bash
# Safely install this skill into the user-wide DSH skills root (~/.dsh/skills),
# where every workspace can load it.
#
# The install is staged, validated, then swapped in atomically. An existing
# version is moved to a timestamped backup, never deleted. If anything fails the
# previous version is restored.
#
#   scripts/install-shared.sh --dry-run
#   scripts/install-shared.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NAME="$(basename "$SKILL_DIR")"
ROOT="${DSH_HOME:-$HOME/.dsh}/skills"
DEST="$ROOT/$NAME"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

die() { echo "install refused: $*" >&2; exit 2; }

# ---- preflight -----------------------------------------------------------
[ "$NAME" = "webgame-development" ] || die "skill folder must be named webgame-development (found $NAME)"
[ -f "$SKILL_DIR/SKILL.md" ] || die "SKILL.md missing"
[ "$(head -n 1 "$SKILL_DIR/SKILL.md")" = "---" ] || die "SKILL.md must start with YAML frontmatter"
grep -q '^name: webgame-development$' "$SKILL_DIR/SKILL.md" || die "frontmatter name must be webgame-development"
grep -q '^description: ' "$SKILL_DIR/SKILL.md" || die "frontmatter description missing"
grep -q '^---$' <(tail -n +2 "$SKILL_DIR/SKILL.md") || die "frontmatter is not closed"
[ -f "$SKILL_DIR/templates/game/package.json" ] || die "template missing"
[ ! -e "$SKILL_DIR/templates/game/node_modules" ] || die "template contains node_modules; clean it first"

STAGE="$ROOT/.${NAME}.staging.$$"
BACKUP="$ROOT/.${NAME}.backup.$(date +%Y%m%d-%H%M%S)"

echo "source: $SKILL_DIR"
echo "dest:   $DEST"

if [ "$DRY" -eq 1 ]; then
  echo "dry run: would stage, validate, then atomically replace $DEST"
  exit 0
fi

mkdir -p "$ROOT"
cleanup() { [ -d "$STAGE" ] && rm -rf "$STAGE" || true; }
trap cleanup EXIT

# ---- stage ---------------------------------------------------------------
rsync -a \
  --exclude node_modules --exclude artifacts --exclude dist --exclude dist-e2e \
  --exclude .wg --exclude '.DS_Store' \
  "$SKILL_DIR/" "$STAGE/"
chmod 755 "$STAGE/scripts/"*.sh

# ---- validate the stage --------------------------------------------------
[ -f "$STAGE/SKILL.md" ] || die "staged SKILL.md missing"
[ -f "$STAGE/templates/game/tools/wg.mjs" ] || die "staged template incomplete"
[ -f "$STAGE/templates/game/tools/playwright.config.ts" ] || die "staged test harness missing"
[ -f "$STAGE/references/architecture.md" ] || die "staged references missing"
for script in scaffold.sh verify.sh smoke-test.sh install-shared.sh; do
  [ -x "$STAGE/scripts/$script" ] || die "staged script not executable: $script"
done

# ---- atomic swap with rollback ------------------------------------------
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  mv "$DEST" "$BACKUP"
  echo "previous version backed up: $BACKUP"
fi
if ! mv "$STAGE" "$DEST"; then
  [ -e "$BACKUP" ] && mv "$BACKUP" "$DEST"
  die "swap failed; previous version restored"
fi
trap - EXIT

# ---- post-check ----------------------------------------------------------
[ -f "$DEST/SKILL.md" ] || die "post-install check failed"
echo
echo "installed: $DEST"
echo "files:     $(find "$DEST" -type f | wc -l | tr -d ' ')"
echo "sandbox:   template verify is unchanged; run it with:"
echo "           $DEST/scripts/smoke-test.sh --full"
echo
echo "Every workspace now discovers it as 'webgame-development'."
echo "This session's skill watcher picks it up automatically; restart only if it does not."
