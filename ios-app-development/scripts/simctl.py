#!/usr/bin/env python3
"""Simulator helpers for the Apple app skills.

Wraps `xcrun simctl` so scripts never hard-code a device name or a runtime version.

    simctl.py resolve --platform ios [--device REGEX] [--os latest|26] [--format destination|udid|json] [--boot]
    simctl.py list    --platform ios [--json]
    simctl.py boot    --udid UDID
    simctl.py statusbar --udid UDID
    simctl.py privacy --udid UDID --bundle-id ID [--reset|--grant-Photos]
    simctl.py screenshot --udid UDID --out PATH
    simctl.py erase   --udid UDID

Exit codes: 0 ok, 2 nothing matched, 3 simctl unavailable.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys

PLATFORM_LABEL = {"ios": "iOS", "watchos": "watchOS"}
DEFAULT_DEVICE = {"ios": r"iPhone", "watchos": r"Apple Watch"}


def die(message: str, code: int = 2) -> "NoReturn":
    print(f"[fail] {message}", file=sys.stderr)
    raise SystemExit(code)


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    try:
        proc = subprocess.run(args, capture_output=True, text=True)
    except FileNotFoundError:
        die("xcrun not found — install Xcode and run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer", 3)
    if check and proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout).strip()
        die(f"{' '.join(args)} failed: {stderr}")
    return proc


def require_simctl() -> None:
    if shutil.which("xcrun") is None:
        die("xcrun not found — install Xcode", 3)
    probe = subprocess.run(["xcrun", "simctl", "help"], capture_output=True, text=True)
    if probe.returncode != 0:
        die(
            "`xcrun simctl` is unavailable. This means full Xcode is not selected "
            "(Command Line Tools cannot run simulators).\n"
            "  Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
            3,
        )


def parse_version(identifier: str) -> tuple[int, ...]:
    match = re.search(r"-(\d+(?:-\d+)*)$", identifier)
    if not match:
        return (0,)
    return tuple(int(part) for part in match.group(1).split("-"))


def runtime_platform(identifier: str) -> str:
    lowered = identifier.lower()
    if "watchos" in lowered:
        return "watchos"
    if "ios" in lowered:
        return "ios"
    return "other"


def load_devices() -> dict:
    proc = run(["xcrun", "simctl", "list", "devices", "available", "--json"])
    try:
        return json.loads(proc.stdout or "{}").get("devices", {})
    except json.JSONDecodeError:
        die("could not parse `simctl list devices --json`")


def collect(platform: str) -> list[dict]:
    devices = load_devices()
    result: list[dict] = []
    for runtime_id, entries in devices.items():
        if runtime_platform(runtime_id) != platform:
            continue
        version = parse_version(runtime_id)
        for entry in entries:
            if not entry.get("isAvailable", True):
                continue
            result.append(
                {
                    "name": entry.get("name", ""),
                    "udid": entry.get("udid", ""),
                    "state": entry.get("state", "Unknown"),
                    "runtime": runtime_id,
                    "version": version,
                    "version_string": ".".join(str(v) for v in version),
                }
            )
    return result


def resolve(args: argparse.Namespace) -> int:
    require_simctl()
    platform = args.platform
    candidates = collect(platform)
    if not candidates:
        label = PLATFORM_LABEL[platform]
        die(
            f"no available {label} simulator. Install the runtime with:\n"
            f"  xcodebuild -downloadPlatform {'iOS' if platform == 'ios' else 'watchOS'}\n"
            f"then re-run this command.",
        )

    pattern = re.compile(args.device or DEFAULT_DEVICE[platform], re.IGNORECASE)
    candidates = [c for c in candidates if pattern.search(c["name"])]
    if not candidates:
        names = ", ".join(sorted({c["name"] for c in collect(platform)})) or "none"
        die(f"no {PLATFORM_LABEL[platform]} simulator matches /{pattern.pattern}/. Available: {names}")

    if args.os != "latest":
        wanted = tuple(int(p) for p in args.os.split("."))
        filtered = [c for c in candidates if c["version"][: len(wanted)] == wanted]
        if not filtered:
            die(f"no simulator with {PLATFORM_LABEL[platform]} {args.os}; available: "
                + ", ".join(sorted({c['version_string'] for c in candidates})))
        candidates = filtered

    best_version = max(c["version"] for c in candidates)
    candidates = [c for c in candidates if c["version"] == best_version]
    candidates.sort(key=lambda c: (c["state"] != "Booted", c["name"]))
    chosen = candidates[0]

    label = PLATFORM_LABEL[platform]
    destination = f"platform={label} Simulator,id={chosen['udid']}"

    if args.boot and chosen["state"] != "Booted":
        boot_device(chosen["udid"])

    if args.format == "json":
        print(json.dumps({
            "name": chosen["name"],
            "udid": chosen["udid"],
            "state": chosen["state"],
            "runtime": chosen["runtime"],
            "version": chosen["version_string"],
            "destination": destination,
        }))
    elif args.format == "udid":
        print(chosen["udid"])
    else:
        print(destination)
    return 0


def boot_device(udid: str) -> None:
    proc = run(["xcrun", "simctl", "boot", udid], check=False)
    if proc.returncode != 0 and "current state: Booted" not in (proc.stderr or ""):
        # A device that is already booting is fine; anything else is a real error.
        if "Unable to boot device in current state: Booted" not in (proc.stderr or ""):
            die(f"could not boot {udid}: {(proc.stderr or proc.stdout).strip()}")
    status = run(["xcrun", "simctl", "bootstatus", udid, "-b"], check=False)
    if status.returncode != 0:
        die(f"simulator {udid} did not finish booting: {(status.stderr or status.stdout).strip()}")


def cmd_boot(args: argparse.Namespace) -> int:
    require_simctl()
    boot_device(args.udid)
    print(f"[ok] booted {args.udid}")
    return 0


def cmd_statusbar(args: argparse.Namespace) -> int:
    require_simctl()
    run([
        "xcrun", "simctl", "status_bar", args.udid, "override",
        "--time", "9:41",
        "--batteryState", "charged",
        "--batteryLevel", "100",
        "--cellularBars", "4",
        "--wifiBars", "3",
    ])
    print(f"[ok] status bar normalised on {args.udid}")
    return 0


def cmd_privacy(args: argparse.Namespace) -> int:
    require_simctl()
    service = args.service or "all"
    if args.reset:
        run(["xcrun", "simctl", "privacy", args.udid, "reset", service] + ([args.bundle_id] if args.bundle_id else []))
        print(f"[ok] reset {service} privacy on {args.udid}")
    else:
        if not args.bundle_id:
            die("--bundle-id is required unless --reset is used")
        run(["xcrun", "simctl", "privacy", args.udid, "grant", service, args.bundle_id])
        print(f"[ok] granted {service} to {args.bundle_id}")
    return 0


def cmd_screenshot(args: argparse.Namespace) -> int:
    require_simctl()
    run(["xcrun", "simctl", "io", args.udid, "screenshot", args.out])
    print(args.out)
    return 0


def cmd_erase(args: argparse.Namespace) -> int:
    require_simctl()
    run(["xcrun", "simctl", "shutdown", args.udid], check=False)
    run(["xcrun", "simctl", "erase", args.udid])
    print(f"[ok] erased {args.udid}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    require_simctl()
    items = collect(args.platform)
    if args.json:
        print(json.dumps([{k: v for k, v in item.items() if k != "version"} for item in items], indent=2))
    else:
        for item in sorted(items, key=lambda i: (i["version"], i["name"]), reverse=True):
            print(f"{item['version_string']:>6}  {item['state']:<8}  {item['name']}  {item['udid']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def platform_arg(p: argparse.ArgumentParser) -> None:
        p.add_argument("--platform", choices=["ios", "watchos"], default="ios")

    p = sub.add_parser("resolve", help="pick a simulator and print a destination")
    platform_arg(p)
    p.add_argument("--device", help="regex on the device name, e.g. 'iPhone 16'")
    p.add_argument("--os", default="latest", help="'latest' or a version like 26 or 26.0")
    p.add_argument("--format", choices=["destination", "udid", "json"], default="destination")
    p.add_argument("--boot", action="store_true")
    p.set_defaults(func=resolve)

    p = sub.add_parser("list", help="list available devices")
    platform_arg(p)
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("boot")
    p.add_argument("--udid", required=True)
    p.set_defaults(func=cmd_boot)

    p = sub.add_parser("statusbar")
    p.add_argument("--udid", required=True)
    p.set_defaults(func=cmd_statusbar)

    p = sub.add_parser("privacy")
    p.add_argument("--udid", required=True)
    p.add_argument("--bundle-id")
    p.add_argument("--service", help="e.g. photos, location, contacts, all")
    p.add_argument("--reset", action="store_true")
    p.set_defaults(func=cmd_privacy)

    p = sub.add_parser("screenshot")
    p.add_argument("--udid", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_screenshot)

    p = sub.add_parser("erase")
    p.add_argument("--udid", required=True)
    p.set_defaults(func=cmd_erase)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
