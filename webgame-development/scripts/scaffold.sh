#!/usr/bin/env bash
# Scaffold a new webgame, or adopt the automation layer into an existing project.
#
#   scripts/scaffold.sh --name "My Game" --dest .
#   scripts/scaffold.sh --into . --adopt
#
# Safe by default: a non-empty destination requires --force, and adopt mode never
# overwrites an existing file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SKILL_DIR/templates/game"

NAME=""
DEST=""
MODE="new"
INSTALL=0
FORCE=0

usage() {
  cat <<'EOF'
Usage:
  scaffold.sh --name "My Game" --dest DIR [--install] [--force]
  scaffold.sh --into DIR --adopt

  --name NAME    project name (package.json + README title)
  --dest DIR     destination for a new project (default: .)
  --into DIR     existing project to adopt the tooling into
  --adopt        with --into/--dest, copy only missing tooling files
  --install      run npm install after scaffolding
  --force        allow scaffolding into a non-empty directory
  -h, --help     this message
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:?--name needs a value}"; shift 2 ;;
    --name=*) NAME="${1#*=}"; shift ;;
    --dest) DEST="${2:?--dest needs a value}"; shift 2 ;;
    --dest=*) DEST="${1#*=}"; shift ;;
    --into) DEST="${2:?--into needs a value}"; MODE="adopt"; shift 2 ;;
    --into=*) DEST="${1#*=}"; MODE="adopt"; shift ;;
    --adopt) MODE="adopt"; shift ;;
    --install) INSTALL=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[ -f "$TEMPLATE/package.json" ] || {
  echo "template missing at $TEMPLATE" >&2
  exit 2
}

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

install_deps() {
  if [ "$INSTALL" -eq 1 ]; then
    echo "installing dependencies…"
    ( cd "$DEST" && npm install --no-audit --no-fund )
  fi
}

if [ "$MODE" = "adopt" ]; then
  DEST="${DEST:-.}"
  [ -f "$DEST/package.json" ] || { echo "adopt mode needs an existing package.json in $DEST" >&2; exit 2; }
  echo "adopting tooling into $DEST (existing files are never overwritten)"
  for entry in tools tests .wg.json vitest.config.ts .github public/assets; do
    if [ -e "$DEST/$entry" ]; then
      echo "  skip  $entry (exists)"
    else
      mkdir -p "$DEST/$(dirname "$entry")"
      if [ -d "$TEMPLATE/$entry" ]; then
        cp -R "$TEMPLATE/$entry" "$DEST/$entry"
      else
        cp "$TEMPLATE/$entry" "$DEST/$entry"
      fi
      echo "  add   $entry"
    fi
  done
  cat <<'EOF'

Next, merge these manually (the script will not edit your files):
  1. package.json scripts: copy the "scripts" block from templates/game/package.json
     (verify, dev, test:e2e, playtest, perf, watch, …).
  2. devDependencies: @playwright/test, @vitest/coverage-v8, axe-core,
     typescript, vite, vitest.
  3. vite.config.ts: add gameBridge({ e2e: mode === 'e2e' }) and assetManifest(),
     define __WG_E2E__, and build.outDir 'dist-e2e' for mode e2e.
  4. tsconfig: strict + include tools/**/*.ts.
  5. Then run: node tools/wg.mjs doctor && node tools/wg.mjs verify --fast
EOF
  install_deps
  exit 0
fi

DEST="${DEST:-.}"
[ -n "$NAME" ] || { echo "--name is required for a new project" >&2; usage >&2; exit 1; }

if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ] && [ "$FORCE" -ne 1 ]; then
  echo "refusing to scaffold into non-empty $DEST (use --force)" >&2
  exit 2
fi

mkdir -p "$DEST"
echo "creating $NAME in $DEST"
rsync -a \
  --exclude node_modules --exclude dist --exclude dist-e2e \
  --exclude artifacts --exclude .wg \
  "$TEMPLATE/" "$DEST/"

SLUG="$(slugify "$NAME")"
[ -n "$SLUG" ] || SLUG="webgame"
node - "$DEST/package.json" "$SLUG" "$NAME" <<'NODE'
const fs = require('node:fs');
const [file, slug, name] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.name = slug;
pkg.description = `${name} — a deterministic webgame.`;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE

cat <<EOF

Next:
  cd "$DEST"
  npm install
  node tools/wg.mjs verify

The first verify creates artifacts/<run>/summary.md. Read it before editing code.
Game rules live in src/game/ (keep it DOM-free); visuals in src/render/.
EOF

install_deps
