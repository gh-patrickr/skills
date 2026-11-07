#!/usr/bin/env bash
# Create the four game-requirement files in a project from templates/.
#
#   scripts/new-spec.sh --game "Tier-Rennen" [--dest docs/requirements] [--date YYYY-MM-DD] [--force]
#
# Refuses to overwrite an existing spec.md unless --force is given. Prints nothing
# else and exits 0; the next step is editing spec.md and running check-spec.mjs.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/new-spec.sh --game "Tier-Rennen" [options]

  --game NAME   game name as the kids say it (required)
  --dest DIR    target folder (default: docs/requirements)
  --date DATE   date for the changelog row (default: today, YYYY-MM-DD)
  --force       overwrite an existing spec.md
EOF
}

GAME=""
DEST="docs/requirements"
DATE="$(date +%F)"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --game) GAME="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    --date) DATE="${2:-}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [ -z "$GAME" ]; then
  echo "error: --game is required" >&2
  usage
  exit 2
fi

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TPL="$SKILL_DIR/templates"

if [ -e "$DEST/spec.md" ] && [ "$FORCE" -ne 1 ]; then
  echo "error: $DEST/spec.md already exists (use --force to overwrite)" >&2
  exit 1
fi

mkdir -p "$DEST"

# escape sed replacement metacharacters
esc() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }
GAME_ESC="$(esc "$GAME")"
DATE_ESC="$(esc "$DATE")"

for f in intake.de.md spec.md spec.de.md open-questions.de.md; do
  sed -e "s|{{GAME}}|$GAME_ESC|g" -e "s|{{DATE}}|$DATE_ESC|g" "$TPL/$f" > "$DEST/$f"
done

echo "wrote $DEST/{intake.de.md,spec.md,spec.de.md,open-questions.de.md}"
echo "next: edit intake.de.md and spec.md, then run:"
echo "  node \"$SKILL_DIR/scripts/check-spec.mjs\" \"$DEST\""
