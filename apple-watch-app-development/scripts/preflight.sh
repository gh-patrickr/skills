#!/usr/bin/env bash
# Preflight for iOS / watchOS development. Reports exactly what is missing and how to fix it.
#
#   bash preflight.sh [--platform ios|watchos|both] [--root DIR] [--json] [--fix] [--strict]
#
# Exit codes: 0 ready, 2 a required piece is missing, 3 ready but optional tools are missing.
# --fix runs the safe, non-sudo repairs it can (platform downloads, brew installs).
# --strict also treats missing optional tools as failure (exit 2).

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

PLATFORM="watchos"
ROOT=""
JSON=0
FIX=0
STRICT=0

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="${2:?--platform needs a value}"; shift 2 ;;
    --root)     ROOT="${2:?--root needs a value}"; shift 2 ;;
    --json)     JSON=1; shift ;;
    --fix)      FIX=1; shift ;;
    --strict)   STRICT=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done
case "$PLATFORM" in ios|watchos|both) ;; *) die "--platform must be ios, watchos or both" ;; esac

ROOT="$(resolve_root "$ROOT")"

IDS=(); STATUSES=(); MESSAGES=(); FIXES=()
add() { IDS+=("$1"); STATUSES+=("$2"); MESSAGES+=("$3"); FIXES+=("${4:-}"); }

# ---------------------------------------------------------------- checks

if [[ "$(uname -s)" == "Darwin" ]]; then
  add macos pass "macOS $(sw_vers -productVersion)" ""
else
  add macos fail "not macOS" "iOS/watchOS development requires macOS"
fi

DEV_DIR="$(xcode_dev_dir)"
if [[ -z "$DEV_DIR" ]]; then
  add xcode-select fail "no active developer directory" \
    "Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
elif is_full_xcode "$DEV_DIR"; then
  if have xcodebuild && XCODE_VERSION="$(xcodebuild -version 2>/dev/null | head -1)"; then
    add xcode pass "$XCODE_VERSION ($DEV_DIR)" ""
  else
    add xcode fail "Xcode selected at $DEV_DIR but xcodebuild does not run" \
      "sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
  fi
else
  add xcode fail "Command Line Tools only ($DEV_DIR) — cannot build app bundles" \
    "Install Xcode: 'xcodes install 26.0' or the App Store, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
fi

FULL_XCODE=0
is_full_xcode "$DEV_DIR" && have xcodebuild && FULL_XCODE=1

if [[ "$FULL_XCODE" == "1" ]]; then
  if xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
    add first-launch pass "Xcode first-launch components installed" ""
  else
    add first-launch fail "Xcode first-launch tasks are pending" \
      "sudo xcodebuild -runFirstLaunch   # needs an administrator password once"
  fi
else
  add first-launch skip "skipped (no full Xcode)" ""
fi

need_ios=0; need_watch=0
case "$PLATFORM" in
  ios) need_ios=1 ;;
  watchos) need_watch=1 ;;
  both) need_ios=1; need_watch=1 ;;
esac

if [[ "$FULL_XCODE" == "1" ]]; then
  SHOWSDKS="$(xcodebuild -showsdks 2>/dev/null || true)"
  if [[ "$need_ios" == "1" ]]; then
    if grep -q "iphonesimulator" <<<"$SHOWSDKS"; then
      add ios-sdk pass "iOS Simulator SDK present" ""
    else
      add ios-sdk fail "iOS Simulator SDK missing" "xcodebuild -downloadPlatform iOS"
    fi
  fi
  if [[ "$need_watch" == "1" ]]; then
    if grep -q "watchsimulator" <<<"$SHOWSDKS"; then
      add watchos-sdk pass "watchOS Simulator SDK present" ""
    else
      add watchos-sdk fail "watchOS Simulator SDK missing" "xcodebuild -downloadPlatform watchOS"
    fi
  fi

  RUNTIMES="$(xcrun simctl list runtimes 2>/dev/null || true)"
  if [[ "$need_ios" == "1" ]]; then
    if grep -Eq "iOS [0-9]+(\.[0-9]+)+" <<<"$RUNTIMES"; then
      add ios-runtime pass "$(grep -Eo 'iOS [0-9]+(\.[0-9]+)+' <<<"$RUNTIMES" | sort -u | tail -1) runtime" ""
    else
      add ios-runtime fail "no iOS simulator runtime installed" "xcodebuild -downloadPlatform iOS"
    fi
  fi
  if [[ "$need_watch" == "1" ]]; then
    if grep -Eq "watchOS [0-9]+(\.[0-9]+)+" <<<"$RUNTIMES"; then
      add watchos-runtime pass "$(grep -Eo 'watchOS [0-9]+(\.[0-9]+)+' <<<"$RUNTIMES" | sort -u | tail -1) runtime" ""
    else
      add watchos-runtime fail "no watchOS simulator runtime installed" "xcodebuild -downloadPlatform watchOS"
    fi
  fi

  DEVICES="$(xcrun simctl list devices available 2>/dev/null || true)"
  if [[ "$need_ios" == "1" ]]; then
    if grep -q "iPhone" <<<"$DEVICES"; then
      add ios-device pass "iPhone simulator available" ""
    else
      add ios-device fail "no iPhone simulator device" "xcrun simctl create 'iPhone 16' com.apple.CoreSimulator.SimDeviceType.iPhone-16"
    fi
  fi
  if [[ "$need_watch" == "1" ]]; then
    if grep -q "Apple Watch" <<<"$DEVICES"; then
      add watchos-device pass "Apple Watch simulator available" ""
    else
      add watchos-device fail "no Apple Watch simulator device" "Open Xcode > Settings > Components, or: xcrun simctl create 'Apple Watch Series 11 (46mm)'"
    fi
  fi
else
  [[ "$need_ios" == "1" ]] && add ios-sdk fail "skipped (no full Xcode)" "install Xcode first"
  [[ "$need_watch" == "1" ]] && add watchos-sdk fail "skipped (no full Xcode)" "install Xcode first"
fi

if have xcodegen; then
  add xcodegen pass "xcodegen $(xcodegen --version 2>/dev/null | awk '{print $NF}')" ""
else
  add xcodegen fail "xcodegen not installed" "brew install xcodegen"
fi

# Core-layer tests work with Command Line Tools alone; report the capability, do not fail.
if have swift; then
  add swift pass "$(swift --version 2>/dev/null | head -1)" ""
  if [[ "$FULL_XCODE" == "1" ]]; then
    add core-tests pass "Core package tests can run" ""
  else
    add core-tests pass "Core package tests can run on Command Line Tools (scripts/swift_test.sh)" ""
  fi
else
  add swift fail "no Swift toolchain" "xcode-select --install"
fi

add_optional() {
  local id="$1" bin="$2" why="$3" fix="$4"
  if have "$bin"; then
    add "$id" pass "$bin installed" ""
  else
    add "$id" optional "$bin missing — $why" "$fix"
  fi
}
add_optional xcbeautify xcbeautify "logs stay raw" "brew install xcbeautify"
add_optional swiftlint swiftlint "style gate off" "brew install swiftlint"
add_optional swiftformat swiftformat "formatting gate off" "brew install swiftformat"
add_optional python3 python3 "JSON evidence fallbacks limited" "xcode-select --install"

# Version pins, if the project carries them.
if [[ -f "$ROOT/.xcode-version" && "$FULL_XCODE" == "1" ]]; then
  PINNED="$(read_pin "$ROOT/.xcode-version" || true)"
  ACTUAL="$(xcodebuild -version 2>/dev/null | head -1 | awk '{print $2}')"
  if [[ -n "$PINNED" && -n "$ACTUAL" ]]; then
    if [[ "$ACTUAL" == "$PINNED"* ]]; then
      add xcode-version pass "Xcode $ACTUAL matches pin $PINNED" ""
    else
      add xcode-version optional "Xcode $ACTUAL, project pins $PINNED" "xcodes install $PINNED && sudo xcode-select -s /Applications/Xcode-$PINNED.app"
    fi
  fi
fi

# ---------------------------------------------------------------- repair

if [[ "$FIX" == "1" ]]; then
  log ""
  log "Repair mode:"
  for i in "${!IDS[@]}"; do
    [[ "${STATUSES[$i]}" == "fail" || "${STATUSES[$i]}" == "optional" ]] || continue
    fix="${FIXES[$i]}"
    case "$fix" in
      "brew install "*) have brew && { info "running: $fix"; brew install "${fix#brew install }" || warn "brew install failed"; } ;;
      "xcodebuild -downloadPlatform "*) FULL_XCODE=1; info "running: $fix"; $fix || warn "platform download failed (sign in to Xcode may be required)"; ;;
      *) : ;;
    esac
  done
fi

# ---------------------------------------------------------------- report

required_failed=0; optional_missing=0
for s in "${STATUSES[@]}"; do
  [[ "$s" == "fail" ]] && required_failed=$((required_failed + 1))
  [[ "$s" == "optional" ]] && optional_missing=$((optional_missing + 1))
done
ready=1; [[ "$required_failed" -gt 0 ]] && ready=0

if [[ "$JSON" == "1" ]]; then
  printf '{"ready":%s,"platform":"%s","root":%s,"checks":[' "$([[ $ready == 1 ]] && echo true || echo false)" "$PLATFORM" "$(json_str "$ROOT")"
  for i in "${!IDS[@]}"; do
    [[ "$i" -gt 0 ]] && printf ','
    printf '{"id":%s,"status":%s,"message":%s,"fix":%s}' \
      "$(json_str "${IDS[$i]}")" "$(json_str "${STATUSES[$i]}")" \
      "$(json_str "${MESSAGES[$i]}")" "$(json_str "${FIXES[$i]}")"
  done
  printf ']}\n'
else
  log ""
  log "Apple preflight — platform=$PLATFORM root=$ROOT"
  log ""
  for i in "${!IDS[@]}"; do
    case "${STATUSES[$i]}" in
      pass)     ok   "${IDS[$i]}: ${MESSAGES[$i]}" ;;
      skip)     info "${IDS[$i]}: ${MESSAGES[$i]}" ;;
      optional) warn "${IDS[$i]}: ${MESSAGES[$i]}" ;;
      fail)     fail "${IDS[$i]}: ${MESSAGES[$i]}" ;;
    esac
  done
  fixes_printed=0
  for i in "${!IDS[@]}"; do
    [[ -n "${FIXES[$i]}" ]] || continue
    [[ "${STATUSES[$i]}" == "fail" || "${STATUSES[$i]}" == "optional" ]] || continue
    if [[ "$fixes_printed" == "0" ]]; then log ""; log "Fixes:"; fixes_printed=1; fi
    log "  ${IDS[$i]}: ${FIXES[$i]}"
  done
  log ""
  if [[ "$ready" == "1" ]]; then
    if [[ "$optional_missing" -gt 0 ]]; then
      log "RESULT: ready (${optional_missing} optional tool(s) missing)"
    else
      log "RESULT: ready"
    fi
  else
    log "RESULT: not ready — ${required_failed} required check(s) failed"
  fi
fi

if [[ "$ready" == "0" ]]; then exit 2; fi
if [[ "$STRICT" == "1" && "$optional_missing" -gt 0 ]]; then exit 2; fi
if [[ "$optional_missing" -gt 0 ]]; then exit 3; fi
exit 0
