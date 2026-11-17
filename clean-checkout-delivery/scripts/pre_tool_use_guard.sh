#!/usr/bin/env bash
# ==============================================================================
# Antigravity PreToolUse Deterministic Guard (`pre_tool_use_guard.sh`)
#
# Intercepts `run_command` tool calls BEFORE execution via `.agents/hooks.json`
# or `~/.gemini/config/hooks.json` to deterministically block:
#   - Blanket git staging (`git add -A`, `git add --all`, `git add .`)
#   - Bypassing git hooks (`git commit --no-verify` / `git push --no-verify`)
#
# Contract:
#   Input  (stdin) : JSON payload containing `toolCall.name` and `toolCall.args`
#   Output (stdout): `{"decision": "allow"}` or `{"decision": "deny", "reason": "..."}`
# ==============================================================================

set -euo pipefail

PAYLOAD="$(cat || true)"

node -e '
const raw = process.argv[1] || "{}";
let data = {};
try {
  data = JSON.parse(raw);
} catch {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

const toolName = (data.toolCall && data.toolCall.name) || data.toolName || "";
const args = (data.toolCall && data.toolCall.args) || data.toolArgs || {};
const cmd = String(args.CommandLine || args.command || "");

if (toolName && toolName !== "run_command") {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

const blanketGitAdd = /(?:^|[;&|]\s*|\s+)git\s+add\s+(?:-[a-zA-Z]*A|--all|\.(?:\s|$|[;&|]))/;
if (blanketGitAdd.test(cmd)) {
  console.log(JSON.stringify({
    decision: "deny",
    reason: "Deterministic PreToolUse Hook: Blanket staging (`git add -A`, `git add --all`, `git add .`) is forbidden by clean-checkout-delivery. Stage specific file paths explicitly (`git add <file1> <file2>`)."
  }));
  process.exit(0);
}

const noVerifyGit = /(?:^|[;&|]\s*|\s+)git\s+(?:commit|push)\b[^\n;&|]*--no-verify\b/;
if (noVerifyGit.test(cmd)) {
  console.log(JSON.stringify({
    decision: "deny",
    reason: "Deterministic PreToolUse Hook: Bypassing Git hooks with `--no-verify` is forbidden. Fix the underlying test, typecheck, or privacy failure instead."
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "allow" }));
' "${PAYLOAD}"
