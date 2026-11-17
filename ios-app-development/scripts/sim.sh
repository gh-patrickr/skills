#!/usr/bin/env bash
# Simulator lifecycle helpers.
#
#   bash sim.sh list [--platform ios|watchos]
#   bash sim.sh boot [--platform ios] [--udid UDID]
#   bash sim.sh statusbar [--platform ios] [--udid UDID]
#   bash sim.sh privacy --bundle-id com.example.myapp [--service all] [--reset]
#   bash sim.sh screenshot --out shot.png [--platform ios] [--udid UDID]
#   bash sim.sh erase [--platform ios] [--udid UDID]
#
# Without --udid the newest matching simulator is resolved automatically.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

ACTION="${1:-}"
case "$ACTION" in
  ""|-h|--help)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  list|boot|statusbar|privacy|screenshot|erase) shift ;;
  *) echo "[fail] unknown action: $ACTION (try --help)" >&2; exit 1 ;;
esac

PLATFORM="ios"
UDID=""
OUT=""
BUNDLE_ID=""
SERVICE=""
RESET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="${2:?}"; shift 2 ;;
    --udid)     UDID="${2:?}"; shift 2 ;;
    --out)      OUT="${2:?}"; shift 2 ;;
    --bundle-id) BUNDLE_ID="${2:?}"; shift 2 ;;
    --service)  SERVICE="${2:?}"; shift 2 ;;
    --reset)    RESET=1; shift ;;
    -h|--help)  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "[fail] unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ "$ACTION" == "list" ]]; then
  exec python3 "$SCRIPT_DIR/simctl.py" list --platform "$PLATFORM"
fi

if [[ -z "$UDID" ]]; then
  UDID="$(python3 "$SCRIPT_DIR/simctl.py" resolve --platform "$PLATFORM" --format udid --boot)"
fi

case "$ACTION" in
  boot)       exec python3 "$SCRIPT_DIR/simctl.py" boot --udid "$UDID" ;;
  statusbar)  exec python3 "$SCRIPT_DIR/simctl.py" statusbar --udid "$UDID" ;;
  erase)      exec python3 "$SCRIPT_DIR/simctl.py" erase --udid "$UDID" ;;
  screenshot)
    [[ -n "$OUT" ]] || { echo "[fail] --out is required for screenshot" >&2; exit 1; }
    exec python3 "$SCRIPT_DIR/simctl.py" screenshot --udid "$UDID" --out "$OUT"
    ;;
  privacy)
    args=(privacy --udid "$UDID")
    [[ -n "$BUNDLE_ID" ]] && args+=(--bundle-id "$BUNDLE_ID")
    [[ -n "$SERVICE" ]] && args+=(--service "$SERVICE")
    [[ "$RESET" == "1" ]] && args+=(--reset)
    exec python3 "$SCRIPT_DIR/simctl.py" "${args[@]}"
    ;;
esac
