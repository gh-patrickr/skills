#!/usr/bin/env bash
# Shared helpers for the Apple app toolchain. Source this file; never execute it directly.
# shellcheck shell=bash

if [[ -z "${_APPLE_SKILL_LIB:-}" ]]; then
_APPLE_SKILL_LIB=1

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SKILL_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

export TZ="${TZ:-UTC}"

log()  { printf '%s\n' "$*" >&2; }
info() { printf '  %s\n' "$*" >&2; }
ok()   { printf '[ok]   %s\n' "$*" >&2; }
warn() { printf '[warn] %s\n' "$*" >&2; }
fail() { printf '[fail] %s\n' "$*" >&2; }

die() {
  local message="$1" code="${2:-1}"
  fail "$message"
  exit "$code"
}

have() { command -v -- "$1" >/dev/null 2>&1; }

# Print the active developer directory (may be CommandLineTools).
xcode_dev_dir() { xcode-select -p 2>/dev/null || true; }

# True when a full Xcode.app is selected (CommandLineTools cannot build apps).
is_full_xcode() {
  local dir="${1:-$(xcode_dev_dir)}"
  case "$dir" in
    *.app/Contents/Developer) return 0 ;;
    *) return 1 ;;
  esac
}

# Resolve the project root: explicit --root, $APP_ROOT, or nearest ancestor with a project.
resolve_root() {
  local explicit="${1:-}"
  if [[ -n "$explicit" ]]; then
    [[ -d "$explicit" ]] || die "root does not exist: $explicit"
    (cd -- "$explicit" && pwd -P)
    return 0
  fi
  if [[ -n "${APP_ROOT:-}" ]]; then
    [[ -d "$APP_ROOT" ]] || die "APP_ROOT does not exist: $APP_ROOT"
    (cd -- "$APP_ROOT" && pwd -P)
    return 0
  fi
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/project.yml" ]] || compgen -G "$dir/*.xcodeproj" >/dev/null 2>&1; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname -- "$dir")"
  done
  printf '%s\n' "$PWD"
}

# One artifact directory per run, never reused.
new_run_dir() {
  local root="$1"
  if [[ -n "${APP_RUN_DIR:-}" ]]; then
    mkdir -p -- "$APP_RUN_DIR/raw" "$APP_RUN_DIR/steps"
    printf '%s\n' "$APP_RUN_DIR"
    return 0
  fi
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  local dir="$root/artifacts/$stamp"
  local n=1
  while [[ -e "$dir" ]]; do
    dir="$root/artifacts/${stamp}-$n"
    n=$((n + 1))
  done
  mkdir -p -- "$dir/raw"
  printf '%s\n' "$dir"
}

# JUnit-ish escape for the JSON emitter below.
json_str() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/ }"
  s="${s//$'\r'/ }"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}

# Verify that a full Xcode is installed before an app-layer command.
require_xcode() {
  local dir
  dir="$(xcode_dev_dir)"
  if [[ -z "$dir" ]]; then
    die "no developer directory selected. Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" 2
  fi
  if ! is_full_xcode "$dir"; then
    die "active developer directory is '$dir' (Command Line Tools). iOS/watchOS apps need full Xcode.
  Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  Inspect the machine with: bash $SCRIPT_DIR/preflight.sh" 2
  fi
  have xcodebuild || die "xcodebuild not found even though Xcode is selected at $dir" 2
}

# First scheme name declared in project.yml (best effort, used only as a default).
default_scheme() {
  local root="$1"
  [[ -f "$root/project.yml" ]] || return 1
  awk '
    /^targets:/ { in_targets = 1; next }
    in_targets && /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
      name = $1; sub(":", "", name); print name; exit
    }
    in_targets && /^[A-Za-z]/ { exit }
  ' "$root/project.yml"
}

# First local-package test target under Core/ (used by swift_test.sh).
has_core_package() { [[ -f "${1:-.}/Core/Package.swift" ]]; }

# Print key=value pairs for a small config file, e.g. .xcode-version.
read_pin() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  tr -d '[:space:]' <"$file"
}

done_marker() { printf '\n'; }
fi
