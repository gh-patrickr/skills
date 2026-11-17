"""Design tokens: geometry, type scale, colour palettes.

Every number a slide uses comes from here, so a deck cannot drift. If you are
tempted to hard-code an inch value or a hex code anywhere else, add it here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Tuple

# --------------------------------------------------------------------------- #
# page geometry (inches)
# --------------------------------------------------------------------------- #
PAGE_W, PAGE_H = 13.333, 7.5

MARGIN_L = 0.62
MARGIN_R = 0.62
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R          # 12.093

GUTTER = 0.18
COL_W = (CONTENT_W - 11 * GUTTER) / 12.0          # 0.8428
COL_PITCH = COL_W + GUTTER

TITLE_TOP = 0.52          # action title box top
TITLE_H = 0.98            # room for two 25pt lines
SUBTITLE_TOP = 1.46
SUBTITLE_H = 0.40
BODY_TOP = 1.94
BODY_BOTTOM = 6.50
FOOTER_Y = 6.86
RULE_Y = 6.79

EYEBROW_TOP = 0.36
EYEBROW_H = 0.20

# --------------------------------------------------------------------------- #
# type scale (pt)
# --------------------------------------------------------------------------- #
SIZE = {
    "cover_title": 38.0,
    "cover_sub": 15.0,
    "divider_num": 80.0,
    "divider_title": 32.0,
    "title": 26.0,
    "title_sm": 22.0,
    "subtitle": 12.5,
    "h2": 14.0,
    "h3": 11.5,
    "body": 12.0,
    "body_sm": 11.0,
    "small": 9.5,
    "kicker": 8.5,
    "micro": 8.0,
    "kpi": 34.0,
    "kpi_label": 9.0,
    "table": 10.5,
    "table_head": 8.5,
    "chart_label": 9.5,
    "quote": 22.0,
}

# line spacing multipliers
LS = {"tight": 0.95, "snug": 1.06, "body": 1.22, "loose": 1.35}

TITLE_MAX_LINES = 2
BODY_MAX_LINES = 26
TITLE_SOFT_CHARS = 95

# --------------------------------------------------------------------------- #
# colour
# --------------------------------------------------------------------------- #


def _norm(h: str) -> str:
    h = h.strip().lstrip("#")
    return h.upper()


def hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = _norm(h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: Iterable[int]) -> str:
    r, g, b = (max(0, min(255, int(round(v)))) for v in rgb)
    return f"{r:02X}{g:02X}{b:02X}"


def mix(a: str, b: str, pct: float) -> str:
    """Mix colour `a` with `b`; pct=0 -> a, pct=1 -> b (sRGB)."""
    ar, ag, ab = hex_to_rgb(a)
    br, bg, bb = hex_to_rgb(b)
    return rgb_to_hex((ar + (br - ar) * pct, ag + (bg - ag) * pct, ab + (bb - ab) * pct))


def tint(h: str, pct: float) -> str:
    """Lighten towards white. pct is the amount of white added."""
    return mix(h, "FFFFFF", pct)


def shade(h: str, pct: float) -> str:
    """Darken towards black."""
    return mix(h, "000000", pct)


def _lin(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(h: str) -> float:
    r, g, b = hex_to_rgb(h)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# --------------------------------------------------------------------------- #
# palettes
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Palette:
    name: str
    ink: str            # primary text / dark backgrounds
    ink2: str           # secondary text
    muted: str          # captions, axis labels
    rule: str           # hairlines
    accent: str         # the one highlight colour
    accent_ink: str     # text colour on accent fills
    series: Tuple[str, ...]
    positive: str
    negative: str
    bg: str
    tint: str           # light panel fill
    tint2: str          # slightly lighter panel

    def role(self, name: str) -> str:
        return getattr(self, name)


PALETTES: Dict[str, Palette] = {
    "navy": Palette(
        name="navy",
        ink="16202B",
        ink2="3B4757",
        muted="78859A",
        rule="D7DEE7",
        accent="B8873C",
        accent_ink="FFFFFF",
        series=("1B3A5B", "B8873C", "6E8FA8", "9AA6B3", "45617C", "D9C6A5"),
        positive="2F7A5F",
        negative="A8442C",
        bg="FFFFFF",
        tint="F3F5F8",
        tint2="E8EDF3",
    ),
    "graphite": Palette(
        name="graphite",
        ink="1D2126",
        ink2="414A55",
        muted="7C8794",
        rule="D9DDE2",
        accent="0E7C6B",
        accent_ink="FFFFFF",
        series=("24333D", "0E7C6B", "7FA8A2", "A9B4BD", "3F5C63", "CBB89B"),
        positive="1E7A4F",
        negative="B03A2E",
        bg="FFFFFF",
        tint="F4F5F6",
        tint2="E9ECEE",
    ),
    "burgundy": Palette(
        name="burgundy",
        ink="1A1517",
        ink2="463C40",
        muted="8A7B80",
        rule="E0D8DA",
        accent="8C2F39",
        accent_ink="FFFFFF",
        series=("2A1F22", "8C2F39", "B98A8F", "C9BDBF", "5E4A4F", "D8C3A5"),
        positive="2E6B57",
        negative="8C2F39",
        bg="FFFFFF",
        tint="F6F3F3",
        tint2="ECE5E6",
    ),
}

DEFAULT_PALETTE = "navy"

# font families that are safe on macOS *and* Windows and that deckkit can measure
FONT_FAMILIES = (
    "Arial",
    "Arial Narrow",
    "Georgia",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Times New Roman",
)


@dataclass
class Theme:
    palette: Palette = field(default_factory=lambda: PALETTES[DEFAULT_PALETTE])
    font: str = "Arial"
    font_display: str = "Arial"
    font_mono: str = "Courier New"
    dark_cover: bool = True
    title_tracking: float = -0.35       # pt of letter-spacing on action titles
    body_tracking: float = 0.0

    # ---- convenience ----------------------------------------------------- #
    @property
    def ink(self) -> str:
        return self.palette.ink

    @property
    def accent(self) -> str:
        return self.palette.accent

    def col_x(self, col: int, span: int = 1) -> Tuple[float, float]:
        """Zero-based column -> (x, width) in inches."""
        x = MARGIN_L + col * COL_PITCH
        w = span * COL_W + (span - 1) * GUTTER
        return x, w

    def series_color(self, i: int) -> str:
        s = self.palette.series
        return s[i % len(s)]


def get_theme(name: str = DEFAULT_PALETTE, font: str = "Arial") -> Theme:
    if name not in PALETTES:
        raise KeyError(f"unknown palette {name!r}; choose from {sorted(PALETTES)}")
    if font not in FONT_FAMILIES:
        raise KeyError(f"unknown font {font!r}; choose from {list(FONT_FAMILIES)}")
    return Theme(palette=PALETTES[name], font=font, font_display=font)
