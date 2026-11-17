"""Consulting-grade diagram blocks for deckkit.

``build(slide, box, spec, theme)`` draws exactly one diagram inside ``box``
(inches). Geometry is derived from the box and the design tokens; every colour
comes from ``theme.palette`` (mixed with ``palette.bg`` for tints). Text is
measured with :mod:`deckkit.textfit` and shrunk/clipped, so it never spills out
of a shape. Item counts outside the documented range are clamped.

Spec keys by ``kind``::

    kpi       items[{value,label,delta?,tone?}], columns?
    steps     items[{title,text}], numbered?
    timeline  phases[{label,title,text,tone?}], milestones[{at,text}]?
    cards     items[{title,text,bullets?}], emphasis?
    matrix    x_axis[2], y_axis[2], quadrants[4]?, points[{label,x,y,highlight?}]
    flow      items[{title,text}]
    funnel    items[{label,value,text?}]
    org       root{title,subtitle?}, children[{title,subtitle?,children?}]
    quote     text, attribution, role?
    callout   text, title?, tone("accent"|"neutral"|"warn")
    banner    text, label?
"""
from __future__ import annotations

import re
from dataclasses import replace

from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches

from . import textfit
from .prims import (Box, bullets, no_line, no_shadow, rect, rotate, rule, shape,
                    solid, text, vrule)
from .theme import LS, SIZE, mix

#: shared geometry and type scale (pt values absent from theme.SIZE come from the spec)
PAD, GUT, RAD, RULE_PT = 0.14, 0.18, 0.06, 0.75
_rect = rect
_vrule = vrule
_rule = rule
_shape = shape
T_STEP = 14.5
T_TITLE = 13.0
T_BODY = 10.5
T_TEXT = SIZE["body_sm"]    # 10.5
T_CAP = SIZE["kicker"] + 0.5  # 9.0
T_KPI = SIZE["kpi"]         # 34
T_QUOTE = SIZE["quote"]     # 22
T_BANNER = 12.0

_NUM = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")


# --------------------------------------------------------------------------- #
# measurement / drawing helpers
# --------------------------------------------------------------------------- #
def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _height(lines, size, ls=LS["body"]):
    return textfit.lines_height(len(lines), size, ls) * textfit.HEIGHT_SAFETY / 72.0


def _shorten(line, w, size, theme, bold=False, tracking=0.0):
    limit = w * 72.0 * textfit.WIDTH_SAFETY
    cut = line
    while cut and textfit.text_width(cut + "\u2026", size, theme.font, bold, False,
                                     tracking) > limit:
        cut = cut[:-1].rstrip()
    return (cut + "\u2026") if cut else "\u2026"


def _fit(txt, w, h, smax, smin, theme, bold=False, ls=LS["body"], tracking=0.0):
    """Largest size in [smin, smax] that fits; clip to the box if even smin fails."""
    if w <= 0.06 or h <= 0.03:
        return smin, [""], 0.0
    f = textfit.fit(str(txt), w, h, smax, smin, theme.font, bold, False, ls, tracking)
    size, lines = f.size, f.lines
    max_lines = max(1, int(h * 72.0 / (size * textfit.LINE_FACTOR * ls * textfit.HEIGHT_SAFETY)))
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _shorten(lines[-1], w, size, theme, bold, tracking)
    return size, lines, min(h, _height(lines, size, ls))


def _uniform(texts, w, h, smax, smin, theme, bold=False, ls=LS["body"], tracking=0.0):
    """One common size for a set of texts, with wrapped lines for each."""
    if not texts:
        return smax, [], 0.0
    size = min(_fit(t, w, h, smax, smin, theme, bold, ls, tracking)[0] for t in texts)
    max_lines = max(1, int(h * 72.0 / (size * textfit.LINE_FACTOR * ls * textfit.HEIGHT_SAFETY)))
    out = []
    for t in texts:
        lines = textfit.wrap_text(str(t), w * 72.0, size, theme.font, bold, False, tracking)
        if len(lines) > max_lines:
            lines = lines[:max_lines]
            lines[-1] = _shorten(lines[-1], w, size, theme, bold, tracking)
        out.append(lines)
    return size, out, max((_height(lines, size, ls) for lines in out), default=0.0)


def _draw(slide, box, lines, size, colour, theme, bold=False, align="l", anchor="t",
          ls=LS["body"], caps=False, tracking=None):
    text(slide, box, lines, size, colour, theme, bold=bold, align=align, anchor=anchor,
         line_spacing=ls, caps=caps, tracking=tracking, font=theme.font)


def _items(spec, key, lo, hi, kind):
    items = spec.get(key)
    if not isinstance(items, (list, tuple)) or len(items) < lo:
        raise ValueError(f"{kind}: '{key}' needs {lo}-{hi} entries")
    return list(items[:hi])


def _tone(theme, name, fallback="accent"):
    p = theme.palette
    return {"accent": p.accent, "positive": p.positive, "negative": p.negative,
            "warn": p.negative, "neutral": p.ink2, "muted": p.muted}.get(
                name, getattr(p, fallback))


def _soft(theme, colour, pct=0.90):
    return mix(colour, theme.palette.bg, pct)


def _on_fill(theme):
    """Theme variant whose bullet glyphs are readable on an accent fill."""
    p = theme.palette
    return replace(theme, palette=replace(p, accent=p.accent_ink))


def _pill(slide, x, y, label, colour, theme, max_w):
    size = T_CAP
    while size > 7.0 and textfit.one_line(label, size, theme.font, True, 0.2) > max_w - 0.24:
        size -= 0.5
    w = min(max_w, textfit.one_line(label, size, theme.font, True, 0.2) + 0.24)
    h = 0.24
    _shape(slide, Box(x, y, w, h), MSO_SHAPE.ROUNDED_RECTANGLE,
          fill=_soft(theme, colour, 0.90), radius=RAD)
    _draw(slide, Box(x + 0.04, y, w - 0.08, h), [label], size, colour, theme,
          bold=True, align="c", anchor="m", tracking=0.2)
    return w


def _bullets_h(items, w, size, theme):
    total = 0.0
    for i, it in enumerate(items):
        s = it if isinstance(it, str) else f"{it.get('lead', '')}  {it.get('text', '')}"
        lines = textfit.wrap_text(s, (w - 0.16) * 72.0, size, theme.font,
                                  False, False, 0.0)
        total += _height(lines, size, 1.20) + (4.0 / 72.0 if i < len(items) - 1 else 0.0)
    return total


def _bullets_size(items, w, h, theme):
    for size in (T_BODY, 9.0, 8.5, 8.0):
        if _bullets_h(items, w, size, theme) <= h:
            return size
    return 8.0


def _bullets_take(items, w, h, size, theme):
    out, used = [], 0.0
    for it in items:
        hh = _bullets_h([it], w, size, theme)
        if out and used + hh > h:
            break
        out.append(it)
        used += hh + 4.0 / 72.0
    return out


def _hit(a, b, m=0.03):
    return not (a.r + m <= b.x or a.x >= b.r + m or a.b + m <= b.y or a.y >= b.b + m)


def _trap(slide, cx, top_w, bottom_w, y, h, fill):
    """Centred trapezoid (wide top, narrow bottom) with no outline."""
    ff = slide.shapes.build_freeform(Inches(cx - top_w / 2), Inches(y), scale=1.0)
    ff.add_line_segments([
        (Inches(cx + top_w / 2), Inches(y)),
        (Inches(cx + bottom_w / 2), Inches(y + h)),
        (Inches(cx - bottom_w / 2), Inches(y + h)),
    ], close=True)
    shp = ff.convert_to_shape()
    no_shadow(shp)
    solid(shp, fill)
    no_line(shp)
    return shp


# --------------------------------------------------------------------------- #
# 1. kpi
# --------------------------------------------------------------------------- #
def _kpi(slide, box, spec, theme):
    p = theme.palette
    items = _items(spec, "items", 2, 4, "kpi")
    n = len(items)
    cols = max(1, min(n, int(spec.get("columns") or n)))
    rows = (n + cols - 1) // cols
    cw = (box.w - GUT * (cols - 1)) / cols
    row_h = (box.h - 0.26 * (rows - 1)) / rows
    vsize = min(_fit(str(it.get("value", "")), cw, 0.66, T_KPI, 24.0, theme,
                     bold=True, ls=LS["tight"], tracking=-0.5)[0] for it in items)
    vh = max(_height([str(it.get("value", ""))], vsize, LS["tight"]) for it in items)
    lsize, llines, _ = _uniform([str(it.get("label", "")).upper() for it in items],
                                cw, 0.50, SIZE["kpi_label"], 8.0, theme,
                                ls=1.18, tracking=0.5)
    for r in range(rows):
        inds = list(range(r * cols, min(n, (r + 1) * cols)))
        lh = max(_height(llines[i], lsize, 1.18) for i in inds)
        has_pill = any(items[i].get("delta") for i in inds)
        group = 0.04 + 0.26 + vh + 0.07 + lh + (0.14 + 0.24 if has_pill else 0.0)
        yy = box.y + r * (row_h + 0.26) + max(0.0, (row_h - group) * 0.46)
        for i in inds:
            it = items[i]
            x = box.x + (i % cols) * (cw + GUT)
            tone = it.get("tone")
            bar = p.positive if tone == "positive" else p.negative if tone == "negative" else p.accent
            _rect(slide, Box(x, yy, cw, 0.04), bar)
            _draw(slide, Box(x, yy + 0.30, cw, vh), [str(it.get("value", ""))], vsize,
                  p.ink, theme, bold=True, ls=LS["tight"], tracking=-0.5)
            _draw(slide, Box(x, yy + 0.30 + vh + 0.07, cw, lh), llines[i], lsize,
                  p.muted, theme, caps=True, ls=1.18, tracking=0.5)
            delta = it.get("delta")
            if delta:
                dcol = p.positive if tone == "positive" else p.negative if tone == "negative" else p.muted
                _pill(slide, x, yy + 0.30 + vh + 0.07 + lh + 0.14, str(delta), dcol,
                      theme, cw)


# --------------------------------------------------------------------------- #
# 2. steps
# --------------------------------------------------------------------------- #
def _steps(slide, box, spec, theme):
    p = theme.palette
    items = _items(spec, "items", 3, 5, "steps")
    numbered = bool(spec.get("numbered", True))
    n = len(items)
    gap = max(0.22, min(0.40, box.w * 0.028))
    cols = box.cols(n, gap)
    w = cols[0].w
    d = 0.52
    tsize, tlines, th = _uniform([it.get("title", "") for it in items], w, 0.72,
                                 T_STEP, 9.0, theme, bold=True, ls=1.15)
    body_cap = max(0.55, box.h - 1.80)
    bsize, blines, bh = _uniform([it.get("text", "") for it in items], w, body_cap,
                                 11.5, 8.5, theme, ls=1.24)
    assembly = 0.14 + d + 0.42 + th + 0.12 + bh
    top = box.y + max(0.0, (box.h - assembly) * 0.30)
    cy = top + 0.14 + d / 2
    if numbered:
        _rule(slide, cols[0].x + w / 2, cy, cols[-1].x + w / 2 - cols[0].x - w / 2,
             p.rule, RULE_PT)
    title_top = top + 0.14 + d + 0.42
    body_top = title_top + th + 0.12
    for i, col in enumerate(cols):
        cx = col.x + w / 2
        if numbered:
            _shape(slide, Box(cx - d / 2, cy - d / 2, d, d), MSO_SHAPE.OVAL,
                  fill=p.bg, outline=p.accent, weight=1.0)
            _draw(slide, Box(cx - d / 2, cy - d / 2, d, d), [str(i + 1)], 12.0,
                  p.accent, theme, bold=True, align="c", anchor="m")
        else:
            _shape(slide, Box(cx - 0.05, cy - 0.05, 0.10, 0.10), MSO_SHAPE.OVAL,
                  fill=p.accent)
        _draw(slide, Box(col.x, title_top, w, th), tlines[i], tsize, p.ink, theme,
              bold=True, ls=1.15)
        _draw(slide, Box(col.x, body_top, w, bh), blines[i], bsize, p.ink2, theme,
              ls=1.20)


# --------------------------------------------------------------------------- #
# 3. timeline
# --------------------------------------------------------------------------- #
def _timeline(slide, box, spec, theme):
    p = theme.palette
    phases = spec.get("phases")
    if not isinstance(phases, (list, tuple)) or not phases:
        raise ValueError("timeline: 'phases' needs at least one entry")
    phases = list(phases[:6])
    n = len(phases)
    cols = box.cols(n, GUT)
    iw = cols[0].w - 2 * PAD
    date_h = 0.18
    tsize, tlines, th = _uniform([ph.get("title", "") for ph in phases], iw, 0.70,
                                 T_TITLE + 1, 9.5, theme, bold=True, ls=1.15)

    # milestone labels below the axis decide how much room the axis needs
    ms, rows, spans = [], [[], []], [[], []]
    for m in (spec.get("milestones") or []):
        if isinstance(m, dict) and m.get("text"):
            at = _clamp(float(m.get("at", 0)), 0.0, 1.0)
            sz, ln, lh = _fit(str(m["text"]), 1.42, 0.46, T_CAP, 8.0, theme, ls=1.15)
            ms.append((at, ln, lh, sz))
    for at, ln, lh, sz in sorted(ms, key=lambda t: t[0]):
        cx = box.x + at * box.w
        x0 = _clamp(cx - 0.71, box.x, max(box.x, box.r - 1.42))
        r = 0 if all(x0 > e + 0.10 or x0 + 1.42 < s0 - 0.10 for s0, e in spans[0]) else 1
        rows[r].append((x0, ln, lh, cx, sz))
        spans[r].append((x0, x0 + 1.42))
    ms_h = 0.0
    if ms:
        h0 = max([r[2] for r in rows[0]] or [0.0])
        h1 = max([r[2] for r in rows[1]] or [0.0])
        ms_h = 0.16 + h0 + (0.06 + h1 if h1 else 0.0) + 0.14

    gates = [str(ph.get("gate") or "") for ph in phases]
    has_gate = any(gates)
    gate_h = 0.54 if has_gate else 0.0

    axis_y = box.y + box.h - max(0.46, ms_h)
    card_h = max(1.55, axis_y - 0.40 - box.y)
    fixed = 2 * PAD + date_h + 0.06 + th + 0.10
    body_cap = max(0.30, card_h - fixed - gate_h - 0.10)
    bsize, blines, bh = _uniform([ph.get("text", "") for ph in phases], iw,
                                 body_cap, T_BODY, 8.0, theme, ls=1.20)

    for i, col in enumerate(cols):
        ph = phases[i]
        rect(slide, Box(col.x, box.y, col.w, card_h), p.tint)
        rect(slide, Box(col.x, box.y, col.w, 0.045),
             _tone(theme, ph.get("tone"), "ink"))
        dx = col.x + PAD
        y = box.y + PAD
        _draw(slide, Box(dx, y, iw, date_h), [str(ph.get("label", "")).upper()],
              T_CAP, p.muted, theme, caps=True, tracking=0.8)
        y += date_h + 0.06
        _draw(slide, Box(dx, y, iw, th), tlines[i], tsize, p.ink, theme, bold=True, ls=1.15)
        y += th + 0.10
        space_b = box.y + card_h - PAD - gate_h
        avail = max(0.0, space_b - y)
        body_h = min(bh, avail)
        body_y = y + max(0.0, (avail - body_h) / 2)
        _draw(slide, Box(dx, body_y, iw, body_h), blines[i], bsize, p.ink2, theme,
              ls=1.20)
        if gates[i]:
            gy = box.y + card_h - PAD - gate_h + 0.06
            rule(slide, dx, gy, iw, p.rule, RULE_PT)
            _draw(slide, Box(dx, gy + 0.08, iw, 0.18), ["GATE"], T_CAP - 1.0,
                  _tone(theme, ph.get("tone")), theme, bold=True, caps=True, tracking=1.0)
            gs, gl, gh = _fit(gates[i], iw, gate_h - 0.30, T_CAP - 0.5, 7.5, theme, ls=1.15)
            _draw(slide, Box(dx, gy + 0.26, iw, gl and gh or 0.2), gl, gs, p.ink2, theme, ls=1.15)
        vrule(slide, col.x + col.w / 2, box.y + card_h, axis_y - box.y - card_h, p.rule, RULE_PT)

    rule(slide, box.x, axis_y, box.w, p.muted, RULE_PT)
    for col in cols:
        cx = col.x + col.w / 2
        shape(slide, Box(cx - 0.04, axis_y - 0.04, 0.08, 0.08), MSO_SHAPE.OVAL,
              fill=p.accent)
    label_y = axis_y + 0.16
    for labels in rows:
        for x0, ln, lh, cx, sz in labels:
            vrule(slide, cx, axis_y, 0.14, p.muted, RULE_PT)
            _draw(slide, Box(x0, label_y, 1.42, lh), ln, sz, p.muted, theme,
                  align="c", ls=1.15)
        label_y += max([it[2] for it in labels] or [0.0]) + 0.06


# --------------------------------------------------------------------------- #
# 4. cards
# --------------------------------------------------------------------------- #
def _cards(slide, box, spec, theme):
    p = theme.palette
    items = _items(spec, "items", 2, 5, "cards")
    n = len(items)
    em = spec.get("emphasis")
    em = int(em) if isinstance(em, int) and 0 <= em < n else None
    gap = max(0.14, min(0.24, box.w * 0.02))
    cols = box.cols(n, gap)
    w = cols[0].w - 2 * PAD
    tsize, tlines, th = _uniform([it.get("title", "") for it in items], w, 0.86,
                                 T_TITLE, 9.5, theme, bold=True, ls=1.15)
    has_b = any(it.get("bullets") for it in items)
    has_m = any(it.get("metric") for it in items)
    metric_h = 0.86 if has_m else 0.0
    bspace = 0.0
    for it in items:
        bl = it.get("bullets") or []
        if bl:
            bspace = max(bspace, _bullets_h(bl, w, T_BODY, theme))
    bspace = min(bspace + 0.18, 1.75) if has_b else 0.0
    body_cap = max(0.40, box.h - (0.045 + 0.18 + th + 0.10 + PAD + bspace))
    bsize, blines, bh = _uniform([it.get("text", "") for it in items], w, body_cap,
                                 T_BODY, 8.5, theme, ls=1.20)
    title_top0 = box.y + 0.045 + 0.18
    body_top0 = title_top0 + th + 0.10
    bullets_top0 = body_top0 + bh + (0.18 if has_b else 0.0)
    b_avail = box.b - PAD - bullets_top0 - metric_h
    bsize_all = T_BODY
    if has_b:
        for it in items:
            if it.get("bullets"):
                bsize_all = min(bsize_all, _bullets_size(it["bullets"], w, b_avail, theme))
        bspace = max([_bullets_h(_bullets_take(it.get("bullets") or [], w, b_avail,
                                               bsize_all, theme), w, bsize_all, theme)
                      for it in items if it.get("bullets")] or [0.0])
    group = (0.045 + 0.18 + th + 0.10 + bh + (0.18 + bspace if has_b else 0.0)
             + metric_h + PAD)
    dy = max(0.0, (box.h - group) * 0.32)
    title_top = title_top0 + dy
    body_top = body_top0 + dy
    for i, it in enumerate(items):
        col = cols[i]
        emph = i == em
        fg, fg2 = (p.accent_ink, p.accent_ink) if emph else (p.ink, p.ink2)
        _shape(slide, Box(col.x, box.y, col.w, box.h), MSO_SHAPE.RECTANGLE,
              fill=p.accent if emph else p.tint)
        _rect(slide, Box(col.x, box.y, col.w, 0.045), p.accent_ink if emph else p.rule)
        _draw(slide, Box(col.x + PAD, title_top, w, th), tlines[i], tsize, fg, theme,
              bold=True, ls=1.15)
        _draw(slide, Box(col.x + PAD, body_top, w, bh), blines[i], bsize, fg2, theme,
              ls=1.20)
        bl = it.get("bullets") or []
        if bl:
            vis = _bullets_take(bl, w, b_avail - dy, bsize_all, theme)
            if vis:
                bullets(slide, Box(col.x + PAD, body_top + bh + 0.18, w, b_avail - dy),
                        vis, bsize_all, fg2, _on_fill(theme) if emph else theme,
                        bullet="dot", indent=0.16, line_spacing=1.20, space_after=4.0)
        if it.get("metric"):
            my = box.b - metric_h + 0.02
            _rect(slide, Box(col.x + PAD, my, w, 0.015),
                 p.accent_ink if emph else p.rule)
            _draw(slide, Box(col.x + PAD, my + 0.10, w, 0.36),
                  [str(it["metric"])], 21.0,
                  p.accent_ink if emph else p.ink, theme, bold=True,
                  ls=LS["tight"], tracking=-0.3)
            if it.get("metric_label"):
                _draw(slide, Box(col.x + PAD, my + 0.50, w, 0.26),
                      [str(it["metric_label"])], T_CAP - 0.5, fg2, theme,
                      caps=True, tracking=0.5)


# --------------------------------------------------------------------------- #
# 5. matrix
# --------------------------------------------------------------------------- #
def _matrix(slide, box, spec, theme):
    p = theme.palette
    xa = list(spec.get("x_axis") or ["Low", "High"])
    ya = list(spec.get("y_axis") or ["Low", "High"])
    qs = list(spec.get("quadrants") or [])
    pts = [q for q in (spec.get("points") or []) if isinstance(q, dict) and q.get("label")]
    ph = max(0.9, box.h - 0.32)
    pw = max(1.6, min(box.w - 0.55, box.w * 0.70, ph * 1.95))
    px = box.x + (box.w - pw) / 2 + 0.10
    py = box.y + 0.02
    tints = (p.tint, p.tint2, p.tint2, p.tint)
    qboxes = [Box(px, py, pw / 2, ph / 2), Box(px + pw / 2, py, pw / 2, ph / 2),
              Box(px, py + ph / 2, pw / 2, ph / 2),
              Box(px + pw / 2, py + ph / 2, pw / 2, ph / 2)]
    for qb, tint in zip(qboxes, tints):
        _rect(slide, qb, tint)
    blocked = []
    for i, qb in enumerate(qboxes):
        if i < len(qs) and str(qs[i]).strip():
            qs_i = str(qs[i]).upper()
            sz, ln, lh = _fit(qs_i, qb.w - 0.24, 0.34, T_CAP, 7.5, theme,
                              bold=True, ls=1.15, tracking=0.5)
            lb = Box(qb.x + 0.12, qb.y + 0.10, qb.w - 0.24, lh)
            _draw(slide, lb, ln, sz, p.ink2, theme, bold=True, caps=True,
                  ls=1.15, tracking=0.5)
            blocked.append(lb)
    _vrule(slide, px + pw / 2, py, ph, p.muted, 0.6)
    _rule(slide, px, py + ph / 2, pw, p.muted, 0.6)
    blocked.append(Box(px + pw / 2 - 0.03, py, 0.06, ph))
    blocked.append(Box(px, py + ph / 2 - 0.03, pw, 0.06))
    _draw(slide, Box(px, py + ph + 0.07, pw / 2, 0.22), [str(xa[0]).upper()],
          T_CAP, p.muted, theme, caps=True, tracking=0.8)
    _draw(slide, Box(px + pw / 2, py + ph + 0.07, pw / 2, 0.22), [str(xa[-1]).upper()],
          T_CAP, p.muted, theme, align="r", caps=True, tracking=0.8)
    for lbl, cy in ((str(ya[-1]).upper(), py + ph * 0.26),
                    (str(ya[0]).upper(), py + ph * 0.74)):
        tb = text(slide, Box(px - 0.62, cy - 0.11, 0.9, 0.22), [lbl], T_CAP, p.muted,
                  theme, align="c", anchor="m", caps=True, tracking=0.8, font=theme.font)
        rotate(tb, 270)
    dots = []
    for q in pts:
        cx = px + _clamp(float(q.get("x", 0.5)), 0.03, 0.97) * pw
        cy = py + ph - _clamp(float(q.get("y", 0.5)), 0.03, 0.97) * ph
        d = 0.15 if q.get("highlight") else 0.115
        _shape(slide, Box(cx - d / 2, cy - d / 2, d, d), MSO_SHAPE.OVAL,
              fill=p.accent if q.get("highlight") else p.ink2)
        blocked.append(Box(cx - d / 2, cy - d / 2, d, d))
        dots.append((q, cx, cy, d))
    for q, cx, cy, d in dots:
        hl = bool(q.get("highlight"))
        sz, ln, lh = _fit(str(q["label"]), 1.0, 0.44, T_CAP, 8.0, theme,
                          bold=hl, ls=1.15)
        lw = max(textfit.one_line(l, sz, theme.font, hl, 0.0) for l in ln) + 0.04
        lw = min(1.05, max(0.30, lw))

        def cand(side, dy):
            if side == "r":
                return Box(cx + d / 2 + 0.07, cy - lh / 2 + dy, lw, lh), "l"
            if side == "l":
                return Box(cx - d / 2 - 0.07 - lw, cy - lh / 2 + dy, lw, lh), "l"
            if side == "t":
                return Box(cx - lw / 2, cy - d / 2 - 0.06 - lh + dy, lw, lh), "c"
            return Box(cx - lw / 2, cy + d / 2 + 0.06 + dy, lw, lh), "c"

        chosen = None
        for side in ("r", "l", "t", "b"):
            for k in range(7):
                dy = 0.0 if k == 0 else 0.10 * ((k + 1) // 2) * (1 if k % 2 else -1)
                bx, al = cand(side, dy)
                if (bx.x >= px + 0.03 and bx.r <= px + pw - 0.03 and
                        bx.y >= py + 0.03 and bx.b <= py + ph - 0.03 and
                        not any(_hit(bx, o) for o in blocked)):
                    chosen = (bx, al)
                    break
            if chosen:
                break
        if not chosen:
            bx, al = cand("r", 0)
            bx = Box(_clamp(bx.x, px + 0.03, max(px + 0.03, px + pw - bx.w - 0.03)),
                     _clamp(bx.y, py + 0.03, max(py + 0.03, py + ph - bx.h - 0.03)),
                     bx.w, bx.h)
            chosen = (bx, al)
        blocked.append(chosen[0])
        _draw(slide, chosen[0], ln, sz, p.accent if hl else p.ink2, theme,
              bold=hl, align=chosen[1], ls=1.15)


# --------------------------------------------------------------------------- #
# 6. flow
# --------------------------------------------------------------------------- #
def _flow(slide, box, spec, theme):
    p = theme.palette
    items = _items(spec, "items", 2, 4, "flow")
    n = len(items)
    ag = 0.36
    bw = (box.w - ag * (n - 1)) / n
    w = bw - 2 * PAD
    tsize, tlines, th = _uniform([it.get("title", "") for it in items], w, 0.64,
                                 T_TITLE, 9.5, theme, bold=True, ls=1.15)
    body_cap = max(0.35, min(1.9, box.h - (0.045 + 0.16 + th + 0.08 + 2 * PAD)))
    bsize, blines, bh = _uniform([it.get("text", "") for it in items], w, body_cap,
                                 T_BODY, 8.5, theme, ls=1.20)
    bh_h = 0.045 + 0.16 + th + 0.08 + bh + PAD
    top = box.y + max(0.0, (box.h - bh_h) / 2)
    for i, it in enumerate(items):
        x = box.x + i * (bw + ag)
        _shape(slide, Box(x, top, bw, bh_h), MSO_SHAPE.ROUNDED_RECTANGLE,
              fill=p.tint, radius=RAD)
        _rect(slide, Box(x, top, bw, 0.045), p.accent)
        _draw(slide, Box(x + PAD, top + 0.045 + 0.16, w, th), tlines[i], tsize,
              p.ink, theme, bold=True, ls=1.15)
        _draw(slide, Box(x + PAD, top + 0.045 + 0.16 + th + 0.08, w, bh),
              blines[i], bsize, p.ink2, theme, ls=1.20)
        if i < n - 1:
            _shape(slide, Box(x + bw + 0.06, top + bh_h / 2 - 0.075, ag - 0.12, 0.15),
                  MSO_SHAPE.RIGHT_ARROW, fill=p.accent)


# --------------------------------------------------------------------------- #
# 7. funnel
# --------------------------------------------------------------------------- #
def _ratios(items):
    nums = []
    for it in items:
        m = _NUM.search(str(it.get("value", "")))
        nums.append(float(m.group(0).replace(",", "")) if m else None)
    if all(v is not None and v > 0 for v in nums):
        mx = max(nums)
        return [_clamp(v / mx, 0.45, 1.0) for v in nums]
    return [1.0 - 0.5 * i / max(1, len(items) - 1) for i in range(len(items))]


def _funnel(slide, box, spec, theme):
    p = theme.palette
    items = _items(spec, "items", 3, 5, "funnel")
    n = len(items)
    ratios = _ratios(items)
    full = box.w * 0.94
    gap = 0.08
    band_h = (box.h - gap * (n - 1)) / n
    widths = [full * r for r in ratios]
    for i, it in enumerate(items):
        y = box.y + i * (band_h + gap)
        top_w = widths[i]
        bot_w = widths[i + 1] if i + 1 < n else widths[i] * 0.86
        _trap(slide, box.x + box.w / 2, top_w, bot_w, y, band_h,
              mix(p.accent, p.bg, 0.90 - 0.09 * i / max(1, n - 1)))
        safe = (top_w + bot_w) / 2 - 0.36
        vtxt = str(it.get("value", ""))
        vsz = 11.5
        while vsz > 8.5 and textfit.one_line(vtxt, vsz, theme.font, True) > safe * 0.42:
            vsz -= 0.5
        vw = min(safe * 0.42, textfit.one_line(vtxt, vsz, theme.font, True) + 0.02)
        lab_w = max(0.6, safe - vw - 0.18)
        lsz, llines, lh = _fit(str(it.get("label", "")), lab_w, 0.34, 10.5, 9.0,
                               theme, bold=True, ls=1.15)
        tsz, tlines, tth = 0.0, [], 0.0
        if it.get("text"):
            tsz, tlines, tth = _fit(str(it["text"]), lab_w,
                                    max(0.22, band_h - lh - 0.14), 9.0, 8.0,
                                    theme, ls=1.18)
        gh = lh + (0.04 + tth if tlines else 0.0)
        gy = y + (band_h - gh) / 2
        gx = box.x + box.w / 2 - (top_w + bot_w) / 4 + 0.18
        _draw(slide, Box(gx, gy, lab_w, lh), llines, lsz, p.ink, theme,
              bold=True, ls=1.15)
        if tlines:
            _draw(slide, Box(gx, gy + lh + 0.04, lab_w, tth), tlines, tsz, p.ink2,
                  theme, ls=1.18)
        vx = box.x + box.w / 2 + (top_w + bot_w) / 4 - 0.18 - vw
        _draw(slide, Box(vx, y + (band_h - 0.30) / 2, vw, 0.30), [vtxt], vsz,
              p.accent, theme, bold=True, align="r", anchor="m")


# --------------------------------------------------------------------------- #
# 8. org
# --------------------------------------------------------------------------- #
def _node_h(title, sub, w, ts, ss, theme):
    th = _fit(title, w - 2 * PAD, 0.72, ts, 9.0, theme, bold=True, ls=1.15)[2]
    sh = _fit(sub, w - 2 * PAD, 0.46, ss, 8.0, theme, ls=1.15)[2] if sub else 0.0
    return PAD + th + (0.05 + sh if sub else 0.0) + PAD


def _node(slide, b, title, sub, theme, fill, tcol, scol, ts, ss):
    _shape(slide, b, MSO_SHAPE.ROUNDED_RECTANGLE, fill=fill, radius=RAD)
    w = b.w - 2 * PAD
    sz, ln, th = _fit(title, w, 0.72, ts, 9.0, theme, bold=True, ls=1.15)
    _draw(slide, Box(b.x + PAD, b.y + PAD, w, th), ln, sz, tcol, theme,
          bold=True, ls=1.15)
    if sub:
        sz2, ln2, sh = _fit(sub, w, 0.46, ss, 8.0, theme, ls=1.15)
        _draw(slide, Box(b.x + PAD, b.y + PAD + th + 0.05, w, sh), ln2, sz2,
              scol, theme, ls=1.15)


def _org(slide, box, spec, theme):
    p = theme.palette
    root = spec.get("root") or {}
    if not isinstance(root, dict) or not root.get("title"):
        raise ValueError("org: 'root' needs a title")
    children = [c for c in (spec.get("children") or []) if isinstance(c, dict)]
    n1 = len(children)
    gap1 = 0.18
    slot = (box.w - gap1 * max(0, n1 - 1)) / max(1, n1)
    w1 = min(3.35, slot)
    w0 = min(3.30, box.w * 0.42)
    h0 = _node_h(str(root["title"]), str(root.get("subtitle", "")), w0, 12.0, 9.5, theme)
    h1 = max([_node_h(str(c.get("title", "")), str(c.get("subtitle", "")), w1,
                      11.0, 9.0, theme) for c in children] or [0.0])
    l2 = []
    for c in children:
        gk = [g for g in (c.get("children") or []) if isinstance(g, dict)]
        cw = (w1 - 0.12 * max(0, len(gk) - 1)) / max(1, len(gk))
        l2.append((gk, cw))
    h2 = max([_node_h(str(g.get("title", "")), str(g.get("subtitle", "")), cw,
                      10.5, 8.5, theme) for gk, cw in l2 for g in gk] or [0.0])
    has2 = h2 > 0
    gap = 0.55
    rows = 1 + (1 if n1 else 0) + (1 if has2 else 0)
    assembly = h0 + (h1 if n1 else 0) + (h2 if has2 else 0) + gap * (rows - 1)
    if assembly < box.h:
        gap += (box.h - assembly) * 0.55 / max(1, rows - 1)
        assembly = h0 + (h1 if n1 else 0) + (h2 if has2 else 0) + gap * (rows - 1)
    top = box.y + max(0.0, (box.h - assembly) * 0.28)
    y0, y1, y2 = top, top + h0 + gap, top + h0 + gap + h1 + gap
    # connectors are drawn behind the boxes
    if n1:
        x1 = box.x + (box.w - (w1 * n1 + gap1 * (n1 - 1))) / 2
        cxs = [x1 + i * (w1 + gap1) + w1 / 2 for i in range(n1)]
        bus = y1 - gap * 0.45
        _vrule(slide, box.x + box.w / 2, y0 + h0, bus - y0 - h0, p.muted, RULE_PT)
        _rule(slide, min(cxs), bus, max(cxs) - min(cxs), p.muted, RULE_PT)
        for cx in cxs:
            _vrule(slide, cx, bus, y1 - bus, p.muted, RULE_PT)
        if has2:
            for i, (gk, cw) in enumerate(l2):
                if not gk:
                    continue
                gw = cw * len(gk) + 0.12 * (len(gk) - 1)
                gx0 = x1 + i * (w1 + gap1) + (w1 - gw) / 2
                gcxs = [gx0 + j * (cw + 0.12) + cw / 2 for j in range(len(gk))]
                bus2 = y2 - gap * 0.45
                _vrule(slide, cxs[i], y1 + h1, bus2 - y1 - h1, p.muted, RULE_PT)
                _rule(slide, min(gcxs), bus2, max(gcxs) - min(gcxs), p.muted, RULE_PT)
                for gx in gcxs:
                    _vrule(slide, gx, bus2, y2 - bus2, p.muted, RULE_PT)
    _node(slide, Box(box.x + (box.w - w0) / 2, y0, w0, h0), str(root["title"]),
          str(root.get("subtitle", "")), theme, p.accent, p.accent_ink, p.accent_ink,
          12.0, 9.5)
    if n1:
        x1 = box.x + (box.w - (w1 * n1 + gap1 * (n1 - 1))) / 2
        for i, c in enumerate(children):
            _node(slide, Box(x1 + i * (w1 + gap1), y1, w1, h1), str(c.get("title", "")),
                  str(c.get("subtitle", "")), theme, p.tint, p.ink, p.muted, 11.0, 9.0)
            gk, cw = l2[i]
            gw = cw * len(gk) + 0.12 * max(0, len(gk) - 1)
            gx0 = x1 + i * (w1 + gap1) + (w1 - gw) / 2
            for j, g in enumerate(gk):
                _node(slide, Box(gx0 + j * (cw + 0.12), y2, cw, h2),
                      str(g.get("title", "")), str(g.get("subtitle", "")), theme,
                      p.tint2, p.ink2, p.muted, 10.5, 8.5)


# --------------------------------------------------------------------------- #
# 9. quote
# --------------------------------------------------------------------------- #
def _quote(slide, box, spec, theme):
    p = theme.palette
    txt = str(spec.get("text", "")).strip()
    if not txt:
        raise ValueError("quote: 'text' is required")
    w = box.w - 0.34
    avail = max(0.6, box.h - 0.62)
    size = T_QUOTE
    lines = []
    while size > 14.0:
        lines = textfit.wrap_text(txt, w * 72.0, size, theme.font, False, False, -0.2)
        if len(lines) <= 4 and _height(lines, size, 1.25) <= avail:
            break
        size -= 0.5
    lines = textfit.wrap_text(txt, w * 72.0, size, theme.font, False, False, -0.2)
    if len(lines) > 4:
        lines = lines[:4]
        lines[-1] = _shorten(lines[-1], w, size, theme, tracking=-0.2)
    hh = _height(lines, size, 1.25)
    name = str(spec.get("attribution", "")).strip()
    role = str(spec.get("role", "")).strip()
    nh = _height([name], 10.0, 1.2) if name else 0.0
    rh = _height([role], 9.0, 1.2) if role else 0.0
    attr = nh + (0.05 + rh if role and name else rh)
    block = hh + (0.22 + attr if attr else 0.0)
    top = box.y + max(0.0, (box.h - block) / 2)
    _vrule(slide, box.x, top, block, p.accent, 2.25)
    _draw(slide, Box(box.x + 0.30, top, w, hh), lines, size, p.ink, theme,
          ls=1.25, tracking=-0.2)
    y = top + hh + 0.22
    if name:
        _draw(slide, Box(box.x + 0.30, y, w, nh), [name], 10.0, p.ink, theme,
              bold=True)
        y += nh + (0.05 if role else 0.0)
    if role:
        _draw(slide, Box(box.x + 0.30, y, w, rh), [role], 9.0, p.muted, theme)


# --------------------------------------------------------------------------- #
# 10. callout
# --------------------------------------------------------------------------- #
def _callout(slide, box, spec, theme):
    p = theme.palette
    body = str(spec.get("text", "")).strip()
    if not body:
        raise ValueError("callout: 'text' is required")
    name = spec.get("tone", "accent")
    tone = _tone(theme, name)
    fill = p.tint if name == "neutral" else _soft(theme, tone, 0.90)
    title = str(spec.get("title", "")).strip()
    w = box.w - 0.06 - 0.20 - 0.18
    ts = _fit(title, w, 0.40, T_TITLE, 10.5, theme, bold=True) if title else None
    th = ts[2] if ts else 0.0
    cap = max(0.45, box.h - (2 * PAD + th + (0.08 if ts else 0.0)))
    bz, bl, bh = _fit(body, w, cap, T_TEXT, 9.0, theme, ls=LS["body"])
    ph = min(box.h, th + (0.08 if ts else 0.0) + bh + 2 * PAD)
    top = box.y + (box.h - ph) / 2
    _rect(slide, Box(box.x, top, box.w, ph), fill)
    _rect(slide, Box(box.x, top, 0.06, ph), tone)
    y = top + PAD
    if ts:
        _draw(slide, Box(box.x + 0.26, y, w, th), ts[1], ts[0], p.ink, theme, bold=True)
        y += th + 0.08
    _draw(slide, Box(box.x + 0.26, y, w, bh), bl, bz, p.ink, theme, ls=LS["body"])


# --------------------------------------------------------------------------- #
# 11. banner
# --------------------------------------------------------------------------- #
def _banner(slide, box, spec, theme):
    p = theme.palette
    body = str(spec.get("text", "")).strip()
    if not body:
        raise ValueError("banner: 'text' is required")
    label = str(spec.get("label", "")).strip()
    w = box.w - 0.36
    lsz, llines, lh = (0.0, [], 0.0)
    if label:
        lsz, llines, lh = _fit(label.upper(), w, 0.22, T_CAP, 8.0, theme,
                               bold=True, ls=1.15, tracking=0.9)
    cap = max(0.4, box.h - (2 * PAD + lh + (0.05 if label else 0.0)))
    tsz, tlines, th = _fit(body, w, cap, T_BANNER, 10.0, theme, bold=True, ls=LS["snug"])
    ph = min(box.h, lh + (0.05 if label else 0.0) + th + 2 * PAD)
    top = box.y + (box.h - ph) / 2
    _rect(slide, Box(box.x, top, box.w, ph), p.tint)
    y = top + PAD
    if label:
        _draw(slide, Box(box.x + 0.18, y, w, lh), llines, lsz, p.accent, theme,
              bold=True, caps=True, ls=1.15, tracking=0.9)
        y += lh + 0.05
    _draw(slide, Box(box.x + 0.18, y, w, th), tlines, tsz, p.ink, theme,
          bold=True, ls=LS["snug"])


# --------------------------------------------------------------------------- #
# dispatch
# --------------------------------------------------------------------------- #
_BUILDERS = {
    "kpi": _kpi,
    "steps": _steps,
    "timeline": _timeline,
    "cards": _cards,
    "matrix": _matrix,
    "flow": _flow,
    "funnel": _funnel,
    "org": _org,
    "quote": _quote,
    "callout": _callout,
    "banner": _banner,
}


def build(slide, box: Box, spec: dict, theme) -> None:
    """Draw the diagram described by ``spec`` inside ``box``; returns ``None``."""
    kind = spec.get("kind") if isinstance(spec, dict) else None
    fn = _BUILDERS.get(kind)
    if fn is None:
        raise ValueError(
            f"unknown diagram kind {kind!r}; allowed: {', '.join(sorted(_BUILDERS))}")
    fn(slide, box, spec, theme)
