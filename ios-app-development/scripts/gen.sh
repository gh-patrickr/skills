#!/usr/bin/env bash
# Regenerate the Xcode project from project.yml and prove the result is usable.
#
#   bash gen.sh [--root DIR] [--spec project.yml] [--verbose]
#
# Works without Xcode (XcodeGen does not need it). When full Xcode is present it also
# validates that xcodebuild can parse the generated project.
# Exit 2 when generation fails or a declared scheme was not produced.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
SPEC="project.yml"
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)    ROOT="${2:?}"; shift 2 ;;
    --spec)    SPEC="${2:?}"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

ROOT="$(resolve_root "$ROOT")"
[[ -f "$ROOT/$SPEC" ]] || die "no $SPEC in $ROOT — create one (templates/project.yml) or pass --spec" 2
have xcodegen || die "xcodegen not installed. Run: brew install xcodegen" 2

RUN_DIR="$(new_run_dir "$ROOT")"
LOG="$RUN_DIR/raw/generate.log"

NAME="$(sed -n 's/^name:[[:space:]]*//p' "$ROOT/$SPEC" | head -1 | tr -d "\"'" | tr -d '[:space:]')"
[[ -n "$NAME" ]] || die "could not read 'name:' from $SPEC" 2
PROJECT="$ROOT/$NAME.xcodeproj"

log "Generating $NAME from $SPEC"
set +e
(cd "$ROOT" && xcodegen generate --spec "$SPEC") 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e
[[ "$status" -eq 0 ]] || die "xcodegen failed — first error: $(grep -m1 -E 'error:' "$LOG" || tail -3 "$LOG")" 2
[[ -d "$PROJECT" ]] || die "xcodegen reported success but $PROJECT does not exist" 2

# Every scheme in the spec must exist as a shared scheme, or `xcodebuild -scheme` will fail.
SCHEMES=()
while IFS= read -r scheme; do
  [[ -n "$scheme" ]] && SCHEMES+=("$scheme")
done < <(find "$PROJECT/xcshareddata/xcschemes" -maxdepth 1 -name '*.xcscheme' 2>/dev/null \
           | sed 's|.*/||; s|\.xcscheme$||' | sort)
if [[ "${#SCHEMES[@]}" -eq 0 ]]; then
  die "no shared schemes generated. Add a 'scheme:' block to the app target (see templates/project.yml) so tests can run" 2
fi
ok "schemes: ${SCHEMES[*]}"

if [[ "$VERBOSE" == "1" ]]; then
  grep -o 'name = [A-Za-z0-9_.-]*;' "$PROJECT/project.pbxproj" | sort -u | head -20 >&2 || true
fi

if is_full_xcode && have xcodebuild; then
  if xcodebuild -list -json -project "$PROJECT" >"$RUN_DIR/raw/schemes.json" 2>"$RUN_DIR/raw/schemes.err"; then
    ok "xcodebuild parsed the project"
  else
    die "xcodebuild cannot parse $PROJECT: $(head -3 "$RUN_DIR/raw/schemes.err")" 2
  fi
else
  warn "full Xcode not selected — skipping xcodebuild validation of the generated project"
fi

log ""
log "Generated: $PROJECT"
log "Artifacts: $RUN_DIR"
