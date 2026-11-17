# Runtime health profile — Example Catalog Project

Reference implementation of the global `runtime-health-verification` skill.

## Recognition

- `pyproject.toml` declares `name = "catalog-app"`; `scripts/runtime_health.py` exists.
- The web server is the only DuckDB writer; the UI is what the user judges.
- Root `AGENTS.md` carries the engineering rules (single writer, job paths, human data).

## Probe

```bash
.venv/bin/python scripts/runtime_health.py          # exit 0 healthy, 1 unhealthy, 2 down
.venv/bin/python scripts/runtime_health.py --json   # machine-readable report
```

Checks encoded in the script (do not re-implement by hand):

| Check | Pass condition |
| --- | --- |
| Server reachable | `GET /api/health` answers 200 on port 9000 (`CATALOG_WEB_PORT` overrides) |
| Right app | payload `app == "catalog-app"`, `db_path` points at this checkout's `data/catalog.duckdb` |
| Database usable | `db_writable is true`, `lock_error is null` |
| Schema current | `schema_version == latest_schema_version`, nothing pending |
| Human data intact | `human_data.healthy is true` |
| UI renders | `GET /` (following the filter redirect) answers 200 `text/html` with a body |

## Lifecycle

```bash
.venv/bin/catalog stop     # graceful; clears stale server state
.venv/bin/catalog serve    # foreground; run as a harness-managed background job
```

- Default UI <http://127.0.0.1:9000>; mobile `/m`, admin `/admin`.
- Add `--lan` only if the previous server served the LAN; the default stays loopback-only.
- Never `nohup`, `&`, `disown`, or auto-launch a detached server.

## Decision table specifics

- Exit 0 and nothing under `src/` changed → leave it running.
- Exit 0 but anything under `src/` changed → restart (uvicorn serves modules imported at
  startup), then re-probe.
- Exit 2 with a non-catalog process on the port → do not kill it; report the conflict and
  choose another `CATALOG_WEB_PORT`.
- A locked database is usually another process: `catalog stop`, report the holder, never
  delete `data/catalog.duckdb`.

## Data safety

- The probe is read-only; it must never migrate, repair or write rows.
- If `human_data.healthy` is false, stop restarting and follow `AGENTS.md#engineering-rules`
  and `src/catalog/storage/ARCHITECTURE.md`.
- Never delete `data/catalog.duckdb`, the raw lake or media to "fix" a probe.

## Related skills

- `systematic-change-impact` — required before any change that can alter stored tables.
- `okf-architecture-maintenance` — regenerate the bundle after file changes.
- `clean-checkout-delivery` — baseline, tests, OKF, probe, scoped commits.
