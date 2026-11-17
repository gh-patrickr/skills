#!/usr/bin/env bash
# ==============================================================================
# Antigravity Stop Lifecycle Delivery Gate (`stop_delivery_gate.sh`)
#
# Deterministically blocks the agent from ending a turn (`Stop` hook in
# `.agents/hooks.json` or `~/.gemini/config/hooks.json`) until all mandatory
# delivery invariants are satisfied:
#   1. Clean working tree (`git status --porcelain` is empty).
#   2. Merged to `main` (`git symbolic-ref --short HEAD === "main"`).
#   3. Pushed to `origin/main` (`git rev-list --count @{u}..HEAD === 0`).
#   4. Runtime health script passes (`bash scripts/runtime_health.sh` when present).
#
# Contract:
#   Input  (stdin) : JSON with `terminationReason`, `fullyIdle`, `workspacePaths`
#   Output (stdout): `{"decision": "allow"}` or `{"decision": "continue", "reason": "..."}`
# ==============================================================================

set -euo pipefail

GLOBAL_MODE=0
if [[ "${1:-}" == "--global" ]]; then
  GLOBAL_MODE=1
fi

PAYLOAD="$(cat || true)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." 2>/dev/null && pwd || pwd)"

export GLOBAL_MODE
export DEFAULT_REPO_ROOT

node -e '
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const raw = process.argv[1] || "{}";
const globalMode = process.env.GLOBAL_MODE === "1";
const defaultRepoRoot = process.env.DEFAULT_REPO_ROOT || process.cwd();

let data = {};
try {
  data = JSON.parse(raw);
} catch {
  data = {};
}

if (data.fullyIdle === false) {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

if (data.terminationReason && data.terminationReason !== "NO_TOOL_CALL") {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

const workspaces = Array.isArray(data.workspacePaths) && data.workspacePaths.length > 0
  ? data.workspacePaths
  : [defaultRepoRoot];

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const failures = [];

for (const ws of workspaces) {
  if (!ws || !fs.existsSync(ws)) continue;

  if (globalMode && fs.existsSync(path.join(ws, ".agents", "hooks.json"))) {
    continue;
  }

  const gitTop = runGit(ws, ["rev-parse", "--show-toplevel"]);
  if (!gitTop) continue;

  const porcelain = runGit(gitTop, ["status", "--porcelain"]);
  if (porcelain && porcelain.length > 0) {
    const firstLines = porcelain.split("\n").slice(0, 5).join(", ");
    failures.push(`[${path.basename(gitTop)}] Working tree has uncommitted changes (${firstLines}). Run tests, stage by path, and commit.`);
  }

  const branch = runGit(gitTop, ["symbolic-ref", "--short", "HEAD"]) || runGit(gitTop, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch && branch !== "main" && branch !== "master") {
    failures.push(`[${path.basename(gitTop)}] Currently on branch "${branch}" instead of "main". Merge verified feature branch into "main" and push.`);
  }

  const upstreamCount = runGit(gitTop, ["rev-list", "--count", "@{u}..HEAD"]);
  if (upstreamCount !== null && Number(upstreamCount) > 0) {
    failures.push(`[${path.basename(gitTop)}] Branch has ${upstreamCount} unpushed commit(s) ahead of upstream. Run "git push" and verify GitHub Actions CI.`);
  }

  const runtimeHealthScript = path.join(gitTop, "scripts", "runtime_health.sh");
  if (fs.existsSync(runtimeHealthScript)) {
    try {
      execFileSync("bash", [runtimeHealthScript], { cwd: gitTop, stdio: ["ignore", "ignore", "ignore"], timeout: 15000 });
    } catch {
      failures.push(`[${path.basename(gitTop)}] "bash scripts/runtime_health.sh" failed.`);
    }
  }
}

if (failures.length > 0) {
  console.log(JSON.stringify({
    decision: "continue",
    reason: "Mandatory Stop Delivery Hook blocked turn completion:\n- " + failures.join("\n- ")
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "allow" }));
' "${PAYLOAD}"
