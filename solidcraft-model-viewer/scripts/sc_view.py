#!/usr/bin/env python3
"""Pack a SolidCraft model into the single-file SolidCraft model viewer.

    sc_view.py bracket.sc                      # -> bracket.html (GLB exported via solidcraft-cli, embedded)
    sc_view.py bracket.glb -o docs/bracket.html --title "Bracket v2" --view front
    sc_view.py part.step -o part.html          # STEP/STP converted through solidcraft-cli
    sc_view.py bracket.glb -o site/bracket.html --link   # reference the GLB instead of embedding it

Embedding (default) produces one self-contained HTML file that works offline, from file://,
in any browser and as an Antigravity HTML artifact (whose CSP blocks external fetches).
--link writes the GLB path into the viewer's config instead; that page must be served over
http(s) (python3 -m http.server) because browsers block fetch() from file:// pages.

Only the Python standard library is used. Exit codes: 0 ok, 1 error, 2 usage error.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE = SKILL_DIR / "assets" / "solidcraft-viewer.html"
GENERATOR_RE = re.compile(r'<meta\s+name="generator"\s+content="([^"]+)"')
MODEL_RE = re.compile(r"<!--SC-MODEL-BEGIN-->.*?<!--SC-MODEL-END-->", re.S)
CONFIG_RE = re.compile(r"<!--SC-CONFIG-BEGIN-->.*?<!--SC-CONFIG-END-->", re.S)
CONFIG_JSON_RE = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
CAD_SUFFIXES = {".sc", ".solidcraft", ".step", ".stp"}
MESH_SUFFIXES = {".glb", ".gltf", ".stl"}
VIEWS = ("iso", "front", "back", "top", "bottom", "left", "right")
EMBED_WARN_BYTES = 12 * 1024 * 1024


class PackError(Exception):
    """A user-facing packing error."""


def detect_format(data: bytes, name: str) -> str:
    if data[:4] == b"glTF":
        return "glb"
    suffix = Path(name).suffix.lower().lstrip(".")
    if suffix in {"glb", "gltf", "stl"}:
        return suffix
    return "gltf" if data.lstrip()[:1] == b"{" else "stl"


def export_glb(source: Path, out_glb: Path, quality: str | None = None) -> None:
    """Export a SolidCraft design (or STEP part) to binary glTF with solidcraft-cli."""
    cli = shutil.which("solidcraft-cli")
    if not cli:
        raise PackError("solidcraft-cli not found on PATH; export a .glb first (MCP: export {path: 'x.glb'}).")
    cmd = [cli, "run", "--in", str(source), "--out", str(out_glb), "--quiet"]
    if quality:
        cmd += ["--quality", quality]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_glb.is_file() or out_glb.stat().st_size == 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise PackError(f"solidcraft-cli could not export {source.name} to GLB:\n{detail}")


def read_config(template: str) -> dict:
    block = CONFIG_RE.search(template)
    if not block:
        raise PackError("template has no <!--SC-CONFIG-BEGIN--> ... <!--SC-CONFIG-END--> block")
    m = CONFIG_JSON_RE.search(block.group(0))
    if not m:
        raise PackError("template config block has no <script> element")
    try:
        return json.loads(m.group(1) or "{}")
    except json.JSONDecodeError as exc:
        raise PackError(f"template config JSON is invalid: {exc}") from exc


def render_config(config: dict) -> str:
    text = json.dumps(config, indent=2, ensure_ascii=False).replace("</", "<\\/")
    return (
        "<!--SC-CONFIG-BEGIN-->\n"
        f'<script id="sc-config" type="application/json">\n{text}\n</script>\n'
        "<!--SC-CONFIG-END-->"
    )


def render_model(data: bytes | None, fmt: str = "", name: str = "") -> str:
    payload = ""
    if data:
        b64 = base64.b64encode(data).decode("ascii")
        payload = "\n".join(b64[i : i + 120] for i in range(0, len(b64), 120))
    attrs = f'data-format="{html.escape(fmt, quote=True)}" data-name="{html.escape(name, quote=True)}"'
    return (
        "<!--SC-MODEL-BEGIN-->\n"
        f'<script id="sc-model" type="application/octet-stream" {attrs}>{payload}</script>\n'
        "<!--SC-MODEL-END-->"
    )


def pack(
    template: str,
    *,
    data: bytes | None = None,
    fmt: str = "",
    name: str = "",
    link: str | None = None,
    overrides: dict | None = None,
) -> str:
    """Return the viewer HTML with the model embedded (data) or referenced (link)."""
    if len(MODEL_RE.findall(template)) != 1 or len(CONFIG_RE.findall(template)) != 1:
        raise PackError("template must contain exactly one SC-MODEL and one SC-CONFIG block")
    config = read_config(template)
    config.update({k: v for k, v in (overrides or {}).items() if v is not None})
    config["model"] = link or ""
    out = CONFIG_RE.sub(lambda _m: render_config(config), template, count=1)
    return MODEL_RE.sub(lambda _m: render_model(None if link else data, fmt, name), out, count=1)


def viewer_version(template_path: Path = DEFAULT_TEMPLATE) -> str:
    """Return the version string embedded in the viewer template's generator meta tag."""
    try:
        head = template_path.read_text(encoding="utf-8")[:2048]
    except OSError:
        return "solidcraft-model-viewer (unknown)"
    m = GENERATOR_RE.search(head)
    return m.group(1) if m else "solidcraft-model-viewer (unknown)"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--version", action="version", version=viewer_version())
    p.add_argument("input", type=Path, help=".sc/.step/.stp (exported via solidcraft-cli) or .glb/.gltf/.stl")
    p.add_argument("-o", "--output", type=Path, help="output .html (default: next to the input)")
    p.add_argument("--title", help="title shown in the viewer (default: file name)")
    p.add_argument("--view", choices=VIEWS, help="initial view (default iso)")
    p.add_argument("--height", type=int, help="height in px when shown inside an iframe/chat (default 440)")
    p.add_argument("--up", choices=("auto", "y", "z"), help="model up axis (auto: GLB y, STL z)")
    p.add_argument("--background", help="'auto', 'transparent' or a CSS colour")
    p.add_argument("--no-edges", action="store_true", help="start without feature edges")
    p.add_argument("--no-ground", action="store_true", help="start without grid/shadow")
    p.add_argument("--spin", action="store_true", help="start auto-rotating")
    p.add_argument("--link", action="store_true", help="reference the GLB by relative URL instead of embedding it")
    p.add_argument("--glb-out", type=Path, help="keep the GLB exported from a .sc/.step input at this path")
    p.add_argument("--quality", choices=("standard", "fine", "finest"), help="solidcraft-cli tessellation quality")
    p.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE, help="viewer template (default: skill asset)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    src: Path = args.input
    if not src.is_file():
        print(f"error: {src} not found", file=sys.stderr)
        return 2
    suffix = src.suffix.lower()
    if suffix not in CAD_SUFFIXES | MESH_SUFFIXES:
        print(f"error: unsupported input {src.name} (use .sc, .step, .stp, .glb, .gltf or .stl)", file=sys.stderr)
        return 2
    out = args.output or src.with_suffix(".html")
    if out.suffix.lower() not in {".html", ".htm"}:
        out = out.with_suffix(".html")

    try:
        template = args.template.read_text(encoding="utf-8")
        model_path = src
        tmpdir = None
        if suffix in CAD_SUFFIXES:
            if args.glb_out:
                model_path = args.glb_out
            elif args.link:
                model_path = out.with_suffix(".glb")
            else:
                tmpdir = tempfile.TemporaryDirectory(prefix="sc_view_")
                model_path = Path(tmpdir.name) / (src.stem + ".glb")
            model_path.parent.mkdir(parents=True, exist_ok=True)
            export_glb(src, model_path, args.quality)
        data = model_path.read_bytes()
        fmt = detect_format(data, model_path.name)
        name = src.stem + "." + fmt
        overrides = {
            "title": args.title,
            "view": args.view,
            "height": args.height,
            "up": args.up,
            "background": args.background,
            "edges": False if args.no_edges else None,
            "ground": False if args.no_ground else None,
            "autoRotate": True if args.spin else None,
        }
        link = None
        if args.link:
            link = Path(os.path.relpath(model_path.resolve(), out.resolve().parent)).as_posix()
        page = pack(template, data=data, fmt=fmt, name=name, link=link, overrides=overrides)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
        if tmpdir:
            tmpdir.cleanup()
    except (OSError, PackError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    mode = f"linked -> {link}" if link else f"embedded {len(data) / 1024:.0f} KiB {fmt.upper()}"
    print(f"wrote {out} ({len(page) / 1024:.0f} KiB, {mode})")
    if not link and len(data) > EMBED_WARN_BYTES:
        print("warning: large embedded model; consider --link or a coarser --quality", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
