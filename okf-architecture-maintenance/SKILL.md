---
name: okf-architecture-maintenance
description: ALWAYS use whenever you create, edit, rename, move, or delete any file or folder in a project that keeps an Open Knowledge Format (OKF) bundle, and before reporting any coding task there as complete. It keeps every folder's ARCHITECTURE.md and index.md accurate so the repository explains itself to humans and agents. Also use for onboarding, repository-structure questions, refactors, or architecture reviews. Detect the bundle at the project root (a root index.md declaring okf_version plus the generator scripts/okf.py); never apply it to a project that has not adopted OKF.
---

# OKF Architecture Maintenance (always-on)

**Applies to:** any **project** that has adopted **Open Knowledge Format (OKF) v0.1** — a
root `index.md` with `okf_version: "0.1"` and a catalog generator (normally
`scripts/okf.py`).

It is *project-scoped*, not workspace-scoped. A workspace may contain several projects;
only the ones with a bundle get OKF documentation. Never introduce OKF into a project that
has not adopted it — its file and folder rules would create documentation the project
never asked for.

An OKF project uses plain Markdown with YAML frontmatter, a reserved `index.md` per folder
for progressive disclosure, and concept documents for everything else. Every
source-controlled folder has:

| File | OKF role | Contents |
| --- | --- | --- |
| `ARCHITECTURE.md` | concept (`type: Architecture Description`) | Purpose, invariants, **every direct file** (role + one-sentence description), every subfolder |
| `index.md` | reserved directory index | Architecture link + links to child folders |

Root `index.md` carries `okf_version: "0.1"`. `log.md` records bundle history.
Generated `ARCHITECTURE.md` and `index.md` are build output: never hand-edit them when a
generator exists.

## 1. Find the project and its bundle

1. Resolve the project root of the folder you are editing:
   `git rev-parse --show-toplevel`; if that fails, walk up to the nearest directory with a
   manifest (`pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `project.yml`,
   `*.xcodeproj`, `Makefile`) — see `clean-checkout-delivery`.
2. Check for the bundle at that root:
   `grep -n 'okf_version' index.md` **and** a generator at `scripts/okf.py` (or the path
   the project documents).
3. In a multi-project workspace, repeat per project. A session may span projects; each
   bundle is validated independently.
4. No bundle → stop. Do not create one unless the user asks to adopt OKF.

## When to use

Load and follow this skill for **any** change to the working tree, even a one-line edit:
the file list, the folder purpose, or an invariant may have changed. It is mandatory
before a final answer, commit, or PR. If you only change file *contents* and the folder's
architecture description still describes them accurately, regenerate anyway so the
`timestamp` and validation trail stay honest.

Doing the docs is only half of "done": when the project also runs a service, the separate
always-on `runtime-health-verification` skill requires a green runtime probe before the
final answer; when it stores derived data, `systematic-change-impact` applies.

## Procedure

1. **Locate the folders** of every file and folder you touched (added, renamed, moved,
   deleted). A rename touches two folders.
2. **Update the catalog** in the project's generator (`SPECS` / `FolderSpec` in
   `scripts/okf.py`, or its documented equivalent — read the generator before editing):
   - New file → add `"name.ext": ("role", "one-sentence description")`.
   - Deleted/renamed file → update or remove the entry.
   - New folder → add a `FolderSpec` (title, summary, purpose, invariants, files, tags).
   - Behavioural change → update the folder's `purpose`/`invariants` when the contract
     changed.
3. **Regenerate** with the project's interpreter, not whichever `python` is on `PATH`:

   ```bash
   # pick the first that exists
   .venv/bin/python scripts/okf.py --write     # uv/venv project
   uv run python scripts/okf.py --write        # uv project without .venv
   poetry run python scripts/okf.py --write
   python3 scripts/okf.py --write              # stdlib-only generator
   ```

4. **Verify** — this is the enforcement gate:

   ```bash
   <interpreter> scripts/okf.py --check
   <interpreter> -m pytest -q tests/unit/test_okf_docs.py
   ```

   `--check` fails on: an undocumented file, a catalog entry for a missing file, a folder
   without docs, or a stale generated document. If the project names the enforcement test
   differently, run the one that matches `okf` (search `tests/`).
5. **Review the diff** of the touched `ARCHITECTURE.md`/`index.md`. If the prose is now
   wrong (not just the file list), fix the catalog and regenerate again.
6. **Commit** the catalog change and the regenerated documents in the same commit as the
   source change (see `clean-checkout-delivery`).

## Scope

Document all **source-controlled** folders of that project: the root, `src/**`, `tests/**`,
`scripts/**`, `docs/**`, and any future top-level source folder.

Do **not** document generated, vendored or runtime trees. Typical exclusions (adapt the
generator's `EXCLUDED_DIRS`): `.git/`, `.venv/`, `venv/`, `node_modules/`, `vendor/`,
`third_party/` (when vendored), `build/`, `dist/`, `target/`, `coverage/`, `.next/`,
`__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.uv-cache/`, `data/`, `logs/`.
Runtime state (databases, media, browser profiles, logs) is described in prose in the
root architecture, never enumerated file by file.

## Quality bar for an architecture description

A good folder concept answers these questions, not just "what files exist":

- **Purpose** — why the folder exists and what it owns.
- **Boundaries** — what it must not do (e.g. adapters never do network I/O).
- **Data flow** — inputs, outputs, stored tables/files, who calls it.
- **Invariants** — rules a future change must not break (single writer, human data wins,
  append-only raw data, unusable input never becomes current).
- **Files** — one row per direct file with a role and a concrete description (key symbols,
  responsibilities, callers). No "misc" rows.
- **Links** — child folders link to their own `ARCHITECTURE.md`; related concepts link
  with project-relative paths.

Prefer structural Markdown (tables, short lists, code spans) over long prose. Describe the
contract, not transient line numbers or counts that drift.

## OKF conformance rules

- `ARCHITECTURE.md` starts with YAML frontmatter containing a non-empty `type`; include
  `title`, `description`, `resource`, `tags`, `timestamp`.
- `index.md` has no frontmatter except the bundle-root `index.md` (`okf_version`).
- Cross-links are normal Markdown links; broken links are tolerated by OKF consumers but
  the `--check` gate rejects missing files, so keep them correct.
- Do not invent a new reserved filename; `index.md` and `log.md` are reserved.

## Multi-project workspaces

- One bundle per project, rooted at that project's repo root. Never document the workspace
  container itself, and never let one project's `SPECS` list files from another.
- A nested independent repo is a separate bundle: run the generator inside it, not from
  the parent.
- A workspace with no OKF bundle is not a documentation task. Do not scaffold OKF
  opportunistically.

## Reference implementation — DreamHome Warsaw

The canonical, fully worked bundle (DuckDB catalogue, `scripts/okf.py` with `SPECS`,
`tests/unit/test_okf_docs.py`, root `AGENTS.md`) is described in
[`references/dreamhome-warsaw.md`](references/dreamhome-warsaw.md). Use it for concrete
commands and catalog shapes; substitute the current project's own paths, interpreter and
test names everywhere else.

## References

- OKF v0.1 specification:
  <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>
- Google Cloud introduction:
  <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing>
- Generator/validator in the reference project: `scripts/okf.py`
- Enforcement test in the reference project: `tests/unit/test_okf_docs.py`
