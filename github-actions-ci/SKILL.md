---
name: github-actions-ci
description: MANDATORY on EVERY interaction in any repository with GitHub Actions (.github/workflows/) — trigger immediately at the start and end of each interaction to inspect recent GitHub Actions workflow runs, diagnose and fix any failing runs, push the fix, and wait until the latest workflow run completes with success.
---

# Mandatory GitHub Actions CI Check & Fix Skill

**MANDATORY RULE FOR EVERY INTERACTION:**
Whenever working in a repository with `.github/workflows/` (or a GitHub remote), you **MUST** check the status of recent GitHub Actions runs on **every interaction**, fix any failing workflows before concluding, and verify that the triggered run on GitHub Actions finishes with `success`.

## 1. Check Recent GitHub Actions Runs (Every Interaction)

First, determine the `OWNER/REPO` from `git remote get-url origin`.

If `gh` is installed, you can run:
```bash
gh run list -R OWNER/REPO --limit 15
```

When `gh` is not installed, authenticate using `$GITHUB_TOKEN` or your configured Git credential helper (`git credential fill`) and query the GitHub Actions REST API directly:

```bash
REPO_SLUG=$(git remote get-url origin | sed -E 's#.*github\.com(:|/)([^/]+/[^/.]+)(\.git)?$#\2#')
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | awk -F= '/^password=/{print $2}')

curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/${REPO_SLUG}/actions/runs?per_page=15" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const r of (data.workflow_runs || [])) {
    const durSec = Math.round((new Date(r.updated_at) - new Date(r.created_at)) / 1000);
    console.log(r.id, "#" + r.run_number, r.status, r.conclusion, `${durSec}s`, r.created_at, r.head_branch, r.head_sha.slice(0, 7), r.display_title);
  }
'
```

## 2. Inspect Failing Job Steps & Logs

If the latest run (or recent runs) has `conclusion === "failure"`, immediately inspect the failed job and step logs:

```bash
REPO_SLUG=$(git remote get-url origin | sed -E 's#.*github\.com(:|/)([^/]+/[^/.]+)(\.git)?$#\2#')
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | awk -F= '/^password=/{print $2}')
RUN_ID="<FAILED_RUN_ID>"

# 1. List jobs & steps to pinpoint the failing step and get JOB_ID
JOB_ID=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/${REPO_SLUG}/actions/runs/${RUN_ID}/jobs" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const j of (data.jobs || [])) {
    console.error("Job:", j.id, j.name, j.status, j.conclusion);
    for (const s of (j.steps || [])) {
      console.error("  Step", s.number, s.name, s.status, s.conclusion);
    }
    if (j.conclusion === "failure") console.log(j.id);
  }
' | head -n 1)

# 2. Extract exact error lines first (post-job cleanup can push errors past tail -n 100), plus tail context
LOG=$(curl -sSL -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/${REPO_SLUG}/actions/jobs/${JOB_ID}/logs")
printf '%s\n' "$LOG" | grep -E "##\[error\]|FAIL|AssertionError|Error:" || true
printf '%s\n' "$LOG" | tail -n 100
```

## 3. Reproduce, Fix & Verify Locally

1. Run every command executed by `.github/workflows/*.yml` locally (e.g., `npm run audit:determinism`, `npm run typecheck`, `npm test`, `npm run build:assets`, `npm run build`).
2. Account for CI runner differences:
   - GitHub Actions `ubuntu-latest` runners have 2 shared x64 vCPUs (~2x–3x slower single-thread than Apple Silicon). Wall-clock throughput benchmarks must keep >= 2.5x–3x local headroom, warm up JIT before timing, take the best of 3 trials to ride out hypervisor/GC pauses, and disable cross-file parallelism (`fileParallelism: false` in `vitest.config.ts`) when sibling test files spawn subprocesses or run heavy crypto.
   - Verify no untracked or uncommitted local fixes were left out of the repository.

### 3.1 Android SDK & Signed APK Release Pitfalls

- **Never use deprecated `android-actions/setup-android@v3`**: It fails on current runners or blocks on unaccepted SDK licenses (such as the Google TV Add-on license). Use `actions/setup-java@v4` (Temurin 17) and invoke pre-installed `sdkmanager` directly:
  ```yaml
  - name: Accept Android SDK Licenses & Install Platform 34
    run: |
      yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null || true
      "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  ```
- **Always sign the `release` APK**: Android and Fire OS devices refuse to install `*-release-unsigned.apk`. Configure `release { signingConfig = signingConfigs.getByName("debug") }` as the fallback when no production keystore is injected, and publish installable APKs via both `actions/upload-artifact@v4` (every push) and `softprops/action-gh-release@v2` (on `v*` tags with `permissions: contents: write`).

## 4. Push & Wait to Confirm Green CI Run

After committing and pushing any changes (or fixing a broken workflow), **never assume CI will pass without checking**:

1. Push the commit/branch to `origin`.
2. Poll/watch the newly triggered GitHub Actions run until `status === "completed"` (use the agent's native timer/schedule tool rather than shell `sleep` loops when available).
3. Verify `conclusion === "success"`. When merging a feature branch into `main`, verify **both** the feature-branch run and the post-merge `main` run — deploy/release steps gated on `github.ref == 'refs/heads/main'` are skipped on feature branches and PRs. If either fails, repeat Steps 2–4 immediately until `main` is green.
