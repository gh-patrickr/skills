#!/usr/bin/env bash
# Prove the skill works end to end: scaffold a throwaway project, install, verify.
#
#   scripts/smoke-test.sh            # fast verify (~1 min incl. npm install)
#   scripts/smoke-test.sh --full     # full verify incl. bots + perf
#   scripts/smoke-test.sh --keep     # keep the temp project for inspection
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FULL=0
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --keep) KEEP=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 1 ;;
  esac
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/webgame-smoke.XXXXXX")"
cleanup() {
  ( cd "$WORK/game" 2>/dev/null && node tools/wg.mjs dev:stop --thread smoke >/dev/null 2>&1 ) || true
  if [ "$KEEP" -eq 1 ]; then
    echo "kept: $WORK"
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

echo "== scaffold =="
"$SCRIPT_DIR/scaffold.sh" --name "Smoke Game" --dest "$WORK/game"

echo "== install =="
# Isolated cache: works in sandboxes where ~/.npm is read-only.
export npm_config_cache="${npm_config_cache:-$WORK/npm-cache}"
( cd "$WORK/game" && npm install --no-audit --no-fund )

echo "== parallel server (thread isolation) =="
# A thread server must pick its own port and keep its own state file while the
# evidence run uses its own ports. This is the regression that used to fail the
# doctor step whenever another thread owned 5173.
( cd "$WORK/game" && node tools/wg.mjs dev --detach --thread smoke >/dev/null )
node -e '
const fs = require("node:fs");
const [, stateArg, mainArg] = process.argv;
const state = JSON.parse(fs.readFileSync(stateArg, "utf8"));
if (!Number.isInteger(state.port) || state.port <= 5173) throw new Error(`thread server took port ${state.port}`);
if (state.thread !== "smoke") throw new Error(`state does not name the thread: ${state.thread}`);
if (fs.existsSync(mainArg)) throw new Error("thread server wrote the main .wg/dev.json");
console.log(`thread server on :${state.port}, main state untouched`);
' "$WORK/game/.wg/threads/smoke.json" "$WORK/game/.wg/dev.json"

echo "== verify =="
if [ "$FULL" -eq 1 ]; then
  ( cd "$WORK/game" && node tools/wg.mjs verify )
else
  ( cd "$WORK/game" && node tools/wg.mjs verify --fast )
fi

echo "== stop thread server =="
( cd "$WORK/game" && node tools/wg.mjs dev:stop --thread smoke )
[ ! -f "$WORK/game/.wg/threads/smoke.json" ] || { echo "thread state file survived dev:stop" >&2; exit 1; }

echo "== evidence =="
SUMMARY="$(cd "$WORK/game" && cat artifacts/last-run.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).summary))')"
echo "$SUMMARY"
if [ "$FULL" -eq 0 ]; then
  echo "(fast mode: bots and perf were skipped; use --full for all nine steps)"
fi
