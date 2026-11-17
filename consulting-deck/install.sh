#!/usr/bin/env bash
# One-shot setup: create the Python environment and optionally register the skill
# with DSH so future sessions can load it by name.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$HERE/scripts/bootstrap.sh"

if [ "${1:-}" = "--link" ]; then
  mkdir -p "$HOME/.dsh/skills"
  ln -sfn "$HERE" "$HOME/.dsh/skills/consulting-deck"
  echo "linked: ~/.dsh/skills/consulting-deck -> $HERE"
  echo "restart the session (or reload skills) for it to appear in the catalog"
fi
