#!/usr/bin/env bash
# Resolve a simulator destination by UDID — never by a device name that changes per Xcode.
#
#   bash destinations.sh [--platform ios|watchos] [--device REGEX] [--os latest|26] \
#                        [--format destination|udid|json] [--boot]
#   bash destinations.sh list [--platform ios]
#
# Prints `platform=iOS Simulator,id=<UDID>` by default, ready for -destination.
# Exit 2 when nothing matches, 3 when simctl is unavailable (no full Xcode).

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if [[ $# -eq 0 ]]; then
  exec python3 "$SCRIPT_DIR/simctl.py" resolve --platform ios
fi

case "${1:-}" in
  resolve|list) exec python3 "$SCRIPT_DIR/simctl.py" "$@" ;;
  -h|--help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *) exec python3 "$SCRIPT_DIR/simctl.py" resolve "$@" ;;
esac
