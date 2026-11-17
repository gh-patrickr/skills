"""Deterministic text measurement and wrapping.

PowerPoint will not tell us whether text fits, so we measure it ourselves with
the same font files the renderer uses. Everything here works in *points*
(1/72 inch); convert to inches only at the edge.

The measurement scale factor (16x) keeps sub-point precision for the
half-point sizes the design system uses.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Sequence, Tuple

from PIL import ImageFont

SCALE = 16
LINE_FACTOR = 1.20          # single-spaced line height as a multiple of font size
WIDTH_SAFETY = 0.985        # shrink available width slightly: wrapping must be conservative
HEIGHT_SAFETY = 1.04


# --------------------------------------------------------------------------- #
# font resolution
# --------------------------------------------------------------------------- #
_MAC = "/System/Library/Fonts/Supplemental"
_FAMILY_FILES = {
    "Arial": ("Arial", "Arial Bold", "Arial Italic", "Arial Bold Italic"),
    "Arial Narrow": ("Arial Narrow", "Arial Narrow Bold", "Arial Narrow Italic", "Arial Narrow Bold Italic"),
    "Georgia": ("Georgia", "Georgia Bold", "Georgia Italic", "Georgia Bold Italic"),
    "Verdana": ("Verdana", "Verdana Bold", "Verdana Italic", "Verdana Bold Italic"),
    "Tahoma": ("Tahoma", "Tahoma Bold", "Tahoma", "Tahoma Bold"),
    "Trebuchet MS": ("Trebuchet MS", "Trebuchet MS Bold", "Trebuchet MS Italic", "Trebuchet MS Bold Italic"),
    "Times New Roman": ("Times New Roman", "Times New Roman Bold", "Times New Roman Italic", "Times New Roman Bold Italic"),
    # metric-compatible stand-ins used by LibreOffice
    "Calibri": ("Arial", "Arial Bold", "Arial Italic", "Arial Bold Italic"),
    "Helvetica Neue": ("Arial", "Arial Bold", "Arial Italic", "Arial Bold Italic"),
}

_missing_fonts: set = set()


@lru_cache(maxsize=64)
def resolve_font(family: str, bold: bool = False, italic: bool = False) -> str:
    """Return an absolute .ttf path for a family/style.

    Falls back to Arial (documented behaviour) and records the substitution so
    the build can warn about it.
    """
    key = (1 if bold else 0) + (2 if italic else 0)
    bases = _FAMILY_FILES.get(family)
    if bases is None:
        _missing_fonts.add(family)
        bases = _FAMILY_FILES["Arial"]
    name = bases[key]
    path = os.path.join(_MAC, name + ".ttf")
    if not os.path.exists(path):
        _missing_fonts.add(family)
        path = os.path.join(_MAC, "Arial.ttf")
    return path


def missing_fonts() -> Tuple[str, ...]:
    return tuple(sorted(_missing_fonts))


@lru_cache(maxsize=512)
def _font(path: str, size_pt: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(1, int(round(size_pt * SCALE))))


# --------------------------------------------------------------------------- #
# measurement
# --------------------------------------------------------------------------- #
def text_width(text: str, size_pt: float, family: str = "Arial", bold: bool = False,
               italic: bool = False, tracking: float = 0.0) -> float:
    """Width of `text` in points, including letter-spacing."""
    if not text:
        return 0.0
    f = _font(resolve_font(family, bold, italic), size_pt)
    return f.getlength(text) / SCALE + tracking * len(text)


def _break_long_word(word: str, width_pt: float, size_pt: float, family: str,
                     bold: bool, italic: bool, tracking: float) -> List[str]:
    out, cur = [], ""
    for ch in word:
        if cur and text_width(cur + ch, size_pt, family, bold, italic, tracking) > width_pt:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        out.append(cur)
    return out


def wrap_text(text: str, width_pt: float, size_pt: float, family: str = "Arial",
              bold: bool = False, italic: bool = False, tracking: float = 0.0) -> List[str]:
    """Greedy word wrap with explicit-newline support. Honours WIDTH_SAFETY."""
    avail = width_pt * WIDTH_SAFETY
    lines: List[str] = []
    for para in str(text).split("\n"):
        words = para.split(" ")
        cur = ""
        for w in words:
            probe = w if not cur else cur + " " + w
            if text_width(probe, size_pt, family, bold, italic, tracking) <= avail or not cur:
                if not cur and text_width(w, size_pt, family, bold, italic, tracking) > avail:
                    parts = _break_long_word(w, avail, size_pt, family, bold, italic, tracking)
                    lines.extend(parts[:-1])
                    cur = parts[-1]
                else:
                    cur = probe
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def lines_height(n_lines: int, size_pt: float, line_spacing: float = 1.22) -> float:
    """Height in points of `n_lines` lines."""
    return n_lines * size_pt * LINE_FACTOR * line_spacing


@dataclass
class Fit:
    size: float
    lines: List[str]
    width_pt: float
    height_pt: float
    fits: bool

    @property
    def n_lines(self) -> int:
        return len(self.lines)


def fit(text: str, width_in: float, height_in: float, size_max: float, size_min: float,
        family: str = "Arial", bold: bool = False, italic: bool = False,
        line_spacing: float = 1.22, tracking: float = 0.0, step: float = 0.5) -> Fit:
    """Largest size in [size_min, size_max] at which `text` fits the box."""
    w = width_in * 72.0
    h = height_in * 72.0
    s = size_max
    while s >= size_min - 1e-6:
        lines = wrap_text(text, w, s, family, bold, italic, tracking)
        hh = lines_height(len(lines), s, line_spacing) * HEIGHT_SAFETY
        widest = max((text_width(l, s, family, bold, italic, tracking) for l in lines), default=0.0)
        if hh <= h and widest <= w:
            return Fit(round(s, 2), lines, widest, hh, True)
        s -= step
    lines = wrap_text(text, w, size_min, family, bold, italic, tracking)
    return Fit(size_min, lines, max((text_width(l, size_min, family, bold, italic, tracking)
                                     for l in lines), default=0.0),
               lines_height(len(lines), size_min, line_spacing) * HEIGHT_SAFETY, False)


def needed_height(text: str, width_in: float, size_pt: float, family: str = "Arial",
                  bold: bool = False, line_spacing: float = 1.22, tracking: float = 0.0) -> float:
    """Inches required to render `text` at `size_pt` inside `width_in`."""
    lines = wrap_text(text, width_in * 72.0, size_pt, family, bold, False, tracking)
    return lines_height(len(lines), size_pt, line_spacing) * HEIGHT_SAFETY / 72.0


def one_line(text: str, size_pt: float, family: str = "Arial", bold: bool = False,
             tracking: float = 0.0) -> float:
    """Width in inches of `text` on a single line."""
    return text_width(text, size_pt, family, bold, False, tracking) / 72.0
