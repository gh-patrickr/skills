#!/usr/bin/env python3
"""Summarise an .xcresult bundle into a human summary, coverage number and JUnit XML.

    xcresult.py --xcresult PATH [--out DIR] [--junit PATH] [--coverage-min 0.75]
                [--summary-only] [--json]

Exit codes: 0 ok, 1 failed tests or coverage below the gate, 3 result parsing unavailable
(older Xcode). A missing xcresult is exit 2.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET


def warn(msg: str) -> None:
    print(f"[warn] {msg}", file=sys.stderr)


def fail(msg: str) -> None:
    print(f"[fail] {msg}", file=sys.stderr)


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True)


def xcrun_json(args: list[str]) -> dict | None:
    proc = run(["xcrun", "xcresulttool", *args, "--format", "json"])
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def test_summary(path: str) -> dict | None:
    # Xcode 16+
    data = xcrun_json(["get", "test-results", "summary", "--path", path])
    if data and "totalTestCount" in data:
        return data
    # Xcode 16 also supports the plural-less form on some builds.
    data = xcrun_json(["get", "test-results", "summary", "--path", path, "--compact"])
    return data if data and "totalTestCount" in data else None


def coverage(path: str) -> float | None:
    proc = run(["xcrun", "xccov", "view", "--report", "--json", path])
    if proc.returncode != 0:
        return None
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    covered = executable = 0
    for target in report.get("targets", []):
        for entry in target.get("files", []):
            covered += int(entry.get("coveredLines", 0))
            executable += int(entry.get("executableLines", 0))
    if executable == 0:
        return None
    return covered / executable


def export_attachments(path: str, out_dir: str) -> str | None:
    target = os.path.join(out_dir, "attachments")
    os.makedirs(target, exist_ok=True)
    proc = run(["xcrun", "xcresulttool", "export", "attachments", "--path", path, "--output-path", target])
    if proc.returncode != 0:
        return None
    return target


def write_junit(summary: dict, path: str) -> None:
    total = int(summary.get("totalTestCount", 0))
    failed = int(summary.get("failedTests", 0))
    skipped = int(summary.get("skippedTests", 0))
    suite = ET.Element("testsuite", {
        "name": summary.get("title", "Tests"),
        "tests": str(total),
        "failures": str(failed),
        "skipped": str(skipped),
        "errors": "0",
    })
    for failure in summary.get("failures", []):
        case = ET.SubElement(suite, "testcase", {
            "classname": failure.get("targetName", "unknown"),
            "name": failure.get("testName", "unknown"),
        })
        node = ET.SubElement(case, "failure", {
            "message": (failure.get("failureText") or "failed").strip().splitlines()[0][:500],
        })
        node.text = failure.get("failureText", "")
    tree = ET.ElementTree(suite)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xcresult", required=True)
    parser.add_argument("--out", help="directory for exported attachments and summaries")
    parser.add_argument("--junit", help="write JUnit XML here")
    parser.add_argument("--coverage-min", type=float, default=None)
    parser.add_argument("--summary-only", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(args.xcresult):
        fail(f"no such result bundle: {args.xcresult}")
        return 2

    summary = test_summary(args.xcresult)
    if summary is None:
        warn(
            "this Xcode cannot report test results via xcresulttool; "
            "read the xcodebuild log instead (requires Xcode 16+ for structured results)"
        )
        return 3

    total = int(summary.get("totalTestCount", 0))
    passed = int(summary.get("passedTests", 0))
    failed = int(summary.get("failedTests", 0))
    skipped = int(summary.get("skippedTests", 0))
    failures = summary.get("failures", []) or []
    cov = coverage(args.xcresult)

    if args.json:
        print(json.dumps({
            "total": total, "passed": passed, "failed": failed, "skipped": skipped,
            "coverage": cov, "failures": failures,
        }))
    else:
        print(f"tests: {passed} passed, {failed} failed, {skipped} skipped (of {total})")
        if cov is not None:
            print(f"coverage: {cov * 100:.1f}%")
        for failure in failures[:10]:
            name = failure.get("testName", "?")
            target = failure.get("targetName", "?")
            text = (failure.get("failureText") or "").strip().splitlines()
            print(f"  FAIL {target}/{name}: {text[0] if text else 'failed'}")

    if args.out:
        attachments = export_attachments(args.xcresult, args.out)
        if attachments:
            print(f"attachments: {attachments}", file=sys.stderr)
    if args.junit:
        write_junit(summary, args.junit)
        print(f"junit: {args.junit}", file=sys.stderr)

    if failed > 0:
        return 1
    if args.coverage_min is not None and cov is not None and cov < args.coverage_min:
        fail(f"coverage {cov * 100:.1f}% is below the {args.coverage_min * 100:.0f}% gate")
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
