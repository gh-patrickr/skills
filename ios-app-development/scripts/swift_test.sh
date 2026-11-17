#!/usr/bin/env bash
# Run the Core Swift package tests. This layer works with Command Line Tools alone.
#
#   bash swift_test.sh [--root DIR] [--package Core] [--filter REGEX] \
#                      [--coverage] [--coverage-min 0.90] [--strict]
#
# Why the extra flags: inside an agent/CI sandbox SwiftPM's own sandbox cannot start, the
# user-level cache is often unwritable, and Command Line Tools ship swift-testing's
# frameworks outside the default search/rpath. All three are handled here.
# Exit 2 when the package is missing, 1 when tests fail or coverage is below the gate.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
PACKAGE="Core"
FILTER=""
COVERAGE=0
COVERAGE_MIN=""
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)         ROOT="${2:?}"; shift 2 ;;
    --package)      PACKAGE="${2:?}"; shift 2 ;;
    --filter)       FILTER="${2:?}"; shift 2 ;;
    --coverage)     COVERAGE=1; shift ;;
    --coverage-min) COVERAGE_MIN="${2:?}"; COVERAGE=1; shift 2 ;;
    --strict)       STRICT=1; shift ;;
    -h|--help)      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

ROOT="$(resolve_root "$ROOT")"
PKG="$ROOT/$PACKAGE"
[[ -f "$PKG/Package.swift" ]] || die "no Swift package at $PKG (expected $PACKAGE/Package.swift)" 2
have swift || die "no Swift toolchain — run: xcode-select --install" 2

RUN_DIR="$(new_run_dir "$ROOT")"
LOG="$RUN_DIR/raw/core-tests.log"
BUILD="$PKG/.build"
export CLANG_MODULE_CACHE_PATH="$BUILD/module-cache"
export SWIFT_MODULE_CACHE_PATH="$BUILD/module-cache"

ARGS=(test --disable-sandbox --cache-path "$BUILD/swiftpm-cache")
[[ -n "$FILTER" ]] && ARGS+=(--filter "$FILTER")
[[ "$COVERAGE" == "1" ]] && ARGS+=(--enable-code-coverage)
[[ "$STRICT" == "1" ]] && ARGS+=(-Xswiftc -warnings-as-errors)

# Command Line Tools only: swift-testing's frameworks live outside the default paths.
if ! is_full_xcode; then
  FW="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
  LIB="/Library/Developer/CommandLineTools/Library/Developer/usr/lib"
  if [[ -d "$FW/Testing.framework" ]]; then
    ARGS+=(-Xswiftc -F -Xswiftc "$FW" -Xlinker -rpath -Xlinker "$FW")
    [[ -d "$LIB" ]] && ARGS+=(-Xlinker -rpath -Xlinker "$LIB")
    info "Command Line Tools detected — added swift-testing search paths"
  else
    warn "Command Line Tools without Testing.framework — swift-testing tests may not link"
  fi
fi

log "Running $PACKAGE tests"
set +e
(cd "$PKG" && swift "${ARGS[@]}") 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e

if [[ "$status" -ne 0 ]]; then
  log ""
  fail "CORE TESTS FAILED (status $status)"
  grep -n -m8 -E "(error:|✘|failed)" "$LOG" >&2 || tail -25 "$LOG" >&2
  log "Full log: $LOG"
  exit 1
fi

passed="$(grep -Eo 'Test run with [0-9]+ tests? in [0-9]+ suites? passed' "$LOG" | tail -1 || true)"
ok "CORE TESTS PASSED${passed:+ — $passed}"

if [[ "$COVERAGE" == "1" ]]; then
  LLVM_COV=""
  for candidate in "$(xcrun --find llvm-cov 2>/dev/null || true)" /Library/Developer/CommandLineTools/usr/bin/llvm-cov; do
    [[ -n "$candidate" && -x "$candidate" ]] && { LLVM_COV="$candidate"; break; }
  done
  BIN="$(find "$BUILD" -type f -path '*.xctest/Contents/MacOS/*' -perm -100 2>/dev/null | head -1)"
  PROF="$(find "$BUILD" -type f -name 'default.profdata' 2>/dev/null | head -1)"
  if [[ -z "$LLVM_COV" || -z "$BIN" || -z "$PROF" ]]; then
    warn "coverage requested but llvm-cov/profdata not found — skipping the gate"
  else
    COV_JSON="$RUN_DIR/coverage-core.json"
    "$LLVM_COV" report "$BIN" -instr-profile "$PROF" \
      --ignore-filename-regex '(Tests|\.build)' >"$RUN_DIR/coverage-core.txt" 2>/dev/null || true
    TOTAL=""
    if "$LLVM_COV" export -summary-only -instr-profile "$PROF" "$BIN" >"$COV_JSON" 2>/dev/null; then
      TOTAL="$(python3 - "$COV_JSON" <<'PYEOF'
import json, sys
try:
    data = json.load(open(sys.argv[1]))
    print(f'{data["data"][0]["totals"]["lines"]["percent"]:.2f}')
except Exception:
    print("")
PYEOF
)"
    fi
    if [[ -z "$TOTAL" ]]; then
      warn "could not compute line coverage from $COV_JSON"
    else
      ok "Core line coverage: ${TOTAL}%"
      if [[ -n "$COVERAGE_MIN" ]]; then
        MIN_PCT="$(awk -v m="$COVERAGE_MIN" 'BEGIN { printf "%.0f", m * 100 }')"
        if awk -v t="$TOTAL" -v m="$COVERAGE_MIN" 'BEGIN { exit !(t + 0 >= m + 0) }'; then
          ok "coverage ${TOTAL}% >= ${MIN_PCT}%"
        else
          fail "coverage ${TOTAL}% is below the ${MIN_PCT}% gate"
          exit 1
        fi
      fi
    fi
  fi
fi

log "Artifacts: $RUN_DIR"
