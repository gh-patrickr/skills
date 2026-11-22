---
name: clean-checkout-delivery
description: ALWAYS use at the start and end of every coding task in any workspace — discover which directories are real projects, make sure each one is tracked by git (create the repository at the project root when missing, without nesting repos at a multi-project workspace root), commit pre-existing work as a labelled baseline before editing, work on a scoped feature branch (feat/*, fix/*, docs/*, chore/*), keep your changes separate from another session's, fix any privacy/secret findings before committing, and finish with green local + GitHub Actions CI checks, well-scoped commits, and pushing to the remote. Use even when the workspace has no git yet.
---

# Clean checkout and delivery (always-on)

**Applies to:** every coding task, in every workspace, with or without git. If a project is
not under version control yet, creating that repository is part of the task — do it before
the first edit, so the next session inherits a baseline instead of a mystery.

An agent that starts on an untracked or dirty tree cannot tell its own work from a previous
session's, cannot make an honest commit, and leaves the user with a mixed diff. The rule is:
**find the projects, track them, baseline, branch (`feat/*` / `fix/*`), edit, finish green (local + CI), commit scoped, push to remote.**

## 0. Find the projects and make sure git tracks them

A **project** is a directory that owns its own build/test/publish lifecycle: it has a
manifest or an entry point. Scratch directories, caches, generated output, vendored
dependencies and download folders are not projects.

Recognise a project by the presence of any of:

`pyproject.toml`, `uv.lock`, `requirements.txt`, `package.json`, `go.mod`, `Cargo.toml`,
`build.gradle.kts`, `settings.gradle.kts`, `gradlew`, `pom.xml`,
`project.yml`, `*.xcodeproj`, `Package.swift`, `Makefile`, `CMakeLists.txt`, `Gemfile`,
`composer.json`, `*.csproj`, `docker-compose.yml`, `Procfile`, `justfile`, or a source tree
with its own `README` and build script.

### Discover

```bash
git rev-parse --show-toplevel 2>/dev/null   # already inside a repo?
ls -a                                       # manifests at the workspace root?
find . -maxdepth 2 -name .git -not -path "*/node_modules/*"
```

### Decide where the repository goes

| Situation | Action |
| --- | --- |
| Cwd is already inside a repo | Use it. If the project dir is untracked, add it to that repo — do not create a nested repo. |
| Workspace is one project (manifest at its root) | `git init` **at the workspace root**. |
| Workspace contains several independent projects | One repo **per project**, at that project's root. Never init at the workspace root. |
| Workspace contains a project plus scratch folders | Init at the project root; leave scratch outside the repo or gitignore it. |
| Empty directory, downloads, caches, vendored trees | Not a project. Report it and leave it alone. |
| Workspace root is inside another repo and holds several projects | Keep the outer repo; add each project's files to it unless they are independently versioned already. |

Rules that prevent the common damage:

- **Never `git init` inside another repo's tracked tree.** Check
  `git rev-parse --show-toplevel` and `git ls-files | grep <path>` first; nesting creates two
  histories for the same files and silently hides changes from the outer repo.
- **Never create a repo at a workspace root that merely contains projects.** It produces a
  giant mixed repo, one `.gitignore` for unrelated stacks, and nested-repo confusion.
- **A repo root need not equal the workspace root.** The workspace is a container; the
  project is what gets versioned.
- **Do not move or restructure projects** to make a repo layout nicer. Version them where
  they are.
- **Never commit secrets, credentials, tokens, `.env` files, runtime databases, uploads,
  logs, caches, virtualenvs or `node_modules`.** Write `.gitignore` *before* the first
  `git add`.
- If a directory is already a nested repo with its own remote, leave it as a separate repo
  and record that in the ledger. Submodules only when the user asks.

### Bootstrap a missing repository

```bash
cd <project-root>
git init -b main
# write .gitignore next (see the project's stack); then scan for secrets before adding
git add -A
git commit -m "Initial project scaffold"
```

If the project already has a `.gitignore`, extend it instead of replacing it. Keep the
bootstrap commit separate from feature work: it is a labelled checkpoint, not a feature.
Then continue with section 1 as normal.

Record in the ledger which project roots you found, which got a new repo, and why any
directory was left untracked.

## 1. Baseline the tree before the first edit

1. Inspect the tree of the project you will edit:

   ```bash
   git status --short
   git diff --stat
   git log --oneline -5
   ```

2. Treat everything already dirty as **another session's work**.
3. Clean tree: record `git rev-parse HEAD` as the baseline and continue.
4. Dirty tree:
   - Read the diff. Stop if it contains secrets, runtime data or generated junk.
   - Run the project's fast checks. **Never baseline-commit a red tree.**
   - If the work is coherent and green, commit it as a **labelled checkpoint** before
     touching any file:

     ```bash
     git add -A
     git commit -F - <<'MSG'
     Checkpoint accumulated working tree before <task>

     Capture work that predates this task so the task diff starts from a
     clean baseline. This is a checkpoint commit, not a single feature.

     Included: <themes>
     Verification: <commands/results>
     MSG
     ```

   - If the work is mixed, broken or unsafe, **stop and ask**; alternatively stash it
     (`git stash push -u -m "pre-existing ..."`) and record the stash name. Never hide it
     silently.
5. Record the baseline SHA and a one-line description of what it contained.
6. Repeat per project when one task spans several repos; baselines are per repo.
7. **Create or switch to a feature branch** before editing (`git fetch origin` first when a
   remote exists):

   ```bash
   git fetch origin
   git checkout -b feat/<short-slug>   # or fix/<short-slug>, docs/<short-slug>, chore/<short-slug>
   ```

   Never do multi-step feature or bugfix development directly on `main` unless the user
   explicitly asks to commit straight to `main`. Push the feature branch to `origin`
   (`git push -u origin <branch>`), verify CI passes on the feature branch (see
   `github-actions-ci`), and once green, fast-forward/merge into `main` and push `main`
   (unless the user requested leaving a PR open). When editing a shared clone where another
   parallel session already has an active branch or uncommitted edits, use an isolated
   worktree (`git worktree add /tmp/<slug> -b <branch> origin/main`) instead of switching
   branches under the other session, and remove the worktree once merged.

## 2. Keep a change ledger

Before editing, write down:

- the project root and baseline SHA for each repo you touch;
- the files you expect to touch;
- the files you must not touch because they belong to another session.

Rules:

- `git diff --stat <baseline>` must show only your work.
- Inspect `git diff` before staging and `git diff --cached` before committing.
- Check staged files for secrets, keys, credentials, personal information, private LAN IPs,
  local user paths, or household/internal details (and run the repository's privacy/secret
  check if present). **Fix every finding before committing**; never bypass pre-commit hooks
  with `--no-verify`.
- Stage by path or hunk, **not** `git add -A` after editing.
- If one file mixes your hunk with another session's hunk, stage only your hunk
  (`git add -p`, or extract that hunk and `git apply --cached`).
- Never put another session's hunks in your feature commit.
- Keep regenerated catalog/docs in the same commit as the source change that requires them,
  but only after regenerating and checking.
- Leave an untracked repo or another project's repo untouched unless the task is about it.

## 3. Commit in small logical units

- One concern per commit; a checkpoint commit is explicitly labelled as such.
- Commit only green states.
- **Commit and push incrementally on multi-item lists or long turns**: when working through a
  checklist (`fixes.md`, `improvements.md`) or running heavy builds/solvers where token limits
  or server restarts can cut off a turn mid-flight, verify, commit, tick off the checklist item,
  and `git push` to the feature branch **after each completed item** rather than batching all
  commits or pushes until the end of the turn.
- Put the test that protects a behaviour in the same commit as the behaviour.
- If the change touches stored/derived data, record the before/after numbers and the job
  that applied them in the commit body (and in `log.md` where the project keeps one).
- If the change spans repos, make one coherent commit per repo with a matching subject.

## 4. Finish: all green, then commit and push

Run the gates that exist in **that** project, from its root. Discover them; do not invent
new ones:

- tests (pytest / vitest / jest / `go test ./...` / `cargo test` / `./gradlew check` / `xcodebuild test`);
- lint/format (ruff, eslint, golangci-lint, clippy, swiftlint);
- build/typecheck (`tsc`, `vite build`, `go build`, `cargo build`, `./gradlew assemble`, `xcodebuild build`);
- project-specific gates, when present:
  - privacy & secrets scan / pre-commit hook (`scripts/check_privacy.py` or `.githooks/pre-commit`) —
    fix any private data, keys, personal information, or internal/household details before
    committing;
  - OKF bundle → `scripts/okf.py --write` then `--check` and its enforcement test
    (`okf-architecture-maintenance`);
  - running service → runtime probe (`runtime-health-verification`);
  - state change → measured impact and supported reprocessing
    (`systematic-change-impact`);
  - GitHub Actions (`.github/workflows/`) → inspect recent runs, push, and wait until the
    triggered workflow run completes with `conclusion === "success"` (`github-actions-ci`).
- **JVM / Gradle in proxy-sandboxed Linux VMs:** if `./gradlew` fails with `InvalidAlgorithmParameterException: the trustAnchors parameter must be non-empty` (missing `/etc/ssl/certs/java/cacerts`), import `/etc/ssl/certs/ca-certificates.crt` into `/tmp/cacerts` via `keytool -importcert -noprompt -keystore /tmp/cacerts -storepass changeit` and pass `-Djavax.net.ssl.trustStore=/tmp/cacerts -Djavax.net.ssl.trustStorePassword=changeit` plus `-Dhttp.proxyHost` / `-Dhttps.proxyHost` from `$HTTPS_PROXY` in `JAVA_TOOL_OPTIONS`.

### Sandboxed JVM / Gradle truststore & proxy bootstrap

In container/VM sandboxes where outbound HTTPS goes through a local MITM proxy
(`HTTPS_PROXY`, `SSL_CERT_FILE`) and `/etc/ssl/certs/java/cacerts` is missing, `./gradlew`
fails with `InvalidAlgorithmParameterException: the trustAnchors parameter must be non-empty`.
Import `$SSL_CERT_FILE` into `$HOME/.gradle/cacerts.p12` (`keytool -importcert -noprompt
-trustcacerts -alias sandbox-ca -file "$SSL_CERT_FILE" -keystore "$HOME/.gradle/cacerts.p12"
-storetype PKCS12 -storepass changeit`) and configure `systemProp.javax.net.ssl.trustStore`,
`systemProp.javax.net.ssl.trustStoreType=PKCS12`, and `systemProp.http(s).proxyHost/Port` in
`$HOME/.gradle/gradle.properties` (plus `GRADLE_OPTS` for the initial `gradlew` download).

Python + OKF project example:

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check src tests
.venv/bin/python scripts/okf.py --write && .venv/bin/python scripts/okf.py --check
.venv/bin/python -m pytest -q tests/unit/test_okf_docs.py
.venv/bin/python scripts/runtime_health.py
```

- Restart the service after any code it loaded changes; a green test run is not a healthy
  runtime.
- Never finish or commit on a failed gate unless the user explicitly asked to stop.

Commit message template:

```text
<Imperative subject, <= 72 chars>

Why:
- <the problem or request>

What:
- <behaviour change>

Data / impact:
- <tables, migrations, jobs, before/after counts; or "none">

Verification:
- <tests, lint, OKF, runtime probe>
```

### Push to the remote repository

After committing on green gates, push your commit(s) to the configured remote for every
repository you touched:

```bash
git remote -v
git push                     # or: git push -u origin <branch>
git status -sb               # verify branch is synced with origin/<branch> (no [ahead N])
```

- Always push when a remote is configured unless the user explicitly asked to keep the
  commit local.
- **Fetch on every turn & integrate `origin/main` instead of stranding work on a side branch:**
  Run `git fetch origin` at the start of every turn and before pushing so local `main` never
  drifts silently across multi-turn sessions. When `git push origin main` is rejected with
  `(fetch first)` because a parallel session pushed additive commits to `origin/main`, **never
  park verified work on an unmerged side branch** — fetch, merge/integrate `origin/main`,
  resolve conflicts cleanly, re-run verification, push `origin/main`, and delete any temporary
  branch. Downstream host supervisors, auto-pullers, and live servers track `origin/main`, so
  leaving changes on a side branch leaves the live application stale.
- Never force-push (`git push --force`) to `main`/`master` unless explicitly instructed.
- **Shared global checkouts (e.g. `~/.dsh/skills`) across concurrent sessions:** Never run `git checkout -b` directly inside a working tree shared by sibling agent sessions (which switches `HEAD` underneath them). Create a temporary `git worktree add <scratch>/wt -b <branch> origin/main`, commit/push from that worktree, fast-forward `origin/main`, and remove the worktree when finished.
- **Remote tag conflicts (`would clobber existing tag`) & milestone binaries:** If `git fetch` or `git push` rejects a tag moved on `origin` (e.g. by CI release automation), compare `git ls-remote --tags origin <tag>` with local `git rev-parse <tag>`, sync remote tags cleanly via `git fetch origin --tags --force`, and push new release tags explicitly (`git push origin refs/tags/<new-tag>`) instead of `git push --tags`. When asked to preserve named release binaries alongside tags, save version-stamped filenames (e.g. `releases/<app>-<tag>-release.apk`) so subsequent builds never overwrite earlier milestones.
- If no remote is configured or a push is blocked by missing credentials/permissions, leave
  the branch clean locally and report the exact commit SHA and branch to push in the final
  report.

### Mechanical enforcement via Lifecycle & Git hooks

Skills are advisory instructions; pair them with deterministic OS-level hooks (`scripts/pre_tool_use_guard.sh` and `scripts/stop_delivery_gate.sh` in this skill folder) so the gates cannot be skipped:

1. **Antigravity Lifecycle Hooks (`.agents/hooks.json` in workspace or `~/.gemini/config/hooks.json` global):**
   - `PreToolUse` (matcher `"run_command"` → `pre_tool_use_guard.sh`): Denies (`{"decision": "deny"}`) blanket staging (`git add -A`, `git add --all`, `git add .`) and `--no-verify`.
   - `Stop` (flat array → `stop_delivery_gate.sh`): Blocks turn completion (`{"decision": "continue", "reason": "..."}`) when `git status --porcelain` is dirty, current branch (`git symbolic-ref --short HEAD`) is not `main`/`master`, `@{u}..HEAD > 0`, or `scripts/runtime_health.sh` fails.
   - **Critical hook invariants:** Always return `{"decision": "allow"}` when `fullyIdle === false` (so background tasks/subagents do not deadlock); pass `--global` in `~/.gemini/config/hooks.json` so workspaces with `.agents/hooks.json` do not run duplicate checks; and never allow loopback mock unit tests (`127.0.0.1`/`localhost`) to overwrite tracked deploy manifests (route mock test outputs to `os.tmpdir()`).
2. **Git Native Hooks (`.githooks/pre-commit` & `.githooks/pre-push` via `git config core.hooksPath .githooks`):**
   - Run determinism/privacy/typecheck/unit gates in `pre-commit` and runtime-health + `--if-configured` deployers in `pre-push`.

## 5. Final report

State:

- the project root(s) and baseline SHA(s), and what any checkpoint contained;
- any repository you created (and why it was created there rather than at the workspace
  root);
- your commit SHA(s), subject(s), and remote push status (`origin/<branch>` or reason it
  remained local);
- test/lint/OKF/health evidence (URL, schema, counts, restarts);
- any remaining uncommitted work and who owns it.

## Anti-patterns

- Editing in a project that is not in git and "committing later".
- `git init` at a multi-project workspace root, or nesting a repo inside a tracked tree.
- `git add -A` after work has started.
- Committing caches, virtualenvs, `node_modules`, databases, logs or secrets in the
  bootstrap commit.
- “I’ll commit later” with no baseline.
- Mixing another session’s changes with yours.
- Committing while tests, privacy/secret checks, or the runtime probe are red (or bypassing hooks with `--no-verify`).
- Calling a multi-feature checkpoint commit a feature commit.
- Committing locally across multiple prompts without `git push`, or sidestepping a `(fetch first)` push rejection onto an unmerged side branch instead of integrating `origin/main` and pushing `main`.
- Leaving the tree dirty without telling the user.

