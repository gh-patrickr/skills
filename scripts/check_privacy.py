#!/usr/bin/env python3
"""Pre-commit and CI scanner for secrets, keys, PII, and private network data.

Scans either staged files (``--staged``, using the git index blobs) or the whole
repository (``--all``, default). Uses only the Python standard library so it runs
identically on macOS, Linux, and GitHub Actions without third-party packages.

To enforce household- or organization-specific terms (names, streets, schools,
workplaces, internal codenames) without storing those terms inside a shareable
repository, list them one per line in an external file outside the repo:

* ``$PRIVACY_BLOCKLIST_FILE`` (if set), or
* ``~/.config/dsh-skills/privacy-blocklist.txt`` (if present), or
* ``--blocklist <path>``.

Lines starting with ``#`` and blank lines are ignored; prefix a line with
``re:`` for a case-insensitive regular expression, otherwise it is matched as
a case-insensitive substring.

Exit codes: 0 if clean, 1 if one or more findings are detected, 2 on usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

SENSITIVE_FILENAME_EXACT = {
    ".env",
    ".ds_key",
    ".netrc",
    "credentials.json",
    "device.properties",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "id_rsa",
    "secrets.yaml",
    "secrets.yml",
}

SENSITIVE_FILENAME_PREFIXES = (
    ".env.",
    "service-account",
)

SAFE_ENV_NAMES = {
    ".env.example",
    ".env.sample",
    ".env.template",
}

SENSITIVE_SUFFIXES = {
    ".db",
    ".duckdb",
    ".jks",
    ".key",
    ".keystore",
    ".mobileprovision",
    ".p12",
    ".pem",
    ".pfx",
    ".ppk",
    ".sqlite",
    ".sqlite3",
}

TEXT_SKIP_SUFFIXES = {
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".otf",
    ".pdf",
    ".png",
    ".pptx",
    ".ttf",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}

SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__"}

SAFE_EMAIL_DOMAINS = (
    ".example",
    "example.com",
    "example.net",
    "example.org",
    "users.noreply.github.com",
)

SAFE_EMAIL_EXACT = {
    "git@github.com",
    "noreply@github.com",
}

SAFE_MACS = {
    "00:00:00:00:00:00",
    "ff:ff:ff:ff:ff:ff",
    "aa:bb:cc:dd:ee:ff",
    "11:22:33:44:55:66",
}

PLACEHOLDER_WORDS = (
    "example",
    "sample",
    "dummy",
    "placeholder",
    "changeme",
    "your_",
    "redacted",
    "<",
    "${",
    "$(",
)

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
PRIVATE_IPV4_RE = re.compile(
    r"\b(?:"
    r"192\.168\.(?:\d{1,3}|x)\.(?:\d{1,3}|x)"
    r"|10\.(?:\d{1,3}|x)\.(?:\d{1,3}|x)\.(?:\d{1,3}|x)"
    r"|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}|x)\.(?:\d{1,3}|x)"
    r")\b",
    re.IGNORECASE,
)
MAC_RE = re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b")
LOCAL_PATH_RE = re.compile(
    r"(?:^|[\s\"'`=(])(/(?:Users|home|Volumes)/([A-Za-z0-9._-]+)(?:/|\b))"
)
COORDS_RE = re.compile(
    r"(?<!\d)-?\d{1,2}\.\d{4,}\s*°?\s*[NSns]?\s*[,;/]\s*-?\d{1,3}\.\d{4,}\s*°?\s*[EWew]?"
)
PHONE_RE = re.compile(
    r"(?<!\w)\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\w)"
)
PRIVATE_KEY_RE = re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")
TOKEN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("github-token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z\-_]{20,}\b")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b")),
    ("api-secret-key", re.compile(r"\b(?:sk-(?:ant-|proj-|live-)?[A-Za-z0-9_-]{20,}|[pr]k_live_[0-9a-zA-Z]{16,})\b")),
    ("jwt-token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
)
URL_CREDS_RE = re.compile(r"https?://([^\s/:@\"'<>]+):([^\s/@\"'<>]+)@([^\s/\"'<>]+)")
SECRET_ASSIGN_RE = re.compile(
    r"(?i)\b(api_key|apikey|client_secret|access_token|auth_token|private_key|password|passwd|secret_key)\b"
    r"\s*[:=]\s*[\"']?([A-Za-z0-9+/=_-]{16,})[\"']?"
)
DEV_TEAM_RE = re.compile(r"\bDEVELOPMENT_TEAM\s*[:=]\s*[\"']?([A-Z0-9]{10})[\"']?")
BUNDLE_ID_RE = re.compile(
    r"\bPRODUCT_BUNDLE_IDENTIFIER\s*[:=]\s*[\"']?([A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+)[\"']?"
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    detail: str

    def format_text(self) -> str:
        loc = f"{self.path}:{self.line}" if self.line else self.path
        return f"[{self.rule}] {loc}: {self.detail}"


def _run_git(root: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        check=False,
    )


def _is_git_repo(root: Path) -> bool:
    return _run_git(root, "rev-parse", "--is-inside-work-tree").returncode == 0


def _iter_staged_files(root: Path) -> list[tuple[str, bytes]]:
    res = _run_git(root, "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode("utf-8", errors="replace").strip() or "git diff --cached failed")
    items: list[tuple[str, bytes]] = []
    for raw in res.stdout.split(b"\x00"):
        if not raw:
            continue
        rel = raw.decode("utf-8", errors="replace")
        blob = _run_git(root, "show", f":{rel}")
        if blob.returncode == 0:
            items.append((rel, blob.stdout))
    return items


def _iter_all_files(root: Path) -> list[tuple[str, bytes]]:
    items: list[tuple[str, bytes]] = []
    if _is_git_repo(root):
        res = _run_git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
        if res.returncode != 0:
            raise RuntimeError(res.stderr.decode("utf-8", errors="replace").strip() or "git ls-files failed")
        rels = sorted({r.decode("utf-8", errors="replace") for r in res.stdout.split(b"\x00") if r})
        for rel in rels:
            p = root / rel
            if p.is_file() and not p.is_symlink():
                items.append((rel, p.read_bytes()))
        return items

    for p in sorted(root.rglob("*")):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.is_file() and not p.is_symlink():
            rel = str(p.relative_to(root))
            items.append((rel, p.read_bytes()))
    return items


def _load_blocklist(paths: Iterable[Path]) -> list[tuple[str, re.Pattern[str] | str]]:
    rules: list[tuple[str, re.Pattern[str] | str]] = []
    for path in paths:
        if not path.is_file():
            continue
        for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("re:"):
                pattern = line[3:].strip()
                if pattern:
                    rules.append((f"{path.name}:{lineno}", re.compile(pattern, re.IGNORECASE)))
            else:
                rules.append((f"{path.name}:{lineno}", line.lower()))
    return rules


def _default_blocklist_paths(root: Path, extra: list[str]) -> list[Path]:
    candidates: list[Path] = []
    env_path = os.environ.get("PRIVACY_BLOCKLIST_FILE", "").strip()
    if env_path:
        candidates.append(Path(env_path).expanduser())
    candidates.append(Path.home() / ".config" / "dsh-skills" / "privacy-blocklist.txt")
    candidates.append(root / ".privacy-blocklist")
    for item in extra:
        candidates.append(Path(item).expanduser())
    seen: set[Path] = set()
    unique: list[Path] = []
    for c in candidates:
        resolved = c.resolve() if c.exists() else c
        if resolved not in seen:
            seen.add(resolved)
            unique.append(c)
    return unique


def _looks_like_placeholder(value: str) -> bool:
    low = value.lower()
    return any(tok in low for tok in PLACEHOLDER_WORDS)


def _check_filename(rel: str) -> list[Finding]:
    name = Path(rel).name
    low = name.lower()
    if low in SAFE_ENV_NAMES:
        return []
    if low in SENSITIVE_FILENAME_EXACT:
        return [Finding(rel, 0, "sensitive-file", f"forbidden filename {name!r}")]
    if any(low.startswith(prefix) for prefix in SENSITIVE_FILENAME_PREFIXES):
        if low.endswith(".json") or low.startswith(".env."):
            return [Finding(rel, 0, "sensitive-file", f"forbidden filename {name!r}")]
    if Path(low).suffix in SENSITIVE_SUFFIXES:
        return [Finding(rel, 0, "sensitive-file", f"forbidden file extension {Path(low).suffix!r}")]
    return []


def _scan_text(
    rel: str,
    text: str,
    blocklist: list[tuple[str, re.Pattern[str] | str]],
) -> list[Finding]:
    findings: list[Finding] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if "privacy-allow:" in line:
            continue

        if PRIVATE_KEY_RE.search(line):
            findings.append(Finding(rel, lineno, "private-key", "PEM private key header detected"))

        for rule_name, rx in TOKEN_PATTERNS:
            if rx.search(line):
                findings.append(Finding(rel, lineno, rule_name, "secret/token pattern detected"))

        for m in URL_CREDS_RE.finditer(line):
            user, pwd, host = m.group(1), m.group(2), m.group(3)
            if not (_looks_like_placeholder(user) or _looks_like_placeholder(pwd) or _looks_like_placeholder(host)):
                findings.append(Finding(rel, lineno, "url-credentials", "embedded credentials in URL"))

        for m in SECRET_ASSIGN_RE.finditer(line):
            key_name, value = m.group(1), m.group(2)
            if not _looks_like_placeholder(value):
                findings.append(Finding(rel, lineno, "secret-assignment", f"possible hardcoded secret for {key_name}"))

        if PRIVATE_IPV4_RE.search(line):
            findings.append(Finding(rel, lineno, "private-ip", "RFC1918 private LAN IP address detected"))

        for m in MAC_RE.finditer(line):
            if m.group(0).lower() not in SAFE_MACS:
                findings.append(Finding(rel, lineno, "mac-address", "hardware MAC address detected"))

        for m in EMAIL_RE.finditer(line):
            full = m.group(0).lower()
            domain = m.group(1).lower()
            if full in SAFE_EMAIL_EXACT:
                continue
            if any(domain == d.lstrip(".") or domain.endswith(d) for d in SAFE_EMAIL_DOMAINS):
                continue
            findings.append(Finding(rel, lineno, "email-address", f"personal or non-example email ({domain})"))

        for m in LOCAL_PATH_RE.finditer(line):
            username = m.group(2)
            if username.lower() in {"user", "username", "runner", "shared"}:
                continue
            findings.append(Finding(rel, lineno, "local-home-path", f"local filesystem path {m.group(1)!r}"))

        if COORDS_RE.search(line):
            findings.append(Finding(rel, lineno, "precise-coordinates", "high-precision GPS coordinates detected"))

        if PHONE_RE.search(line):
            findings.append(Finding(rel, lineno, "phone-number", "possible phone number detected"))

        for m in DEV_TEAM_RE.finditer(line):
            findings.append(Finding(rel, lineno, "apple-team-id", "Apple DEVELOPMENT_TEAM identifier detected"))

        for m in BUNDLE_ID_RE.finditer(line):
            bundle_id = m.group(1).lower()
            if not (bundle_id.startswith("com.example.") or bundle_id.startswith("org.example.") or bundle_id.startswith("com.apple.")):
                findings.append(Finding(rel, lineno, "bundle-id", f"non-example bundle identifier {bundle_id!r}"))

        low_line = line.lower()
        for source_ref, rule in blocklist:
            matched = bool(rule.search(line)) if isinstance(rule, re.Pattern) else (rule in low_line)
            if matched:
                findings.append(Finding(rel, lineno, "custom-blocklist", f"matched blocklist rule ({source_ref})"))

    return findings


def scan_entries(
    entries: list[tuple[str, bytes]],
    blocklist: list[tuple[str, re.Pattern[str] | str]] | None = None,
) -> list[Finding]:
    active_blocklist = blocklist or []
    findings: list[Finding] = []
    for rel, raw in entries:
        findings.extend(_check_filename(rel))
        if Path(rel).suffix.lower() in TEXT_SKIP_SUFFIXES:
            continue
        if b"\x00" in raw[:4096]:
            continue
        text = raw.decode("utf-8", errors="replace")
        findings.extend(_scan_text(rel, text, active_blocklist))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check repo files for secrets, keys, PII, and private household data.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--all", action="store_true", help="Scan all tracked and non-ignored files (default).")
    mode.add_argument("--staged", action="store_true", help="Scan only git-staged changes from the index.")
    parser.add_argument("--root", default=None, help="Repository root (defaults to parent of scripts/).")
    parser.add_argument("--blocklist", action="append", default=[], help="Additional blocklist file path.")
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    blocklist = _load_blocklist(_default_blocklist_paths(root, args.blocklist))
    entries = _iter_staged_files(root) if args.staged else _iter_all_files(root)
    findings = scan_entries(entries, blocklist)

    if args.json:
        print(json.dumps([f.__dict__ for f in findings], indent=2))
    else:
        for f in findings:
            print(f.format_text())
        scope = "staged file(s)" if args.staged else "file(s)"
        print(f"Privacy scan: {len(entries)} {scope} checked, {len(findings)} finding(s).")

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
