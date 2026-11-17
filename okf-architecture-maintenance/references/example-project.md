# OKF profile — Example Catalog Project

Reference implementation of the global `okf-architecture-maintenance` skill. It shows one
concrete project configuration (`catalog-app`); the skill itself stays generic.

## How to recognise this project

- `pyproject.toml` declares `name = "catalog-app"` and the `catalog` console script.
- Root `index.md` carries `okf_version: "0.1"`; generator is `scripts/okf.py`
  (a `SPECS` mapping of `FolderSpec`s and per-folder file tuples).
- Enforcement test: `tests/unit/test_okf_docs.py`.
- Root `AGENTS.md` repeats the always-on rules for agents; read it before big changes.

## Commands

Use the project virtualenv, never the system interpreter:

```bash
.venv/bin/python scripts/okf.py --write
.venv/bin/python scripts/okf.py --check
.venv/bin/python -m pytest -q tests/unit/test_okf_docs.py
```

If `.venv/` is absent, `uv run python …` creates/uses the managed environment.

## Bundle shape

- Root documents the package plus the top-level folders (`src/`, `tests/`, `scripts/`,
  `data/` described in prose).
- `src/catalog/**` documents ingestion, storage, processing, web, and jobs.
- `tests/**` mirrors the source tree; fixtures are documented per source/adapter.
- `scripts/**` documents the operational entry points (`okf.py`, `runtime_health.py`, …).
- `data/` is runtime state (DuckDB file, raw lake, media, browser profiles, logs) and is
  described in prose only — never enumerate its hash-named files.
- `.venv/`, `.uv-cache/`, `data/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`,
  `node_modules/` are excluded via `EXCLUDED_DIRS`.

## Drift traps

- Adding an adapter or a CLI subcommand usually adds a file under `src/` **and** a fixture
  folder under `tests/fixtures/<source>/` — both need catalog entries.
- Renaming a table or job updates several folder invariants, not just one file row.
- Regenerating writes a `timestamp`; a stale timestamp is the visible signal that someone
  edited files without running `--write`.

## Interaction with the other always-on skills

- `runtime-health-verification` — probe port 9000 after every prompt; see its
  `references/example-project.md` profile for the exact gate.
- `systematic-change-impact` — required when the change can alter stored DuckDB tables.
- `clean-checkout-delivery` — baseline the tree before editing, scan for privacy/secrets,
  and commit source + docs together.
