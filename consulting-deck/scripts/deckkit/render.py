"""Render a deck to images and build a contact sheet.

Uses the LibreOffice Kit CLI (`dsoffice`) that ships with this environment.
Every subprocess call is absolute and time-bounded; output directories must not
exist yet (the CLI creates them).
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys
from typing import List, Optional, Sequence


def _candidates() -> List[List[str]]:
    env = os.environ.get("DECKKIT_DSOFFICE")
    out: List[List[str]] = []
    if env:
        out.append([env] if env.endswith("dsoffice") and os.access(env, os.X_OK)
                   else [sys.executable.replace("python", "node"), env])
    exe = shutil.which("dsoffice")
    if exe:
        out.append([exe])
    patterns = [
        os.path.expanduser("~/.npm/_npx/*/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js"),
        "/usr/local/lib/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js",
        "/opt/homebrew/lib/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js",
        os.path.expanduser("~/.nvm/versions/node/*/lib/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js"),
    ]
    node = os.environ.get("DECKKIT_NODE") or shutil.which("node")
    for pat in patterns:
        for cli in sorted(glob.glob(pat)):
            if node:
                out.append([node, cli])
    local = os.path.join(os.getcwd(), "node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js")
    if node and os.path.exists(local):
        out.append([node, local])
    return out


def find_cli() -> Optional[List[str]]:
    for cmd in _candidates():
        if os.path.exists(cmd[-1]):
            return cmd
    return None


def available() -> bool:
    return find_cli() is not None


def render(pptx_path: str, out_dir: str, pages: Optional[Sequence[int]] = None,
           timeout: int = 240) -> List[str]:
    """Render slides to PNG. Returns ordered image paths."""
    cmd0 = find_cli()
    if not cmd0:
        raise RuntimeError(
            "LibreOffice Kit CLI not found. Set DECKKIT_DSOFFICE to the path of "
            "libreoffice-kit/lib/cli.js (or its dsoffice binary), or install "
            "@deepseek-ai/libreoffice-kit with its platform engine.")
    pptx_path = os.path.abspath(pptx_path)
    out_dir = os.path.abspath(out_dir)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(os.path.dirname(out_dir), exist_ok=True)
    cmd = cmd0 + ["render", "--input", pptx_path, "--output-dir", out_dir]
    if pages:
        cmd += ["--pages", ",".join(str(p) for p in pages)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    manifest = os.path.join(out_dir, "manifest.json")
    if proc.returncode != 0 or not os.path.exists(manifest):
        raise RuntimeError(f"render failed ({proc.returncode}): {(proc.stderr or proc.stdout)[:800]}")
    with open(manifest, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return [img["path"] for img in data.get("images", [])]


def montage(png_paths: Sequence[str], out_path: str, cols: int = 3,
            cell_w: int = 620, pad: int = 14, label: bool = True) -> str:
    """Grid contact sheet, 1 image per slide, with page numbers. One glance, one image."""
    from PIL import Image, ImageDraw, ImageFont

    from .textfit import resolve_font

    ims = [Image.open(p).convert("RGB") for p in png_paths]
    if not ims:
        raise ValueError("no images to montage")
    cell_h = int(cell_w * ims[0].height / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    label_h = 22 if label else 0
    W = cols * cell_w + (cols + 1) * pad
    H = rows * (cell_h + label_h) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (238, 240, 243))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(resolve_font("Arial", True), 15)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c * (cell_w + pad)
        y = pad + r * (cell_h + label_h + pad)
        if label:
            draw.text((x + 2, y), f"{i + 1}", font=font, fill=(60, 70, 85))
            draw.rectangle([x, y + 18, x + cell_w, y + 18 + cell_h], outline=(180, 186, 194))
            sheet.paste(im.resize((cell_w, cell_h), Image.LANCZOS), (x, y + 18))
        else:
            sheet.paste(im.resize((cell_w, cell_h), Image.LANCZOS), (x, y))
    sheet.save(out_path)
    return out_path


def preview(pptx_path: str, out_dir: str, *, cols: int = 3, cell_w: int = 620,
            pages: Optional[Sequence[int]] = None) -> dict:
    """Render + contact sheet + per-slide ink statistics."""
    pngs = render(pptx_path, out_dir, pages=pages)
    sheet = montage(pngs, os.path.join(os.path.dirname(out_dir), "contact-sheet.png"),
                    cols=cols, cell_w=cell_w)
    return {"pages": pngs, "sheet": sheet, "stats": ink_stats(pngs)}


def ink_stats(png_paths: Sequence[str]) -> List[dict]:
    """Cheap signals: empty pages, text bleeding into the outer margin."""
    from PIL import Image

    out = []
    for i, p in enumerate(png_paths, start=1):
        with Image.open(p) as im:
            g = im.convert("L").resize((480, 270), Image.BILINEAR)
            px = g.load()
            dark = sum(1 for y in range(270) for x in range(480) if px[x, y] < 245)
            edge = 0
            band = 10
            for y in range(270):
                for x in list(range(band)) + list(range(480 - band, 480)):
                    if px[x, y] < 235:
                        edge += 1
            for x in range(480):
                for y in list(range(band)) + list(range(270 - band, 270)):
                    if px[x, y] < 235:
                        edge += 1
        out.append({"page": i, "ink": round(dark / (480 * 270), 4), "edge_ink": edge})
    return out
