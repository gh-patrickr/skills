---
name: python-to-rust-reimplementation
description: Use when reimplementing a Python service, CLI, data pipeline or web app in Rust, especially in a running production codebase. Provides the parity-matrix, frozen-oracle, seam-first and vertical-slice workflow that prevents "modules exist but nothing works" migrations.
---

# Python → Rust reimplementation

A port is not a translation of files. It is a **behavioral replacement under a frozen oracle**.
Success means every Python-accessible behavior is reachable from a Rust entry point (web, CLI, job),
produces equivalent observable outputs, and is verified against the original before any cutover.

## Core rule

> **A Rust module is not a feature until a Rust caller is wired and an end-to-end test exercises it.**

Library crates with tests are intermediate artifacts. Do not count them as migrated behavior.

## Phase 0 — inventory and parity matrix (before writing code)

1. Enumerate every Python surface:
   - modules and public functions/classes
   - HTTP routes (method, path, input encoding, output encoding)
   - forms/JS actions and redirects
   - CLI commands/flags
   - background jobs and job kinds
   - templates, partials, CSS and client-side JS
   - DB schema, migrations, views, protected data
   - environment/config keys, file formats, cache tables
2. Build a table with columns:
   `Python surface | Rust counterpart | wired caller | tests | live evidence | gap`.
3. Split gaps into:
   - **functional** (cannot be done from Rust)
   - **wiring** (Rust module exists but no caller)
   - **presentation** (different DOM/CSS, missing controls)
   - **platform** (browser, OS, network, Docker)
4. Reproduce the exact route count and template line count. A 55-route/3k-line-template Python web
   app cannot be declared equivalent from ~20 hand-written routes.
5. Commit the matrix (e.g. `implementation.md` or `PARITY.md`) so future sessions do not re-audit
   from memory.

### Parity matrix template

| Python | Rust | Wired | Tests | Live | Gap |
| --- | --- | --- | --- | --- | --- |
| `GET /listing/{p}/{id}` | `listing_html` | yes | golden | curl 200 | missing repair/translation/group controls |
| `storage/listing_filters.py` | `listing_filters.rs` | no | unit | — | 20 filter dimensions missing |

## Phase 1 — freeze the oracle

- Record **real inputs and outputs** before touching behavior: HTML fixtures, JSON responses, DB rows,
  rendered pages, job stats, error strings.
- Store them under version control with a manifest (source, date, portal/config).
- For parsers, replay the same fixture through Python and Rust and compare field-by-field.
- For DB-producing code, snapshot a database and compare tables/rows, not just counts.
- For web, capture the **rendered HTML** and status/headers; template parity is not obvious from
  reading code.
- Keep a seed database and a golden directory shared by both implementations.

Without an oracle, you will "fix" differences silently and lose trust.

## Phase 2 — define seams before porting

Port I/O behind narrow traits so the core is deterministic and testable offline:

| Python dependency | Rust seam |
| --- | --- |
| `requests`/`httpx`/`curl_cffi` | `HttpGet` / `HttpPost` / `Fetcher` traits + one real ureq/reqwest impl |
| browser/Patchright | `BrowserCommand` trait + one external-command impl |
| DB connection | single writer actor + reader pool; repositories/helpers behind storage APIs |
| clock/timezone | injected clock or pure timestamp helpers |
| filesystem/raw lake | `RawLake`-style abstraction with atomic no-clobber writes |
| LLM/translation/notifier | `Translator`/`Notifier`/`HttpPost` traits + fakes |
| subprocess/Docker | `CommandRunner` trait + `DockerRunner` |

Every real transport gets a fake in tests. The default test suite must not open sockets, spawn
browsers, call paid APIs, or touch production data.

## Phase 3 — port in vertical slices, not horizontal layers

A slice is complete only when it includes:

1. the pure domain logic (with oracle tests),
2. the I/O adapter/fake,
3. the persistence/transaction path (single writer, idempotent),
4. a caller (web route / CLI command / job kind),
5. an integration/E2E assertion on a throwaway DB,
6. docs/OKF/catalog updates.

Do not port every parser, then every model, then every route. A parser with no crawler is not a slice.
A route with no query is not a slice.

### Slice card prompt (use for subagents)

```
Goal: <one user-visible behavior>.
Python source of truth: <files/functions>.
Oracle: <fixtures/goldens/DB snapshot>.
Create ONLY: <files>.
Do not modify: <files>.
Public API: <exact signatures>.
Invariants: <no data loss, single writer, no network in tests, ...>.
Acceptance: <commands + assertions>.
Return JSON: files, API, tests run with counts, gaps, notes.
```

Subagents are useful for **disjoint, well-specified** slices. They are not reliable for integration,
schema guesses, or "wire everything". Verify every claim yourself: `git status`, compile, run tests.

## Phase 4 — data and invariants

- **Never migrate production data as part of a code port.** Keep the old app and data intact. Use a
  throwaway DB or a copy for tests. Cutover (copy DB/raw lake, symlink media) is a separate decision.
- Preserve IDs and hashes byte-for-byte (`gid_`, SHA-256/1, canonical JSON, content hash). A changed
  hash silently breaks caches and dedupe.
- Keep the schema a contract: one canonical schema dump; append-only migrations; no invented columns.
- Respect DB concurrency: one writer, many readers via cloned connections; transaction boundaries at
  statement/batch boundaries; human writes preempt background work.
- Protect human data structurally (helpers, no destructive SQL, soft-clear, insert-only restore,
  journal, backups). Test that a rebuild/reprocess cannot delete it.
- Preserve raw bytes; write atomically and never overwrite an archive. Support both compressed and
  legacy formats when the Python app may have produced them.

## Phase 5 — web/UI parity

Templates and CSS are **source code**, not decoration.

1. Prefer rendering the **existing templates** with a compatible engine (`minijinja`) and port the
   context/filters. This is usually less work than a second UI and avoids drift.
2. If replicating DOM/CSS by hand, diff rendered HTML route by route and compare:
   - every form: action, method, field names, encodings, hidden fields
   - every link/redirect/status code
   - filters, sorting, pagination, empty/error states
   - JS behaviors (fetch, polling, confirmation, reload)
   - CSS variables/classes/responsive breakpoints
3. Accept **both** JSON and `application/x-www-form-urlencoded` where Python forms post; form posts
   are not interchangeable with JSON APIs.
4. Count routes and controls. "Admin page exists" is not "all admin widgets exist".
5. Add UI tests asserting the presence of every action/form, and HTTP tests for each route.

A functional custom UI is not parity. Say so explicitly.

## Phase 6 — verification gates

Run all of these before claiming a slice or migration complete:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
ruff check . && pytest -q            # original suite unchanged
okf --check / docs tests             # if the repo uses architecture docs
```

Plus:

- differential golden tests vs Python
- live E2E against real services on a **throwaway** DB
- runtime health probe against the Rust process on its assigned port
- confirmation that the old app/data are untouched
- `git status` review: no unrelated agent edits, no secrets, no runtime data

A green unit suite alone is not evidence that the service works.

## Agent-swarm protocol

- Give each agent a disjoint file set and an explicit "do not modify existing files" contract.
- Require exact API signatures, invariants, and offline test requirements.
- Require a JSON result with files, commands, test counts, and gaps.
- Do not let agents invent schema/columns; give them `schema.json` and the canonical DDL.
- Run agents in parallel only on independent surfaces; integrate immediately after each returns.
- Check for failed/silent agents: no closing message, no file diff, or a half-edited file.
- Never commit agent output without compiling and testing it yourself.
- Prefer one vertical slice per agent over "port the remaining app".

## Common Python→Rust pitfalls

1. **Truthiness/None**: Python `[]`/`""`/`0` are false; Rust `Option`/empty collections differ.
2. **Regex**: Rust `regex` has no lookaround/backreferences. Rewrite lookbehind as prefix groups or
   post-filter. Test non-ASCII diacritics (e.g. Polish/German) and Unicode character classes.
3. **Dates**: Python naive local/UTC timestamps vs Rust `SystemTime`; keep the DB text format exact.
4. **JSON**: key order, `ensure_ascii`, float formatting, `null` vs absent; use canonical JSON.
5. **Encoding**: percent-encoding/`ascii_url`, HTML entities, form vs JSON bodies.
6. **DB locks**: DuckDB allows one read-write process. Clone readers; never open the live DB twice.
7. **SQL**: contract tables may have no primary keys — `ON CONFLICT` fails; use update-then-insert.
8. **JSON extension/autoload**: sandboxed home may break `to_json`; enable features or serialize in Rust.
9. **Files**: gzip magic, atomic rename, no-clobber, symlinks, path traversal.
10. **Background processes**: tracked tool jobs may be killed; use a detached lifecycle manager and
    probe health; do not tie production service lifetime to a shell.
11. **Toolchains**: `cargo`/`rustc` may not be on PATH; use repo-local `CARGO_HOME`/`RUSTUP_HOME`.
12. **Disk**: bundled C/C++ sys crates multiply across test binaries; size `target/` deliberately.
13. **UI**: hand-written HTML drifts from Jinja/CSS; count templates/routes and render-diff.
14. **"Done" inflation**: a tested library is not a migrated feature; require caller + E2E.

## Acceptance checklist

- [ ] Parity matrix covers every route/CLI/job/template/config key.
- [ ] Every Python public behavior has a Rust caller reachable by a user.
- [ ] Both JSON and form encodings accepted where Python accepted both.
- [ ] Render-diff or exact template reuse for every page; CSS matches.
- [ ] Golden/differential tests and live E2E pass.
- [ ] Old app and data untouched; no accidental migration.
- [ ] Human/protected data invariants tested.
- [ ] Runtime probe green; docs/catalog current.
- [ ] Remaining gaps listed explicitly; no "100%" claim without evidence.

## Anti-patterns

- Horizontal ports: all models, then all routes, then all UI.
- Counting modules/tests instead of user-visible behavior.
- Replacing Jinja/CSS with a "clean" custom UI and calling it parity.
- Migrating the DB to make tests pass.
- Letting agents edit overlapping files or invent schema.
- Trusting an agent's test claim without rerunning.
- Claiming completion from a green unit suite with no live probe.
