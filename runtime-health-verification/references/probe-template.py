#!/usr/bin/env python3
"""Generic runtime health probe — copy to <project>/scripts/runtime_health.py and adapt.

Contract (the agent's decision table depends on it):

* ``0`` — healthy: leave the running process alone.
* ``1`` — reachable but unhealthy: restart it, then investigate if it recurs.
* ``2`` — nothing answering on the base URL: start the service.

Adapt the CONFIG block and the ``extra_checks`` function. Keep the probe read-only: it must
never migrate, repair or write rows.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

# --- CONFIG -----------------------------------------------------------------

APP_NAME = "myapp"                       # value the /health payload must name
DEFAULT_BASE_URL = "http://127.0.0.1:9000"
HEALTH_PATH = "/health"                  # or /api/health
SURFACE_PATH = "/"                       # the page the user actually opens
TIMEOUT_SECONDS = 5.0


# --- PROBE ------------------------------------------------------------------


@dataclass
class Report:
    base_url: str
    exit_code: int = 0
    problems: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    health: dict[str, Any] | None = None

    @property
    def ok(self) -> bool:
        return self.exit_code == 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "exit_code": self.exit_code,
            "base_url": self.base_url,
            "problems": self.problems,
            "warnings": self.warnings,
            "health": self.health,
        }


class Unreachable(Exception):
    """The base URL is not answering HTTP at all."""


def get(url: str) -> tuple[int, str, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": "runtime-health/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        body = response.read()
        return response.status, response.headers.get("Content-Type", ""), body


def identity_checks(payload: dict[str, Any], report: Report) -> None:
    """Checks every service should answer. Adapt keys to the project."""
    if payload.get("app") not in (None, APP_NAME):
        report.problems.append(f"wrong app: expected {APP_NAME!r}, got {payload.get('app')!r}")
    if payload.get("db_writable") is False:
        report.problems.append("database is not writable")
    if payload.get("lock_error"):
        report.problems.append(f"database lock: {payload['lock_error']}")
    latest = payload.get("latest_schema_version")
    if latest is not None and payload.get("schema_version") != latest:
        report.problems.append(
            f"stale schema: {payload.get('schema_version')} != {latest}"
        )
    human = payload.get("human_data")
    if isinstance(human, dict) and human.get("healthy") is False:
        report.problems.append("protected human data is unhealthy")


def extra_checks(payload: dict[str, Any], report: Report) -> None:
    """Project-specific invariants. Replace or extend."""
    return None


def probe(base_url: str) -> Report:
    report = Report(base_url=base_url)
    try:
        status, _ctype, body = get(base_url.rstrip("/") + HEALTH_PATH)
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        raise Unreachable(str(exc)) from exc

    if status != 200:
        report.problems.append(f"{HEALTH_PATH} returned {status}")
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        payload = {}
        report.warnings.append(f"{HEALTH_PATH} was not JSON")
    report.health = payload or None
    if payload:
        identity_checks(payload, report)
        extra_checks(payload, report)

    try:
        page_status, ctype, page = get(base_url.rstrip("/") + SURFACE_PATH)
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        report.problems.append(f"surface request failed: {exc}")
    else:
        if page_status != 200:
            report.problems.append(f"{SURFACE_PATH} returned {page_status}")
        if "text/html" not in ctype:
            report.problems.append(f"{SURFACE_PATH} is not HTML ({ctype or 'no type'})")
        if not page.strip():
            report.problems.append(f"{SURFACE_PATH} rendered an empty body")

    report.exit_code = 0 if not report.problems else 1
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    args = parser.parse_args(argv)

    try:
        report = probe(args.base_url)
    except Unreachable as exc:
        report = Report(base_url=args.base_url, exit_code=2)
        report.problems.append(f"unreachable: {exc}")

    if args.json:
        print(json.dumps(report.as_dict(), indent=2))
    else:
        verdict = {0: "OK", 1: "UNHEALTHY", 2: "DOWN"}[report.exit_code]
        print(f"{verdict} {report.base_url}")
        for problem in report.problems:
            print(f"  - {problem}")
        for warning in report.warnings:
            print(f"  ! {warning}")
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
