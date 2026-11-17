#!/usr/bin/env bash
# Run unit or UI tests on a simulator.
#
#   bash test.sh [--scheme NAME] [--only unit|ui|all] [--destination DEST] [--root DIR] \
#                [--platform ios|watchos] [--unit-target NAME] [--ui-target NAME] \
#                [--result-bundle PATH] [--coverage] [--strict]
#
# Defaults: --only all, targets <Scheme>Tests and <Scheme>UITests (the template convention).
# Exit 2 on environment problems, 1 when a test fails.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
SCHEME=""
DEST=""
ONLY="all"
PLATFORM="watchos"
CONFIG="Debug"
UNIT_TARGET=""
UI_TARGET=""
RESULT_BUNDLE=""
COVERAGE=0
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)         ROOT="${2:?}"; shift 2 ;;
    --scheme)       SCHEME="${2:?}"; shift 2 ;;
    --destination)  DEST="${2:?}"; shift 2 ;;
    --only)         ONLY="${2:?}"; shift 2 ;;
    --platform)     PLATFORM="${2:?}"; shift 2 ;;
    --configuration) CONFIG="${2:?}"; shift 2 ;;
    --unit-target)  UNIT_TARGET="${2:?}"; shift 2 ;;
    --ui-target)    UI_TARGET="${2:?}"; shift 2 ;;
    --result-bundle) RESULT_BUNDLE="${2:?}"; shift 2 ;;
    --coverage)     COVERAGE=1; shift ;;
    --strict)       STRICT=1; shift ;;
    -h|--help)      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

case "$ONLY" in unit|ui|all) ;; *) die "--only must be unit, ui or all" ;; esac

ROOT="$(resolve_root "$ROOT")"
require_xcode

NAME="$(sed -n 's/^name:[[:space:]]*//p' "$ROOT/project.yml" 2>/dev/null | head -1 | tr -d "\"'" | tr -d '[:space:]')"
[[ -n "$NAME" ]] || die "no project.yml with a 'name:' in $ROOT" 2
PROJECT="$ROOT/$NAME.xcodeproj"
[[ -d "$PROJECT" ]] || die "$PROJECT is missing — run scripts/gen.sh first" 2

[[ -n "$SCHEME" ]] || SCHEME="$(default_scheme "$ROOT" || true)"
[[ -n "$SCHEME" ]] || SCHEME="$NAME"
[[ -n "$UNIT_TARGET" ]] || UNIT_TARGET="${SCHEME}Tests"
[[ -n "$UI_TARGET" ]] || UI_TARGET="${SCHEME}UITests"

if [[ -z "$DEST" ]]; then
  DEST="$(bash "$SCRIPT_DIR/destinations.sh" --platform "$PLATFORM" --boot)" \
    || die "could not resolve a $PLATFORM simulator destination" 2
fi

RUN_DIR="$(new_run_dir "$ROOT")"
[[ -n "$RESULT_BUNDLE" ]] || RESULT_BUNDLE="$RUN_DIR/test.xcresult"
LOG="$RUN_DIR/raw/test-${ONLY}.log"
DERIVED="$ROOT/DerivedData"

ARGS=(
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration "$CONFIG"
  -destination "$DEST"
  -derivedDataPath "$DERIVED"
  -resultBundlePath "$RESULT_BUNDLE"
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY=""
  -skipMacroValidation
  -skipPackagePluginValidation
  -test-timeouts-enabled YES
  -default-test-execution-time-allowance 120
  -maximum-test-execution-time-allowance 900
)

case "$ONLY" in
  unit) ARGS+=(-only-testing:"$UNIT_TARGET" -parallel-testing-enabled YES) ;;
  ui)   ARGS+=(-only-testing:"$UI_TARGET" -parallel-testing-enabled NO) ;;
  all)  ARGS+=(-parallel-testing-enabled NO) ;;
esac

[[ "$COVERAGE" == "1" ]] && ARGS+=(-enableCodeCoverage YES)
[[ "$STRICT" == "1" ]] && ARGS+=(SWIFT_TREAT_WARNINGS_AS_ERRORS=YES)
if [[ -f "$PROJECT/project.xcworkspace/xcshareddata/swiftpm/Package.resolved" ]] \
   || [[ -f "$ROOT/Package.resolved" ]]; then
  ARGS+=(-onlyUsePackageVersionsFromResolvedFile)
fi

log "Testing $SCHEME (only=$ONLY) on $DEST"
set +e
if have xcbeautify; then
  xcodebuild "${ARGS[@]}" test 2>&1 | tee "$LOG" | xcbeautify
  status=${PIPESTATUS[0]}
else
  xcodebuild "${ARGS[@]}" test 2>&1 | tee "$LOG"
  status=${PIPESTATUS[0]}
fi
set -e

if [[ "$status" -ne 0 ]]; then
  log ""
  fail "TESTS FAILED (status $status). First failures:"
  grep -n -m8 -E "(error:|failed|XCTAssert|#expect)" "$LOG" >&2 || tail -25 "$LOG" >&2
  log ""
  log "Result bundle: $RESULT_BUNDLE"
  log "Full log: $LOG"
  exit 1
fi

ok "TESTS PASSED — $SCHEME ($ONLY)"
python3 "$SCRIPT_DIR/xcresult.py" --xcresult "$RESULT_BUNDLE" --summary-only 2>/dev/null || true
log "Result bundle: $RESULT_BUNDLE"
