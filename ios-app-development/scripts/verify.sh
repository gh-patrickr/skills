#!/usr/bin/env bash
# The gate: preflight → core tests → generate → build → unit tests → UI tests → evidence.
#
#   bash verify.sh [--root DIR] [--platform ios|watchos] [--scheme NAME]
#                  [--skip-core] [--skip-ui] [--coverage-min 0.75] [--core-coverage-min 0.90]
#                  [--strict] [--ci]
#
# Writes artifacts/<run>/summary.md, junit.xml, *.xcresult and raw logs.
# Exit 0 all green, 1 a step failed, 2 the machine cannot build apps (evidence is partial).

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
PLATFORM="ios"
SCHEME=""
SKIP_CORE=0
SKIP_UI=0
COVERAGE_MIN="0.75"
CORE_COVERAGE_MIN="0.90"
STRICT=0
CI=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)              ROOT="${2:?}"; shift 2 ;;
    --platform)          PLATFORM="${2:?}"; shift 2 ;;
    --scheme)            SCHEME="${2:?}"; shift 2 ;;
    --skip-core)         SKIP_CORE=1; shift ;;
    --skip-ui)           SKIP_UI=1; shift ;;
    --coverage-min)      COVERAGE_MIN="${2:?}"; shift 2 ;;
    --core-coverage-min) CORE_COVERAGE_MIN="${2:?}"; shift 2 ;;
    --strict)            STRICT=1; shift ;;
    --ci)                CI=1; shift ;;
    -h|--help)           sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

ROOT="$(resolve_root "$ROOT")"
RUN_DIR="$(new_run_dir "$ROOT")"
export APP_RUN_DIR="$RUN_DIR"
mkdir -p "$RUN_DIR/steps"

NAMES=(); RESULTS=(); NOTES=()
record() { NAMES+=("$1"); RESULTS+=("$2"); NOTES+=("${3:-}"); }

step() {
  local name="$1"; shift
  local logfile="$RUN_DIR/raw/$name.log"
  log ""
  log "── $name"
  set +e
  ( "$@" ) 2>&1 | tee "$logfile"
  local rc=${PIPESTATUS[0]}
  set -e
  printf '%s\n' "$rc" >"$RUN_DIR/steps/$name.rc"
  return "$rc"
}

note_from_log() {
  [[ -f "$1" ]] || return 1
  grep -m1 -E "$2" "$1" 2>/dev/null | sed 's/^[[:space:]]*//' || true
}

summary() {
  local state="$1" file="$RUN_DIR/summary.md" i
  local xcode_line xcodegen_line swift_line
  xcode_line="$(xcodebuild -version 2>/dev/null | head -1 || true)"; [[ -n "$xcode_line" ]] || xcode_line="not installed"
  xcodegen_line="$(xcodegen --version 2>/dev/null | head -1 || true)"; [[ -n "$xcodegen_line" ]] || xcodegen_line="not installed"
  swift_line="$(swift --version 2>/dev/null | head -1 || true)"; [[ -n "$swift_line" ]] || swift_line="not installed"

  {
    printf '# Verify — %s — %s\n\n' "$(basename "$ROOT")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'State: **%s**\n\n' "$state"
    printf '| Step | Result | Detail |\n| --- | --- | --- |\n'
    for i in "${!NAMES[@]}"; do
      printf '| %s | %s | %s |\n' "${NAMES[$i]}" "${RESULTS[$i]}" "${NOTES[$i]}"
    done
    printf '\n## Environment\n\n'
    printf -- '- xcode: %s\n' "$xcode_line"
    printf -- '- xcodegen: %s\n' "$xcodegen_line"
    printf -- '- swift: %s\n' "$swift_line"
    printf -- '- platform: %s\n' "$PLATFORM"
    printf -- '- root: `%s`\n' "$ROOT"
    printf '\n## Artifacts\n\n'
    find "$RUN_DIR" -maxdepth 2 -type f ! -name 'summary.md' 2>/dev/null | sort | sed "s|$RUN_DIR/|- |"
    if [[ "$state" != "passed" ]]; then
      printf '\n## First failures\n\n'
      for i in "${!NAMES[@]}"; do
        [[ "${RESULTS[$i]}" == "fail" ]] || continue
        printf '### %s\n\n```\n' "${NAMES[$i]}"
        grep -m6 -E '(error:|failed|FAIL|✘|\[fail\])' "$RUN_DIR/raw/${NAMES[$i]}.log" 2>/dev/null || printf 'see raw/%s.log\n' "${NAMES[$i]}"
        printf '```\n\n'
      done
    fi
  } >"$file"
  log "Summary: $file"
}

# ---------------------------------------------------------------- preflight

rc=0; step preflight bash "$SCRIPT_DIR/preflight.sh" --platform "$PLATFORM" --root "$ROOT" || rc=$?
case "$rc" in
  0|3)
    record preflight pass "$(note_from_log "$RUN_DIR/raw/preflight.log" 'RESULT:')"
    ;;
  *)
    record preflight fail "environment not ready — see raw/preflight.log"
    if [[ "$SKIP_CORE" == "0" && -f "$ROOT/Core/Package.swift" ]]; then
      log ""
      log "Xcode is not usable here. Running the layers that do not need it."
      rc2=0; step core bash "$SCRIPT_DIR/swift_test.sh" --root "$ROOT" --coverage --coverage-min "$CORE_COVERAGE_MIN" || rc2=$?
      if [[ "$rc2" -eq 0 ]]; then
        record core pass "$(note_from_log "$RUN_DIR/raw/core.log" 'Core line coverage:')"
      else
        record core fail "see raw/core.log"
      fi
      if [[ -d "$ROOT/App" || -d "$ROOT/Sources" ]]; then
        rc3=0; step typecheck bash "$SCRIPT_DIR/typecheck.sh" --root "$ROOT" || rc3=$?
        if [[ "$rc3" -eq 0 ]]; then
          record typecheck pass "proxy only (macOS SDK)"
        else
          record typecheck fail "see raw/typecheck.log"
        fi
      fi
    fi
    summary "partial"
    fail "App layer NOT verified: install Xcode and re-run ($RUN_DIR/summary.md)"
    exit 2
    ;;
esac

# ---------------------------------------------------------------- core

if [[ "$SKIP_CORE" == "0" && -f "$ROOT/Core/Package.swift" ]]; then
  rc=0; step core bash "$SCRIPT_DIR/swift_test.sh" --root "$ROOT" --coverage --coverage-min "$CORE_COVERAGE_MIN" ${STRICT:+--strict} || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    record core pass "$(note_from_log "$RUN_DIR/raw/core.log" 'Core line coverage:')"
  else
    record core fail "see raw/core.log"
  fi
else
  record core skip "no Core package, or --skip-core"
fi

# ---------------------------------------------------------------- generate

if [[ ! -f "$ROOT/project.yml" ]]; then
  record generate fail "no project.yml"
  summary "failed"
  die "no project.yml in $ROOT — scaffold a project first" 1
fi
rc=0; step generate bash "$SCRIPT_DIR/gen.sh" --root "$ROOT" || rc=$?
if [[ "$rc" -ne 0 ]]; then
  record generate fail "see raw/generate.log"
  summary "failed"
  die "generation failed — stopping before the app layer" 1
fi
record generate pass "$(note_from_log "$RUN_DIR/raw/generate.log" 'schemes:')"

# ---------------------------------------------------------------- lint (optional tool)

if have swiftlint && [[ -f "$ROOT/.swiftlint.yml" ]]; then
  pushd "$ROOT" >/dev/null
  rc=0; step lint swiftlint --strict --quiet || rc=$?
  popd >/dev/null
  if [[ "$rc" -eq 0 ]]; then
    record lint pass "swiftlint --strict"
  else
    record lint fail "see raw/lint.log"
  fi
else
  record lint skip "swiftlint not installed or no .swiftlint.yml"
fi

# ---------------------------------------------------------------- build

rc=0
step build bash "$SCRIPT_DIR/build.sh" --root "$ROOT" --platform "$PLATFORM" ${SCHEME:+--scheme "$SCHEME"} ${STRICT:+--strict} || rc=$?
if [[ "$rc" -ne 0 ]]; then
  record build fail "see raw/build.log"
  summary "failed"
  die "build failed" 1
fi
record build pass "Debug, unsigned"

# ---------------------------------------------------------------- unit tests

UNIT_RESULT="$RUN_DIR/unit.xcresult"
rc=0
step unit bash "$SCRIPT_DIR/test.sh" --root "$ROOT" --only unit --coverage \
  --result-bundle "$UNIT_RESULT" ${SCHEME:+--scheme "$SCHEME"} --platform "$PLATFORM" ${STRICT:+--strict} || rc=$?
if [[ "$rc" -eq 0 ]]; then
  unit_line="$(python3 "$SCRIPT_DIR/xcresult.py" --xcresult "$UNIT_RESULT" --summary-only 2>/dev/null | head -1 || true)"
  record unit pass "${unit_line:-see raw/unit.log}"
else
  record unit fail "see raw/unit.log"
fi

# Coverage gate + JUnit, from the unit result bundle.
COV_RC=3
if [[ -f "$UNIT_RESULT" ]]; then
  set +e
  python3 "$SCRIPT_DIR/xcresult.py" --xcresult "$UNIT_RESULT" --out "$RUN_DIR" \
    --junit "$RUN_DIR/junit.xml" --coverage-min "$COVERAGE_MIN" --summary-only >"$RUN_DIR/raw/coverage.log" 2>&1
  COV_RC=$?
  set -e
fi
case "$COV_RC" in
  0) record coverage pass "$(note_from_log "$RUN_DIR/raw/coverage.log" 'coverage:')" ;;
  1) record coverage fail "$(note_from_log "$RUN_DIR/raw/coverage.log" 'below')" ;;
  *) record coverage skip "result parsing unavailable or no bundle" ;;
esac

# ---------------------------------------------------------------- ui tests

if [[ "$SKIP_UI" == "1" ]]; then
  record ui skip "--skip-ui (UI NOT verified)"
elif [[ "$rc" -ne 0 ]]; then
  record ui skip "unit tests failed first"
else
  rc=0
  step ui bash "$SCRIPT_DIR/test.sh" --root "$ROOT" --only ui \
    --result-bundle "$RUN_DIR/ui.xcresult" ${SCHEME:+--scheme "$SCHEME"} --platform "$PLATFORM" || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    record ui pass "$(note_from_log "$RUN_DIR/raw/ui.log" 'TESTS PASSED')"
  else
    record ui fail "see raw/ui.log"
  fi
fi

# ---------------------------------------------------------------- verdict

failures=0
for r in "${RESULTS[@]}"; do [[ "$r" == "fail" ]] && failures=$((failures + 1)); done

if [[ "$failures" -eq 0 ]]; then
  summary "passed"
  log ""
  ok "VERIFIED — $RUN_DIR/summary.md"
  exit 0
fi

summary "failed"
log ""
fail "$failures failing step(s) — $RUN_DIR/summary.md"
exit 1
