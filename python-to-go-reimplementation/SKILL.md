---
name: python-to-go-reimplementation
description: Use when replacing a running Python service, CLI, data pipeline or web app with Go. Provides a behavior-first parity matrix, frozen-oracle testing, data/writer safety, vertical slices, parallel-agent integration and a real-data cutover checklist that prevent "packages exist but the live app is not migrated".
whenToUse: Use before starting or resuming a Python-to-Go migration, when deciding whether a Go port is "done", when wiring a Go package into an existing service, when porting a Python web UI/CLI/job system, or when a Go rewrite has green unit tests but the live application still runs Python.
---

# Python → Go reimplementation

A port is not a file translation. It is a **behavioral replacement under a frozen oracle**.
Success means every Python-accessible behavior is reachable from a Go entry point (web, CLI,
job), produces equivalent observable output, and is proven against the original before any
cutover.

## Core rule

> **A Go package is not a migrated feature until a Go caller is wired and an end-to-end test
> exercises it on representative data.**

A tested library, a read-only mirror, a 10-row fixture and a hand-written lookalike are
intermediate artifacts. They are not the live migration.

## Phase 0 — inventory and parity matrix

Before writing code, enumerate every Python surface:

- Python entrypoints: web app, CLI commands, workers, cron/systemd jobs, scripts
- HTTP routes: method, path, request encoding, response type, redirects, status codes
- Forms and client JS: action, field names, encodings, polling, confirmations
- Templates, partials, CSS and static assets
- Background job kinds, queues, cancellation, progress and logs
- DB schema, migrations, views, indexes, sequences, protected/human tables
- Config/env keys, file formats, raw/archive layout, cache tables
- Side effects: notifications, emails, webhooks, file moves, subprocesses, browser automation

Write a parity matrix and commit it (`PARITY.md` or `implementation.md`):

| Python surface | Go counterpart | Wired caller | Tests | Live evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `GET /listing/{p}/{id}` | `handleDetail` | yes | golden/HTTP | curl 200 | missing repair/translation |
| `listing_filters.py` | `pipeline.Filters` | partial | unit | API count | incomplete semantics |

Classify every gap as **functional**, **wiring**, **presentation** or **platform**. Count
routes, templates, forms, CLI flags and job kinds. A 3k-line FastAPI app with 55 routes
cannot be declared equivalent from 15 hand-written routes.

## Phase 1 — freeze the oracle

Record real inputs/outputs before changing behavior:

- HTML/JSON fixtures with a manifest (source, date, portal/config)
- API responses including headers, redirects and error bodies
- DB snapshots and exact row counts; table/row comparisons, not counts alone
- Rendered pages and screenshots for every major view
- CLI stdout/exit codes and job stats/errors

For parsers, replay the same fixture through Python and Go and compare field by field.
For DB-producing code, snapshot a database and compare tables/rows. For web, capture rendered
HTML and status codes; "it looks similar" is not evidence.

**Resolve contradictions before porting.** If Python's page, API and DB disagree (a real
failure mode), choose an explicit oracle and write it down. Never silently copy one number
or declare the discrepancy "documented" instead of resolved/quarantined.

## Phase 2 — seams and vertical slices

Port in slices, not layers. A slice is complete only with:

1. pure domain logic and oracle tests;
2. I/O adapter plus fake;
3. storage/transaction path (single writer, idempotent);
4. a caller: HTTP route, CLI command or job kind;
5. an integration/E2E assertion on a throwaway DB or copy;
6. docs/OKF/catalog updates.

Useful Go seams:

| Python dependency | Go seam |
| --- | --- |
| `requests`/`httpx`/`curl_cffi` | `HTTPDoer` interface + real `http.Client`; fake in tests |
| Playwright/Patchright | `Browser` interface + external-command implementation |
| DB connection | one writer goroutine/channel + read-only clones; repositories |
| clock/timezone | injected `Clock` or pure helpers |
| raw lake/files | `RawLake` abstraction with atomic no-clobber writes |
| LLM/translation/notification | `Translator`/`Notifier` interfaces + fakes |
| subprocess/Docker | `CommandRunner` interface + fake |

Every real transport needs a fake. The default test suite must not open sockets, start
browsers, call paid APIs, or touch production data.

### Slice card for a subagent

```text
Goal: <one user-visible behavior>.
Python source of truth: <files/functions>.
Oracle: <fixtures/goldens/DB snapshot>.
Create ONLY: <new package/files>.
Do not modify: <shared files>.
Public API: <exact signatures>.
Invariants: <single writer, no live DB, human data, no network in tests>.
Acceptance: <commands + assertions>.
Return: files, API, tests with counts, gaps.
```

Disjoint packages work in parallel. Shared files (`server.go`, `go.mod`, central `ui.go`,
schema, docs) need one integration owner or serialized edits.

## Phase 3 — data compatibility and invariants

- **Check the engine before the port.** Python's DuckDB may write a storage version the
  pinned Go driver cannot read. Upgrade/verify the driver on a copy before writing storage
  code. Test the actual live file read-only.
- Keep schema a contract: append-only migrations, canonical DDL, no invented columns.
  Reconcile Python/Go migration ledgers and schema versions.
- Preserve IDs, hashes and canonical payloads where the system relies on them. If hashes are
  Go-owned, state that explicitly and ensure all internal copies agree.
- Respect DB concurrency: one writer, many readers; never open a live DuckDB read-write twice.
  Use a priority writer for human writes and coalesced batches for bulk work.
- Protect human/protected data structurally: helpers, insert-only journal, soft clear,
  backups, high-water checks, no `DELETE`/`DROP` in normal paths.
- Preserve raw bytes; write atomically and never overwrite an archive. Support compressed and
  legacy formats both implementations may read.
- Treat `NULL`/missing data as meaningful. Python's `None`, empty string, `0` and empty list
  have different SQL and JSON semantics; map them explicitly.
- Copy data/media to a **durable** Go-owned path for cutover; `/tmp` is not a live home.

## Phase 4 — Go-specific translation pitfalls

1. **`database/sql` scanning**: DuckDB `UBIGINT` can be `uint64`; JSON columns may arrive as
   `map[string]any`, not `[]byte`; use `sql.Null*` and normalize JSON explicitly.
2. **JSON**: `encoding/json` float/key formatting differs; `nil` slice marshals `null`, empty
   slice `[]`. Match Python's wire contract deliberately.
3. **Truthiness**: Python `[]`/`""`/`0` are false; Go has no implicit truthiness. Write explicit
   predicates.
4. **Time**: Go `time.Time` carries a location; Python may store naive UTC. Normalize at the
   boundary and keep DB text/epoch format exact.
5. **SQLite/DuckDB upserts**: verify `ON CONFLICT` targets and column nullability; DuckDB may
   differ from SQLite. Test update-then-insert where needed.
6. **Goroutines**: no unowned goroutines for jobs; use context cancellation, wait groups and
   panic recovery. Run `-race`.
7. **Writer ownership**: `database/sql` pools hide connections; a central writer or one
   connection is required if the engine enforces a single writer.
8. **Templates**: Go `html/template` escaping and JS contexts differ from Jinja. If reusing
   templates is impossible, render-diff every page and assert forms/links/status codes.
9. **Static assets/media**: serve from the Go-owned media root; test `/media/...` 200 and
   no path traversal.
10. **CLI/toolchain**: Go may not be on system PATH. Pin `GOPATH`, `GOCACHE`, CGO and the
    binary path; document the exact build command. Keep the toolchain for future sessions.
11. **CGO/native drivers**: bundled DuckDB/SQLite libraries have per-platform artifacts and
    storage-version compatibility. A green build does not mean the live file opens.
12. **Error semantics**: Python exceptions become Go errors. Preserve HTTP status, error
    payload shape and job failure states, not just "an error occurred".
13. **Logs/metrics**: a job is not migrated if its logs, progress and cancellation are absent.

## Phase 5 — web/UI parity

Templates and CSS are source code, not decoration.

1. Prefer reusing the original templates (a compatible engine) and port the context/filters.
   Otherwise replicate DOM/CSS and render-diff.
2. Compare every form: action, method, field names, encodings, hidden fields, redirects,
   empty/error states, filters, sorting, pagination.
3. Accept both JSON and `application/x-www-form-urlencoded` where Python forms posted.
4. Test JS behaviors: fetch, polling, confirmation, reload, error banners.
5. Count routes/controls. "Admin exists" is not "all admin widgets exist".
6. Run the real browser against the Go server on real data and screenshot home/detail/admin/
   mobile. A table-only page is not a UX migration.
7. Check the browser console/`node --check` for hand-written JS quoting errors; one bad quote
   leaves the page stuck on "Loading…".

## Phase 6 — cutover, not just shadow mode

1. Freeze a consistent Python backup (prefer Python's own checkpoint/backup API).
2. Copy DB + media + raw to a durable Go-owned location; verify counts and checksums.
3. Start Go on its assigned port with the copied DB/media, read-write.
4. Prove real human writes through Go, journal growth by exactly one, queue depth zero.
5. Keep a clean pre-cutover rollback snapshot and the untouched Python DB.
6. Leave Python available as a reference; never delete its files/data.
7. Destructive cleanup/process jobs: run on a **copy** first; require confirmation, limits,
   reasons and a verified backup. Never test destructive paths on live data.
8. Staged restore is a valid design: write a plan and apply before opening the writer on the
   next start; never swap a DuckDB file under a live writer.

## Phase 7 — verification gates

```bash
gofmt -l .
go vet ./...
go test -count=1 ./...
go test -race ./...                  # at least storage/jobs/web/concurrency packages
go build ./...
```

Plus:

- Python original suite unchanged and green
- differential/golden tests against Python
- real-data API/UI smoke tests; runtime health probe on the assigned port
- exact live counts vs DB and vs the chosen oracle
- `git status` clean; no runtime data/secrets committed
- OKF/docs catalog regenerated if the repo uses it

A green unit suite alone does not prove the service works. A runtime probe does not prove
the right database is being served; compare `db_path` and counts.

## Agent-swarm protocol

- One integration owner owns shared files and the final build.
- Give each agent a disjoint directory and exact API/invariants/oracle.
- Require package tests and a result with files, commands, counts and gaps.
- Do not let agents invent schema or touch the live DB.
- Agents may claim "all tests pass"; rerun yourself.
- Prefer vertical slices; do not ask one agent to "port the remaining app".
- Parallel audits are useful for safety/parity; parallel edits to shared files are not.
- After each swarm returns: compile, inspect diff, run full tests, wire callers, restart, probe.

## Common anti-patterns

- Horizontal ports: all models, then all routes, then all UI.
- Counting Go files/tests instead of user-visible behavior.
- A read-only full-data server on a temporary copy declared "live".
- Claiming done from a 10-row fixture while the real DB has 1,500 rows and human data.
- Documenting a known bug instead of fixing or quarantining it with a failing test.
- Copying a live DB without checkpoint/locking; or leaving live data in `/tmp`.
- Silently changing a hash/ID/time format to make Go tests pass.
- Replacing Jinja/CSS with a "clean" custom UI and calling it parity.
- Testing destructive jobs on live data.
- Deleting the Python folder "because it is no longer needed".
- Letting a background shell own production lifetime; use a managed job and probe health.
- Trusting a subagent's green tests without rerunning in the integrated tree.

## Acceptance checklist

- [ ] Parity matrix covers every route, CLI flag, job kind, template and config key.
- [ ] Every Python public behavior has a Go caller reachable by a user.
- [ ] Both JSON and form encodings accepted where Python accepted both.
- [ ] Render-diff or exact template reuse for every page; CSS/responsive checked.
- [ ] Golden/differential tests and live E2E pass on representative data.
- [ ] The actual live engine/storage version opens read-only before data work.
- [ ] Single writer, human-data invariants and raw/media immutability tested.
- [ ] Cutover has a clean backup, durable Go data, real human-write proof and rollback.
- [ ] Python folder/data untouched; destructive paths only on copies.
- [ ] Runtime probe green; `db_path` and counts verified; docs/OKF current.
- [ ] Remaining gaps listed explicitly; no "100%" claim without evidence.

## 30-minute start checklist

1. Read the Python entrypoints, routes, CLI and job registry.
2. Inspect schema/migrations and the live engine/storage version.
3. Capture one fixture, one DB snapshot, one API response and one page screenshot.
4. Fill the parity matrix rows for those surfaces.
5. Identify the smallest vertical slice with a Go caller.
6. Write the slice card; implement or delegate only that slice.
7. Compile, test, run against a copy, compare to Python, then integrate.
8. Repeat; do not declare done until the live user path on real data passes.
