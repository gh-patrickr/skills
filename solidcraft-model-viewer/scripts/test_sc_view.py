#!/usr/bin/env python3
"""Unit tests for sc_view.py and the shipped viewer template (stdlib only).

Run: python3 -m unittest discover -s solidcraft-model-viewer/scripts -p 'test_*.py'
"""

from __future__ import annotations

import base64
import json
import re
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import sc_view  # noqa: E402

TEMPLATE = sc_view.DEFAULT_TEMPLATE.read_text(encoding="utf-8")


def tiny_glb() -> bytes:
    """A valid, minimal GLB (one triangle) so the packer is tested on real bytes."""
    positions = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    gltf = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Tri:1"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "buffers": [{"byteLength": len(positions)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(positions)}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3",
                       "min": [0, 0, 0], "max": [1, 1, 0]}],
    }
    js = json.dumps(gltf).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(positions), 0x004E4942) + positions
    return struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body


def config_of(page: str) -> dict:
    block = sc_view.CONFIG_RE.search(page).group(0)
    return json.loads(sc_view.CONFIG_JSON_RE.search(block).group(1))


def model_tag(page: str) -> re.Match:
    return re.search(r'<script id="sc-model"[^>]*data-format="([^"]*)" data-name="([^"]*)">(.*?)</script>',
                     page, re.S)


class TemplateContract(unittest.TestCase):
    def test_single_blocks_and_bundle(self):
        self.assertEqual(len(sc_view.MODEL_RE.findall(TEMPLATE)), 1)
        self.assertEqual(len(sc_view.CONFIG_RE.findall(TEMPLATE)), 1)
        self.assertNotIn("__VIEWER_BUNDLE__", TEMPLATE, "template was not built (run npm run build in src/)")
        self.assertIn("scViewer", TEMPLATE)
        self.assertIn("WebGLRenderer", TEMPLATE)

    def test_offline_no_external_scripts_or_styles(self):
        self.assertIsNone(re.search(r'<script[^>]+src=', TEMPLATE), "viewer must not load external scripts")
        self.assertIsNone(re.search(r'<link[^>]+stylesheet', TEMPLATE), "viewer must not load external CSS")

    def test_template_ships_empty(self):
        self.assertEqual(config_of(TEMPLATE)["model"], "")
        self.assertEqual(model_tag(TEMPLATE).group(3).strip(), "")


class PackTests(unittest.TestCase):
    def test_embed_roundtrip(self):
        data = tiny_glb()
        page = sc_view.pack(TEMPLATE, data=data, fmt="glb", name="tri.glb", overrides={"title": "Tri", "view": "top"})
        tag = model_tag(page)
        self.assertEqual(tag.group(1), "glb")
        self.assertEqual(tag.group(2), "tri.glb")
        self.assertEqual(base64.b64decode("".join(tag.group(3).split())), data)
        cfg = config_of(page)
        self.assertEqual((cfg["title"], cfg["view"], cfg["model"]), ("Tri", "top", ""))
        self.assertEqual(cfg["height"], 440, "untouched defaults survive")

    def test_repack_is_idempotent(self):
        once = sc_view.pack(TEMPLATE, data=tiny_glb(), fmt="glb", name="a.glb")
        twice = sc_view.pack(once, data=tiny_glb(), fmt="glb", name="a.glb")
        self.assertEqual(once, twice)

    def test_link_mode_has_no_payload(self):
        page = sc_view.pack(TEMPLATE, data=tiny_glb(), fmt="glb", name="a.glb", link="models/a.glb")
        self.assertEqual(config_of(page)["model"], "models/a.glb")
        self.assertEqual(model_tag(page).group(3), "")

    def test_script_breakout_is_escaped(self):
        page = sc_view.pack(TEMPLATE, data=b"solid x", fmt="stl", name='a"<b>.stl',
                            overrides={"title": "</script><script>alert(1)</script>"})
        self.assertEqual(config_of(page)["title"], "</script><script>alert(1)</script>")
        self.assertNotIn("</script><script>alert", page)
        self.assertIn('data-name="a&quot;&lt;b&gt;.stl"', page)

    def test_none_overrides_are_ignored(self):
        page = sc_view.pack(TEMPLATE, data=b"x", fmt="stl", name="x.stl", overrides={"edges": None, "ground": False})
        cfg = config_of(page)
        self.assertTrue(cfg["edges"])
        self.assertFalse(cfg["ground"])

    def test_broken_template_rejected(self):
        with self.assertRaises(sc_view.PackError):
            sc_view.pack("<html></html>", data=b"x")

    def test_detect_format(self):
        self.assertEqual(sc_view.detect_format(tiny_glb(), "whatever.bin"), "glb")
        self.assertEqual(sc_view.detect_format(b"solid a\nendsolid", "a.stl"), "stl")
        self.assertEqual(sc_view.detect_format(b'  {"asset":{}}', "a.bin"), "gltf")
        self.assertEqual(sc_view.detect_format(b"\x00" * 84, "a.bin"), "stl")


class CliTests(unittest.TestCase):
    def run_cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(HERE / "sc_view.py"), *args], capture_output=True, text=True)

    def test_cli_embed_and_link(self):
        with tempfile.TemporaryDirectory() as tmp:
            glb = Path(tmp) / "models" / "tri.glb"
            glb.parent.mkdir()
            glb.write_bytes(tiny_glb())
            res = self.run_cli(str(glb), "-o", str(Path(tmp) / "out" / "tri.html"), "--title", "T", "--spin")
            self.assertEqual(res.returncode, 0, res.stderr)
            page = (Path(tmp) / "out" / "tri.html").read_text(encoding="utf-8")
            self.assertTrue(config_of(page)["autoRotate"])
            self.assertTrue(model_tag(page).group(3).strip())

            res = self.run_cli(str(glb), "-o", str(Path(tmp) / "site" / "tri.html"), "--link")
            self.assertEqual(res.returncode, 0, res.stderr)
            page = (Path(tmp) / "site" / "tri.html").read_text(encoding="utf-8")
            self.assertEqual(config_of(page)["model"], "../models/tri.glb")

    def test_cli_default_output_next_to_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            glb = Path(tmp) / "part.glb"
            glb.write_bytes(tiny_glb())
            self.assertEqual(self.run_cli(str(glb)).returncode, 0)
            self.assertTrue((Path(tmp) / "part.html").is_file())

    def test_cli_usage_errors(self):
        self.assertEqual(self.run_cli("/nonexistent/x.glb").returncode, 2)
        with tempfile.NamedTemporaryFile(suffix=".txt") as f:
            self.assertEqual(self.run_cli(f.name).returncode, 2)


if __name__ == "__main__":
    unittest.main()
