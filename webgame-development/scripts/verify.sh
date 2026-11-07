#!/usr/bin/env bash
# Run the project's evidence pipeline from anywhere.
#
#   scripts/verify.sh            # current directory
#   scripts/verify.sh /path/to/game --fast
set -euo pipefail

DIR="${WG_PROJECT_DIR:-.}"
if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then
  DIR="$1"
  shift
fi

DIR="$(cd "$DIR" && pwd)"
if [ ! -f "$DIR/tools/wg.mjs" ]; then
  echo "not a webgame project (no tools/wg.mjs): $DIR" >&2
  echo "scaffold one with: scripts/scaffold.sh --name \"My Game\" --dest ." >&2
  exit 2
fi

cd "$DIR"
exec node tools/wg.mjs verify "$@"
