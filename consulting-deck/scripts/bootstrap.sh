#!/usr/bin/env bash
# One-time setup: create .venv with the three dependencies deckkit needs.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
cd "$ROOT"
if [ -x ".venv/bin/python" ] && .venv/bin/python -c "import pptx, yaml, PIL" >/dev/null 2>&1; then
  echo "deckkit: environment already ready (.venv)"
  exit 0
fi
if command -v uv >/dev/null 2>&1; then
  uv venv -p 3.12 .venv
  uv pip install --python .venv/bin/python python-pptx pillow pyyaml
else
  python3 -m venv .venv
  .venv/bin/python -m pip install --quiet --upgrade pip
  .venv/bin/python -m pip install --quiet python-pptx pillow pyyaml
fi
.venv/bin/python - <<'PY'
import pptx, PIL, yaml
print(f"deckkit: ready — python-pptx {pptx.__version__}, Pillow {PIL.__version__}")
PY
