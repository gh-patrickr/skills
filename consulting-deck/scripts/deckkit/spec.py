"""Spec loading, validation and deck assembly."""
from __future__ import annotations

import os
import re
import time
import zipfile
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml
from pptx import Presentation
from pptx.util import Inches

from . import qa as qa_mod
from .layouts import LAYOUTS, Ctx, DIAGRAM_KINDS
from .theme import PALETTES, PAGE_H, PAGE_W, get_theme

ALLOWED_LAYOUTS = tuple(LAYOUTS)
ALLOWED_BLOCKS = ("text", "bullets", "table", "image", "chart") + tuple(sorted(DIAGRAM_KINDS))
CHART_KINDS = ("column", "bar", "stacked", "stacked100", "line", "area", "combo",
               "scatter", "waterfall")


class SpecError(Exception):
    pass


# --------------------------------------------------------------------------- #
# loading
# --------------------------------------------------------------------------- #
def load(path: str) -> dict:
    if not os.path.exists(path):
        raise SpecError(f"spec not found: {path}")
    with open(path, "r", encoding="utf-8") as fh:
        try:
            data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            raise SpecError(f"{path}: invalid YAML\n{exc}") from exc
    if not isinstance(data, dict):
        raise SpecError(f"{path}: top level must be a mapping with 'meta' and 'slides'")
    if "slides" not in data or not isinstance(data["slides"], list):
        raise SpecError(f"{path}: missing 'slides' list")
    return data


def _walk_slots(slides: List[dict]):
    for i, s in enumerate(slides):
        slots = s.get("slots") or ({"full": s["block"]} if s.get("block") else {})
        for name, b in slots.items():
            yield i, s, name, b
        if s.get("banner_block"):
            yield i, s, "banner", s["banner_block"]


def validate(spec: dict) -> List[str]:
    errs: List[str] = []
    meta = spec.get("meta") or {}
    if meta.get("palette") and meta["palette"] not in PALETTES:
        errs.append(f"meta.palette: {meta['palette']!r} not in {sorted(PALETTES)}")
    slides = spec.get("slides") or []
    if not slides:
        errs.append("spec has no slides")
    for i, s in enumerate(slides):
        where = f"slides[{i}]"
        if not isinstance(s, dict):
            errs.append(f"{where}: must be a mapping")
            continue
        layout = s.get("layout", "content")
        if layout not in ALLOWED_LAYOUTS:
            errs.append(f"{where}.layout: {layout!r} not in {list(ALLOWED_LAYOUTS)}")
        if layout in ("content", "summary", "agenda") and not s.get("title"):
            errs.append(f"{where}.title: required for layout {layout}")
        for bad in ("slots", "block"):
            pass
        slots = s.get("slots") or ({**({"full": s["block"]})} if s.get("block") else {})
        if layout == "content" and not slots:
            errs.append(f"{where}: content slide needs 'slots' or 'block'")
        for name, b in slots.items():
            if not isinstance(b, dict):
                errs.append(f"{where}.slots.{name}: must be a mapping")
                continue
            kind = b.get("kind") or b.get("block")
            if kind not in ALLOWED_BLOCKS:
                errs.append(f"{where}.slots.{name}.kind: {kind!r} not in {list(ALLOWED_BLOCKS)}")
            elif kind == "chart" and b.get("chart") not in CHART_KINDS:
                errs.append(f"{where}.slots.{name}.chart: {b.get('chart')!r} not in {list(CHART_KINDS)}")
            elif kind == "table":
                if not b.get("columns") or not b.get("rows"):
                    errs.append(f"{where}.slots.{name}: table needs 'columns' and 'rows'")
        if s.get("source") and spec.get("sources") and s["source"] in spec["sources"]:
            pass
    return errs


# --------------------------------------------------------------------------- #
# theme patching (so new text boxes the user adds later inherit the design)
# --------------------------------------------------------------------------- #
def _patch_package(path: str, font: str, palette_hexes: Dict[str, str]) -> None:
    tmp = path + ".tmp"
    with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "ppt/theme/theme1.xml":
                xml = data.decode("utf-8")
                xml = re.sub(r'(<a:majorFont>\s*<a:latin typeface=")[^"]*(")',
                             rf'\g<1>{font}\g<2>', xml, count=1)
                xml = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*(")',
                             rf'\g<1>{font}\g<2>', xml, count=1)
                for slot, colour in palette_hexes.items():
                    xml = re.sub(rf'(<a:{slot}>\s*<a:srgbClr val=")[0-9A-Fa-f]{{6}}(")',
                                 rf'\g<1>{colour}\g<2>', xml, count=1)
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# build
# --------------------------------------------------------------------------- #
@dataclass
class BuildResult:
    path: str
    slides: int
    seconds: float
    problems: List[dict] = field(default_factory=list)
    log: List[dict] = field(default_factory=list)
    size_kb: float = 0.0
    score: int = 100

    @property
    def errors(self) -> List[dict]:
        return [p for p in self.problems if p["level"] == "error"]

    @property
    def warnings(self) -> List[dict]:
        return [p for p in self.problems if p["level"] == "warn"]

    def ok(self) -> bool:
        return not self.errors


def build(spec: dict, out_path: str, *, qa: bool = True) -> BuildResult:
    t0 = time.time()
    errs = validate(spec)
    if errs:
        raise SpecError("spec is invalid:\n  - " + "\n  - ".join(errs))

    meta = spec.get("meta") or {}
    theme = get_theme(meta.get("palette", "navy"), meta.get("font", "Arial"))
    prs = Presentation()
    prs.slide_width = Inches(PAGE_W)
    prs.slide_height = Inches(PAGE_H)
    blank = _blank_layout(prs)

    ctx = Ctx(theme=theme, meta=meta, sources=spec.get("sources") or {})

    # pass 1: section inventory (needed by agenda slides that appear early)
    for i, s in enumerate(spec["slides"], start=1):
        if s.get("layout") == "section":
            ctx.sections.append({
                "number": s.get("number") or f"{len(ctx.sections) + 1:02d}",
                "title": s.get("title", ""),
                "page": i,
            })

    for i, s in enumerate(spec["slides"], start=1):
        ctx.current = i
        slide = prs.slides.add_slide(blank)
        layout = s.get("layout", "content")
        try:
            LAYOUTS[layout](slide, ctx, s, i)
        except Exception as exc:  # surface authoring mistakes with the slide number
            raise SpecError(f"slide {i} ({layout}) failed: {type(exc).__name__}: {exc}") from exc

    _core_props(prs, meta)
    prs.save(out_path)
    _patch_package(out_path, theme.font, {
        "dk1": theme.palette.ink, "dk2": theme.palette.ink2,
        "accent1": theme.palette.accent, "accent2": theme.palette.series[0],
        "accent3": theme.palette.series[1], "accent4": theme.palette.series[2],
        "accent5": theme.palette.series[3], "accent6": theme.palette.series[4],
    })

    problems: List[dict] = []
    if qa:
        problems = ctx.problems + qa_mod.check(spec, ctx, prs)
    score = qa_mod.score(problems, len(spec["slides"]))
    return BuildResult(path=out_path, slides=len(spec["slides"]), seconds=time.time() - t0,
                       problems=problems, log=ctx.log,
                       size_kb=os.path.getsize(out_path) / 1024.0, score=score)


def _blank_layout(prs):
    for layout in prs.slide_layouts:
        if layout.name.lower() == "blank":
            return layout
    return prs.slide_layouts[6]


def _core_props(prs, meta: dict) -> None:
    cp = prs.core_properties
    cp.title = meta.get("title", "")
    cp.subject = meta.get("subtitle", "")
    cp.author = meta.get("author", "")
    cp.category = meta.get("client", "")
    cp.comments = meta.get("confidentiality", "")
    cp.last_modified_by = meta.get("author", "")
