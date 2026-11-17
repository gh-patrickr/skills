#!/usr/bin/env bash
# Build the app for a simulator, unsigned and deterministic.
#
#   bash build.sh [--scheme NAME] [--destination DEST] [--configuration Debug] \
#                 [--root DIR] [--strict] [--platform ios|watchos] [--no-boot]
#
# Exit 2 on preflight/environment problems, 1 on build failure.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
SCHEME=""
DEST=""
CONFIG="Debug"
STRICT=0
PLATFORM="ios"
BOOT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)         ROOT="${2:?}"; shift 2 ;;
    --scheme)       SCHEME="${2:?}"; shift 2 ;;
    --destination)  DEST="${2:?}"; shift 2 ;;
    --configuration) CONFIG="${2:?}"; shift 2 ;;
    --platform)     PLATFORM="${2:?}"; shift 2 ;;
    --strict)       STRICT=1; shift ;;
    --no-boot)      BOOT=0; shift ;;
    -h|--help)      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

ROOT="$(resolve_root "$ROOT")"
require_xcode

NAME="$(sed -n 's/^name:[[:space:]]*//p' "$ROOT/project.yml" 2>/dev/null | head -1 | tr -d "\"'" | tr -d '[:space:]')"
[[ -n "$NAME" ]] || die "no project.yml with a 'name:' in $ROOT" 2
PROJECT="$ROOT/$NAME.xcodeproj"
[[ -d "$PROJECT" ]] || die "$PROJECT is missing — run scripts/gen.sh first" 2

if [[ -z "$SCHEME" ]]; then
  SCHEME="$(default_scheme "$ROOT" || true)"
  [[ -n "$SCHEME" ]] || SCHEME="$NAME"
fi

if [[ -z "$DEST" ]]; then
  boot_flag=()
  [[ "$BOOT" == "1" ]] && boot_flag=(--boot)
  DEST="$(bash "$SCRIPT_DIR/destinations.sh" --platform "$PLATFORM" ${boot_flag[@]+"${boot_flag[@]}"})" \
    || die "could not resolve a $PLATFORM simulator destination" 2
fi

RUN_DIR="$(new_run_dir "$ROOT")"
LOG="$RUN_DIR/raw/build.log"
DERIVED="$ROOT/DerivedData"

ARGS=(
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration "$CONFIG"
  -destination "$DEST"
  -derivedDataPath "$DERIVED"
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY=""
  -skipMacroValidation
  -skipPackagePluginValidation
)
[[ "$STRICT" == "1" ]] && ARGS+=(SWIFT_TREAT_WARNINGS_AS_ERRORS=YES)
if [[ -f "$ROOT/$NAME.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved" ]] \
   || [[ -f "$ROOT/Package.resolved" ]]; then
  ARGS+=(-onlyUsePackageVersionsFromResolvedFile)
fi

log "Building $SCHEME ($CONFIG) for $DEST"
set +e
if have xcbeautify; then
  xcodebuild "${ARGS[@]}" build 2>&1 | tee "$LOG" | xcbeautify
  status=${PIPESTATUS[0]}
else
  xcodebuild "${ARGS[@]}" build 2>&1 | tee "$LOG"
  status=${PIPESTATUS[0]}
fi
set -e

if [[ "$status" -ne 0 ]]; then
  log ""
  fail "BUILD FAILED (status $status). First errors:"
  grep -n -m5 -E "(error:|fatal error:)" "$LOG" >&2 || tail -20 "$LOG" >&2
  log ""
  log "Full log: $LOG"
  exit 1
fi

ok "BUILD SUCCEEDED — $SCHEME"
log "Artifacts: $RUN_DIR"
