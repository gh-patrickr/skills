#!/usr/bin/env bash
# Create a new iOS project from this skill's templates.
#
#   bash scaffold.sh --name MyApp [--bundle-id com.example.myapp] [--dest DIR] [--force] [--no-gen]
#
# Copies templates/, substitutes the app name and bundle id, then generates the project when
# xcodegen is installed. Refuses to overwrite unless --force.
# Exit 2 on bad arguments or a non-empty destination.

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
BUNDLE_ID=""
DEST="."
FORCE=0
DO_GEN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)      NAME="${2:?}"; shift 2 ;;
    --bundle-id) BUNDLE_ID="${2:?}"; shift 2 ;;
    --dest)      DEST="${2:?}"; shift 2 ;;
    --force)     FORCE=1; shift ;;
    --no-gen)    DO_GEN=0; shift ;;
    -h|--help)   sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

[[ -n "$NAME" ]] || die "--name is required (e.g. --name MyApp)" 2
[[ "$NAME" =~ ^[A-Za-z][A-Za-z0-9]*$ ]] || die "--name must start with a letter and contain only letters/digits: $NAME" 2
if [[ -z "$BUNDLE_ID" ]]; then
  BUNDLE_ID="com.example.$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]')"
fi
[[ "$BUNDLE_ID" =~ ^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$ ]] \
  || die "--bundle-id is not a reverse-DNS identifier: $BUNDLE_ID" 2

mkdir -p -- "$DEST"
DEST="$(cd -- "$DEST" && pwd -P)"

if [[ -n "$(ls -A "$DEST" 2>/dev/null || true)" && "$FORCE" != "1" ]]; then
  die "destination is not empty: $DEST (pass --force to scaffold into it anyway)" 2
fi

TEMPLATES="$SKILL_DIR/templates"
[[ -d "$TEMPLATES" ]] || die "templates directory missing from the skill: $TEMPLATES" 2

cp -R "$TEMPLATES/." "$DEST/"

# Substitute names in every text file the templates contain.
count=0
while IFS= read -r -d '' file; do
  sed -i '' -e "s/MyApp/$NAME/g" -e "s/com\.example\.myapp/$BUNDLE_ID/g" "$file"
  count=$((count + 1))
done < <(find "$DEST" -type f -print0)

# Vendor the pipeline so CI and the project stay self-contained.
mkdir -p "$DEST/scripts/apple"
for file in "$SKILL_DIR"/scripts/*; do
  case "$(basename "$file")" in scaffold.sh|publish.sh) continue ;; esac
  cp "$file" "$DEST/scripts/apple/"
done
chmod +x "$DEST"/scripts/apple/*.sh "$DEST"/scripts/apple/*.py 2>/dev/null || true

ok "scaffolded $NAME ($BUNDLE_ID) into $DEST — $count files + scripts/apple"

if [[ "$DO_GEN" == "1" ]]; then
  if have xcodegen; then
    bash "$SCRIPT_DIR/gen.sh" --root "$DEST"
  else
    warn "xcodegen not installed — run 'brew install xcodegen' then 'bash $SCRIPT_DIR/gen.sh --root $DEST'"
  fi
fi

log ""
log "Next:"
log "  bash $DEST/scripts/apple/swift_test.sh --root $DEST"
log "  bash $DEST/scripts/apple/preflight.sh --root $DEST"
log "  bash $DEST/scripts/apple/verify.sh --root $DEST"
