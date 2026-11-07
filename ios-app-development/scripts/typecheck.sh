#!/usr/bin/env bash
# Typecheck the Core package and the app sources against the macOS SDK, without Xcode.
#
#   bash typecheck.sh [--root DIR] [--package Core] [--app App]
#
# This is a PROXY gate: it catches syntax errors, typos, missing symbols and concurrency
# warnings before a simulator build, but it is not an iOS build. Use it when full Xcode is
# unavailable, and always run the real build afterwards.
# Exit 2 when no toolchain/SDK, 1 when typechecking fails.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT=""
PACKAGE="Core"
APP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)    ROOT="${2:?}"; shift 2 ;;
    --package) PACKAGE="${2:?}"; shift 2 ;;
    --app)     APP="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

ROOT="$(resolve_root "$ROOT")"
if [[ -z "$APP" ]]; then
  if [[ -d "$ROOT/App" ]]; then APP="App"
  elif [[ -d "$ROOT/Sources" ]]; then APP="Sources"
  else APP="App"
  fi
fi
SDK="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)"
[[ -n "$SDK" && -d "$SDK" ]] || die "no macOS SDK — install Xcode or Command Line Tools" 2
have swiftc || die "swiftc not found" 2

TARGET="arm64-apple-macos15.0"
[[ "$(uname -m)" == "x86_64" ]] && TARGET="x86_64-apple-macos15.0"
OUT="$ROOT/.build/typecheck"
mkdir -p "$OUT"
export CLANG_MODULE_CACHE_PATH="$OUT/module-cache"

RUN_DIR="$(new_run_dir "$ROOT")"

if [[ -d "$ROOT/$PACKAGE/Sources/$PACKAGE" ]]; then
  log "Compiling $PACKAGE for macOS (module only)"
  CORE_FILES=()
  while IFS= read -r f; do CORE_FILES+=("$f"); done < <(find "$ROOT/$PACKAGE/Sources/$PACKAGE" -name '*.swift')
  set +e
  swiftc -emit-module -emit-library -module-name "$PACKAGE" \
    -emit-module-path "$OUT/$PACKAGE.swiftmodule" -o "$OUT/lib$PACKAGE.dylib" \
    -sdk "$SDK" -target "$TARGET" -swift-version 6 \
    "${CORE_FILES[@]}" >"$RUN_DIR/raw/typecheck-core.log" 2>&1
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    fail "$PACKAGE does not compile:"
    grep -m10 -E "error:" "$RUN_DIR/raw/typecheck-core.log" >&2 || tail -20 "$RUN_DIR/raw/typecheck-core.log" >&2
    exit 1
  fi
  ok "$PACKAGE typechecked"
else
  warn "no $PACKAGE/Sources/$PACKAGE — skipping package step"
fi

if [[ -d "$ROOT/$APP" ]]; then
  log "Typechecking $APP sources against the macOS SDK"
  APP_FILES=()
  while IFS= read -r f; do APP_FILES+=("$f"); done < <(find "$ROOT/$APP" -name '*.swift')
  set +e
  swiftc -typecheck -module-name "${APP//[^A-Za-z0-9_]/_}" \
    -sdk "$SDK" -target "$TARGET" -swift-version 6 \
    -I "$OUT" -L "$OUT" \
    "${APP_FILES[@]}" 2>&1 | tee "$RUN_DIR/raw/typecheck-app.log"
  status=${PIPESTATUS[0]}
  set -e
  if [[ "$status" -ne 0 ]]; then
    fail "$APP does not typecheck"
    exit 1
  fi
  ok "$APP typechecked (proxy only — run the real build)"
fi

log "Artifacts: $RUN_DIR"
