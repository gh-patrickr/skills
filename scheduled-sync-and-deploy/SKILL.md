---
name: scheduled-sync-and-deploy
description: Use when setting up a recurring check, cron job, periodic git poller, background sync, or least-privilege cloud/static upload — uses an OS scheduler (macOS LaunchAgent or Linux systemd/cron) with a deterministic script instead of an LLM polling loop, builds from an isolated git worktree, verifies live HTTP ETag/version state against mock-isolated manifests, and handles narrow-IAM REST quirks without escalating privileges.
---

# Scheduled Sync & Least-Privilege Deploy

## 1. Never Use an LLM Timer Loop for Deterministic Polling

When a recurring task (`git fetch`, build-on-change, health check, backup, static upload) needs no LLM reasoning on the normal path, **never** schedule an agent-harness cron/timer (`schedule` tool or `agentapi new-conversation` sidecar) that wakes an LLM every N minutes just to see "nothing changed".

Write a deterministic, idempotent script and register it with the **OS scheduler**:

- **macOS (`launchd` — never headless `crontab -`)**: Non-interactive `crontab -` blocks on a macOS TCC GUI authorization dialog and fails with `Interrupted system call`. Write `~/Library/LaunchAgents/<reverse-dns-label>.plist` with explicit `PATH` and `HOME`, then load it via `launchctl`:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>Label</key><string>local.sync.example-app</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key><string>/path-from-env-at-install</string>
      <key>LC_ALL</key><string>C</string>
      <key>PATH</key><string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>/path-to-repo/scripts/cron_sync_and_deploy.sh</string>
    </array>
    <key>WorkingDirectory</key><string>/path-to-repo</string>
    <key>StartInterval</key><integer>300</integer>
    <key>RunAtLoad</key><true/>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>/tmp/example-app-sync.log</string>
    <key>StandardErrorPath</key><string>/tmp/example-app-sync.log</string>
  </dict>
  </plist>
  ```

  Load / reload without GUI prompts:

  ```bash
  launchctl bootout "gui/$(id -u)/<label>" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/<label>.plist"
  launchctl list | grep "<label>"
  ```

- **Linux**: Use a `systemd --user` `.service` + `.timer` (`systemctl --user enable --now <unit>.timer`) or user `crontab`.
- **Pre-flight**: Always dry-run the script under a stripped environment (`env -i HOME="$HOME" PATH="/usr/bin:/bin" <script>`) so missing `PATH` entries (`node`, `npm`, `uv`, `cargo`) fail immediately instead of silently in the background.

## 2. Concurrency-Safe Git Polling (`mkdir` Lock + Detached `git worktree`)

A local repository is often shared with active human or agent sessions working on feature branches. Polling scripts that inspect or mutate the shared working tree cause two classic bugs:

1. Checking `HEAD != origin/main` triggers false deploys whenever a local feature branch moves ahead of `origin/main`, deploying unmerged work.
2. Running `git pull --autostash origin main` inside a dirty feature-branch checkout contaminates active work or fails mid-rebase.

Follow this contract in every sync script:

- **Non-overlapping PID lock**: Acquire an atomic `mkdir /tmp/<app>-sync.lock`; if it exists, check `kill -0 "$(cat "$LOCK/pid")"` before reclaiming a stale lock, and remove both lock and temporary worktree in `trap cleanup EXIT`.
- **Compare `origin/main` to live state, not `HEAD`**: Fetch `git fetch origin main --quiet` and compare `ORIGIN_SHORT_SHA="$(git rev-parse --short origin/main)"` against the verified live deployment.
- **Fast-forward only when idle on `main`; otherwise use a detached `git worktree`**:
  - If the checkout is on `main` with an empty `git status --porcelain`, `git pull --ff-only origin main` and build in place.
  - Otherwise, leave the working tree untouched and build `origin/main` inside an isolated worktree:

    ```bash
    git worktree add --detach --force "$WORKTREE_DIR" "$ORIGIN_SHA"
    ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"   # reuse deps when applicable
    (cd "$WORKTREE_DIR" && npm run build && DEPLOY_MANIFEST_PATH="$MANIFEST_PATH" GIT_SHA="$ORIGIN_SHORT_SHA" GIT_BRANCH="main" bash scripts/upload.sh)
    ```

## 3. Verify Live Target Reality & Isolate Mock Test Runs

Never trust a local deploy manifest file (`deploy_manifest.json`) by itself:

- **Prevent unit-test manifest poisoning**: Tests that run a deploy script against a loopback mock (`http://127.0.0.1:<port>` or `localhost`) **must not** write to the workspace's production manifest path. If a developer or agent runs `npm test` / `pytest` on `main` right before `git push`, a mock run that writes `"gitSha": "<HEAD>"` into the production manifest tricks the cron poller into thinking `origin/main` is already deployed.
  - In the deploy script: detect loopback `API_BASE` (`127.0.0.1` / `localhost`) and default the manifest output to `os.tmpdir()` unless `DEPLOY_MANIFEST_PATH` is explicitly overridden.
  - In the poller: reject mock version identifiers (`v_test_*`, empty version/digest).
- **Cross-check live HTTP headers**: Probe the live endpoint (`curl -sSI --max-time 10 https://<live-host>/`) and compare its `ETag` (or `/version` JSON) against the manifest's payload SHA-256. Re-deploy whenever either `gitSha` or live `ETag` diverges.

## 4. Least-Privilege Cloud Uploads Without Privilege Escalation

When uploading static bundles or artifacts to cloud hosting (e.g., Firebase Hosting, GCS/S3 static sites, Cloudflare):

- **Hard-lock identity and scope in the upload script**:
  - Dedicated service account with a minimal custom role (only the exact `get`/`update` permissions needed) plus an org/project Deny Policy blocking `iam.*`, `resourcemanager.*`, `serviceusage.*`, and key/token minting.
  - Abort immediately in code if `client_email`, `project_id`, or the OAuth2 scope (e.g. `https://www.googleapis.com/auth/firebase.hosting` — never `cloud-platform`) does not match expected constants.
  - Mint short-lived (5-minute) OAuth2 tokens via stdlib JWT signing (`node:crypto` / Python `ssl`) rather than requiring admin CLIs (`gcloud`, `firebase-tools`) on the runner.
- **Handle 403 post-create readback quirks without widening IAM**:
  - Under minimal custom IAM roles (for example, `firebasehosting.sites.get` + `firebasehosting.sites.update` without broader project metadata permissions), composite `create` endpoints such as `POST /v1beta1/sites/{site}/versions` can **commit the new `CREATED` version on the backend and still return `HTTP 403`** on an internal post-create metadata readback.
  - **Never** respond to that `403` by adding broader IAM roles (`Editor`, `Hosting Admin`, `Viewer`). First query the permitted list/get endpoint (`GET /v1beta1/projects/{project}/sites/{site}/versions`) for the newest `CREATED` version owned by that service account; if present, proceed through `populateFiles`, byte upload, `PATCH status=FINALIZED`, and `releases.create` with zero privilege changes.
