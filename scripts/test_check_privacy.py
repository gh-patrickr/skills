#!/usr/bin/env python3
"""Unit tests for scripts/check_privacy.py."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_privacy import main as check_main
from check_privacy import scan_entries


class CheckPrivacyTests(unittest.TestCase):
    def test_clean_example_content_passes(self) -> None:
        entries = [
            (
                "example/SKILL.md",
                b"Use http://127.0.0.1:9000 or <DEVICE_IP>:5555.\n"
                b"Contact strategy@northwind.example.\n"
                b"PRODUCT_BUNDLE_IDENTIFIER: com.example.myapp\n"
                b"Proxy: http://<user>:<pass>@<host>:<port>\n",
            )
        ]
        self.assertEqual(scan_entries(entries), [])

    def test_blocks_private_lan_ip(self) -> None:
        ip = "192." + "168.0.67"
        findings = scan_entries([("adb/SKILL.md", f"S={ip}:5555\n".encode())])
        self.assertEqual([f.rule for f in findings], ["private-ip"])

    def test_blocks_rfc1918_10_and_172_subnets(self) -> None:
        ip10 = "10." + "0.1.5"
        ip172 = "172." + "16.5.4"
        findings = scan_entries([("net.md", f"{ip10}\n{ip172}\n".encode())])
        self.assertEqual([f.rule for f in findings], ["private-ip", "private-ip"])

    def test_blocks_tokens_and_private_keys(self) -> None:
        gh_tok = "ghp_" + "A" * 36
        pem_hdr = "-----BEGIN " + "RSA PRIVATE KEY-----"
        findings = scan_entries(
            [("leak.txt", f"token={gh_tok}\n{pem_hdr}\n".encode())]
        )
        rules = {f.rule for f in findings}
        self.assertIn("github-token", rules)
        self.assertIn("private-key", rules)

    def test_blocks_personal_email_and_local_path(self) -> None:
        email = "alice" + "@personal-domain.org"
        home_path = "/Users/" + "alice/projects/secret"
        findings = scan_entries([("notes.md", f"{email}\n{home_path}\n".encode())])
        rules = {f.rule for f in findings}
        self.assertIn("email-address", rules)
        self.assertIn("local-home-path", rules)

    def test_blocks_precise_coordinates_and_sensitive_filenames(self) -> None:
        coords = "48.85" + "66, 2.35" + "22"
        findings = scan_entries(
            [
                (".env.local", b"FOO=bar\n"),
                ("geo.md", f"Location: {coords}\n".encode()),
            ]
        )
        rules = {f.rule for f in findings}
        self.assertIn("sensitive-file", rules)
        self.assertIn("precise-coordinates", rules)

    def test_external_blocklist_catches_household_terms(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            bl = tmp_path / "blocklist.txt"
            bl.write_text("# household terms\nSecretFamilyTerm\nre:codename-[0-9]+\n", encoding="utf-8")
            target = tmp_path / "repo"
            target.mkdir()
            (target / "doc.md").write_text("Talks about secretfamilyterm and CODENAME-42.\n", encoding="utf-8")

            rc = check_main(["--all", "--root", str(target), "--blocklist", str(bl)])
            self.assertEqual(rc, 1)

    def test_staged_mode_checks_git_index(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "test"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            good = repo / "good.md"
            good.write_text("clean\n", encoding="utf-8")
            subprocess.run(["git", "add", "good.md"], cwd=repo, check=True)
            self.assertEqual(check_main(["--staged", "--root", str(repo)]), 0)

            bad = repo / "bad.md"
            bad.write_text("ip=" + "192." + "168.1.99\n", encoding="utf-8")
            subprocess.run(["git", "add", "bad.md"], cwd=repo, check=True)
            self.assertEqual(check_main(["--staged", "--root", str(repo)]), 1)


if __name__ == "__main__":
    unittest.main()
