#!/usr/bin/env bash
# Publish this skill to the user-level skills root so every workspace can load it.
#
#   bash publish.sh [--dry-run] [--target DIR]
#
# Publishes only the skill that contains this script. Never deletes another skill.
# If the installed copy differs, it is moved to $DSH_HOME/skill-backups/<name>-<timestamp>
# before the new copy is written. Backups stay OUTSIDE the scanned skills root, so they can
# never be discovered as duplicate skills.
#
# Exit: 0 published or already current, 1 invalid skill, 2 unsafe destination.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SKILL_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

ok()   { printf '[ok]   %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*"; }
die()  { printf '[fail] %s\n' "$*" >&2; exit "${2:-1}"; }

DRY_RUN=0
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --target)  TARGET="${2:?--target needs a directory}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" 2 ;;
  esac
done

[[ -f "$SKILL_DIR/SKILL.md" ]] || die "no SKILL.md in $SKILL_DIR — publish.sh must live in <skill>/scripts/" 1

NAME="$(sed -n 's/^name:[[:space:]]*//p' "$SKILL_DIR/SKILL.md" | head -1 | tr -d "\"'" | tr -d '[:space:]')"
DESCRIPTION="$(sed -n 's/^description:[[:space:]]*//p' "$SKILL_DIR/SKILL.md" | head -1)"
[[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || die "SKILL.md name must be kebab-case, got '$NAME'" 1
[[ -n "$DESCRIPTION" ]] || die "SKILL.md needs a non-empty description" 1

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SKILLS_ROOT="${TARGET:-$DSH_HOME/skills}"
BACKUP_ROOT="$DSH_HOME/skill-backups"
DEST="$SKILLS_ROOT/$NAME"

SRC_REAL="$SKILL_DIR"
if [[ -d "$DEST" ]]; then
  DEST_REAL="$(cd -- "$DEST" && pwd -P)"
  if [[ "$DEST_REAL" == "$SRC_REAL" ]]; then
    ok "$NAME is already installed here ($DEST) — nothing to publish"
    exit 0
  fi
  if diff -r "$SRC_REAL" "$DEST_REAL" >/dev/null 2>&1; then
    ok "$NAME is up to date ($DEST)"
    exit 0
  fi
  MODE="replace"
else
  MODE="install"
fi

info "skill:  $NAME"
info "source: $SRC_REAL"
info "target: $DEST"
if [[ "$MODE" == "replace" ]]; then
  info "backup: $BACKUP_ROOT/$NAME-<UTC timestamp> (outside the scanned skills root)"
else
  info "action: first install"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  warn "dry run — nothing written"
  exit 0
fi

mkdir -p -- "$SKILLS_ROOT"
if [[ "$MODE" == "replace" ]]; then
  mkdir -p -- "$BACKUP_ROOT"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP="$BACKUP_ROOT/$NAME-$STAMP"
  n=1
  while [[ -e "$BACKUP" ]]; do BACKUP="$BACKUP_ROOT/$NAME-$STAMP-$n"; n=$((n + 1)); done
  mv -- "$DEST" "$BACKUP"
  ok "backed up the previous copy to $BACKUP"
fi

cp -R -- "$SRC_REAL" "$DEST"
chmod +x "$DEST"/scripts/*.sh "$DEST"/scripts/*.py 2>/dev/null || true

diff -r "$SRC_REAL" "$DEST" >/dev/null 2>&1 || die "copy verification failed for $DEST — the installed copy differs" 1

COUNT="$(find "$DEST" -type f | wc -l | tr -d ' ')"
ok "published $NAME ($COUNT files) -> $DEST"
