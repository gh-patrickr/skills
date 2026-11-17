"""Native, editable, consulting-grade charts.

:func:`build(slide, box, spec, theme)` draws one chart filling ``box`` and
returns ``None``.  The result is a real PowerPoint chart object: no images,
border, plot fill, shadow or 3-D.

Kinds: ``column | bar | stacked | stacked100 | line | area | combo | scatter |
waterfall``.

Spec keys
---------
``kind`` (required), ``categories`` (required except scatter), ``series``
(required; each ``{name, values, colour?, type?, emphasis?}``).  A ``combo``
series with ``type: "line"`` becomes an overlaid line.  For ``scatter``,
``values`` is a list of ``(x, y)`` pairs, or x comes from a sibling ``x`` list,
or from numeric ``categories``.

Also: ``highlight`` (index or series name; an index means a category for a
single-series chart, a series otherwise), ``label`` (``none | all | last |
outside_end | inside_end | value``), ``label_fmt``, ``axis_fmt``, ``value_max``,
``value_min``, ``show_value_axis``, ``show_categories``, ``legend``,
``horizontal_gridlines``, ``waterfall_totals``, ``negative_direction``,
``trend`` (short top-right note), and for scatter ``quadrants``,
``quadrant_x``, ``quadrant_y``, ``point_labels``, ``x_label``, ``y_label``,
``x_min``, ``x_max``.
"""
from __future__ import annotations

import math
import re
from typing import List, Optional, Sequence, Tuple

from lxml import etree
from pptx.chart.axis import ValueAxis
from pptx.chart.data import CategoryChartData, XyChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import (
    XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION, XL_MARKER_STYLE,
    XL_TICK_LABEL_POSITION, XL_TICK_MARK,
)
from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls, qn
from pptx.slide import Slide
from pptx.util import Inches, Pt

from . import prims, textfit
from .prims import Box
from .theme import Theme, contrast, mix, tint

_KINDS = ("column", "bar", "stacked", "stacked100", "line", "area", "combo",
          "scatter", "waterfall")
_LABELS = ("none", "all", "last", "outside_end", "inside_end", "value")
_CLEAN = (f'<c:spPr {nsdecls("c", "a")}><a:noFill/><a:ln><a:noFill/></a:ln>'
          f'<a:effectLst/></c:spPr>')


def _rgb(h: str) -> RGBColor:
    return RGBColor.from_string(h.lstrip("#").upper())


def _context(theme: Theme, step: int = 0) -> str:
    """Neutral for de-emphasised items, derived from rule/ink2 (never a hex)."""
    p = theme.palette
    return tint(mix(p.rule, p.ink2, 0.18), min(0.55, 0.17 * step))


def _nice_ceil(v: float) -> float:
    if v <= 0:
        return v
    e = 10.0 ** math.floor(math.log10(v))
    for m in (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if v <= m * e * (1 + 1e-9):
            return m * e
    return 10 * e


def _nice_unit(span: float) -> float:
    raw = max(span / 5.0, 1e-9)
    e = 10.0 ** math.floor(math.log10(raw))
    return next((m * e for m in (1, 2, 2.5, 5, 10) if raw <= m * e), 10 * e)


def _sample(code: str, value: float) -> str:
    """Approximate an Excel number format, for measuring label width only."""
    code = (code or "General").split(";")[0]
    m = re.search(r"([#0,]+)(?:\.([0#]+))?", code)
    if not m:
        return f"{value:g}"
    pct, dec = "%" in code, len(m.group(2) or "")
    scale = 100.0 if pct else 1.0
    trailing = len(m.group(1)) - len(m.group(1).rstrip(","))
    if trailing:
        scale /= 1000.0 ** trailing
    body = (f"{abs(value * scale):,.{dec}f}" if "," in m.group(1)
            else f"{abs(value * scale):.{dec}f}")
    return (("$" if "$" in code else "") + ("-" if value < 0 else "") + body
            + ("%" if pct else ""))


def _label_size(samples: Sequence[str], slot: float, theme: Theme) -> float:
    widest = max((textfit.one_line(s, 9.0, theme.font) for s in samples), default=0.0)
    return (9.0 if widest <= max(0.1, slot * 0.88)
            else max(7.5, round(9.0 * slot * 0.88 / widest * 2) / 2))


# --------------------------------------------------------------------------- #
# frame, legend, axes
# --------------------------------------------------------------------------- #
def _replace_spPr(parent, xml: str = _CLEAN) -> None:
    old = parent.find(qn("c:spPr"))
    if old is not None:
        parent.remove(old)
    parent.insert_element_before(parse_xml(xml), "c:txPr", "c:externalData",
                                 "c:printSettings", "c:extLst")


def _frame(chart, box: Box, ins: Tuple[float, float, float, float],
           theme: Theme) -> None:
    chart.has_title = False
    chart.font.name, chart.font.size = theme.font, Pt(9)
    chart.font.color.rgb = _rgb(theme.palette.ink2)
    cs = chart._chartSpace
    rc = cs.find(qn("c:roundedCorners"))
    if rc is None:
        rc = parse_xml(f'<c:roundedCorners {nsdecls("c")} val="0"/>')
        cs.insert_element_before(rc, "c:chart")
    rc.set("val", "0")
    _replace_spPr(cs)
    _replace_spPr(cs.chart.plotArea)
    left, top, right, bottom = ins
    x, y = left / box.w, top / box.h
    w = max(0.05, 1.0 - (left + right) / box.w)
    h = max(0.05, 1.0 - (top + bottom) / box.h)
    layout = parse_xml(
        f'<c:layout {nsdecls("c")}><c:manualLayout>'
        f'<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/>'
        f'<c:x val="{x:.6f}"/><c:y val="{y:.6f}"/>'
        f'<c:w val="{w:.6f}"/><c:h val="{h:.6f}"/></c:manualLayout></c:layout>')
    pa = cs.chart.plotArea
    old = pa.find(qn("c:layout"))
    if old is not None:
        pa.remove(old)
    pa.insert(0, layout)


def _legend(chart, theme: Theme, box: Box, names: Sequence[str] = ()) -> None:
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.TOP
    chart.legend.include_in_layout = False
    f = chart.legend.font
    f.name, f.size, f.bold = theme.font, Pt(9), False
    f.color.rgb = _rgb(theme.palette.ink2)
    width = 0.08 + sum(textfit.one_line(str(nm), 9.0, theme.font) + 0.38
                       for nm in names)
    lg = chart.legend._element
    old = lg.find(qn("c:layout"))
    if old is not None:
        lg.remove(old)
    lg.insert_element_before(
        parse_xml(f'<c:layout {nsdecls("c")}><c:manualLayout>'
                  f'<c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0"/>'
                  f'<c:y val="0"/><c:w val="{min(0.92, width / box.w):.4f}"/>'
                  f'<c:h val="0.09"/>'
                  f'</c:manualLayout></c:layout>'),
        "c:overlay", "c:spPr", "c:txPr", "c:extLst")
    _replace_spPr(lg)


def _no_rotate(axis) -> None:
    txPr = axis._element.find(qn("c:txPr"))
    if txPr is None:
        return
    bp = txPr.find(qn("a:bodyPr"))
    if bp is None:
        bp = parse_xml(f'<a:bodyPr {nsdecls("a")}/>')
        txPr.insert(0, bp)
    bp.set("rot", "0")
    bp.set("vert", "horz")


def _axis(axis, theme: Theme, cat: bool, show: bool = True, fmt: str = "",
          grid: bool = False, skip: int = 1) -> None:
    axis.major_tick_mark = XL_TICK_MARK.NONE
    axis.minor_tick_mark = XL_TICK_MARK.NONE
    axis.has_major_gridlines = bool(grid) and not cat
    if cat:
        axis.format.line.color.rgb = _rgb(theme.palette.rule)
        axis.format.line.width = Pt(0.5)
    else:
        axis.format.line.fill.background()
    axis.tick_label_position = (
        XL_TICK_LABEL_POSITION.LOW if cat and show else
        XL_TICK_LABEL_POSITION.NEXT_TO_AXIS if show else
        XL_TICK_LABEL_POSITION.NONE)
    if show:
        f = axis.tick_labels.font
        f.name, f.size = theme.font, Pt(9 if cat else 8)
        f.color.rgb = _rgb(theme.palette.ink2 if cat else theme.palette.muted)
        if not cat:
            axis.tick_labels.number_format = fmt
            axis.tick_labels.number_format_is_linked = False
        else:
            _no_rotate(axis)
            if skip > 1:
                el = axis._element.find(qn("c:tickLblSkip"))
                if el is None:
                    el = parse_xml(f'<c:tickLblSkip {nsdecls("c")} val="{int(skip)}"/>')
                    axis._element.insert_element_before(
                        el, "c:tickMarkSkip", "c:noMultiLvlLbl", "c:extLst")
                else:
                    el.set("val", str(int(skip)))
    if grid and not cat:
        ln = axis.major_gridlines.format.line
        ln.color.rgb = _rgb(theme.palette.rule)
        ln.width = Pt(0.5)


def _scale(axis, lo: float, hi: float) -> None:
    hi = hi if hi > lo else lo + 1.0
    axis.minimum_scale, axis.maximum_scale = float(lo), float(hi)
    axis.major_unit = _nice_unit(hi - lo)


# --------------------------------------------------------------------------- #
# series and data labels
# --------------------------------------------------------------------------- #
def _effectless(element) -> None:
    spPr = element.find(qn("c:spPr"))
    if spPr is not None and spPr.find(qn("a:effectLst")) is None:
        spPr.append(parse_xml(f'<a:effectLst {nsdecls("a")}/>'))


def _fill(el, colour: str, alpha: Optional[float] = None) -> None:
    el.format.fill.solid()
    el.format.fill.fore_color.rgb = _rgb(colour)
    el.format.line.fill.background()
    if alpha is not None:
        clr = el._element.find(qn("c:spPr")).find(qn("a:solidFill")).find(qn("a:srgbClr"))
        etree.SubElement(clr, qn("a:alpha")).set("val", str(int(alpha * 100000)))
    _effectless(el._element)


def _stroke(ser, colour: str, width: float = 2.25) -> None:
    ser.smooth = False
    ser.marker.style = XL_MARKER_STYLE.NONE
    ser.format.line.color.rgb = _rgb(colour)
    ser.format.line.width = Pt(width)
    _effectless(ser._element)


def _marker(ser, colour: str, size: int = 9) -> None:
    ser.marker.style = XL_MARKER_STYLE.CIRCLE
    ser.marker.size = size
    ser.marker.format.fill.solid()
    ser.marker.format.fill.fore_color.rgb = _rgb(colour)
    ser.marker.format.line.fill.background()
    ser.format.line.fill.background()
    _effectless(ser._element)


def _labels(ser, theme: Theme, pos, fmt: str, size: float, colour: str,
            last: bool = False, percent: bool = False, bold: bool = False) -> None:
    dl = ser.data_labels
    dl.position = pos
    dl.show_percentage, dl.show_value = (True, False) if percent else (False, True)
    dl.number_format, dl.number_format_is_linked = fmt, False
    f = dl.font
    f.name, f.size, f.bold = theme.font, Pt(size), bold
    f.color.rgb = _rgb(colour)
    if last:
        dLbls = ser._element.find(qn("c:dLbls"))
        for i in range(len(ser.values) - 1):
            dLbls.insert(0, parse_xml(f'<c:dLbl {nsdecls("c")}><c:idx val="{i}"/>'
                                      f'<c:delete val="1"/></c:dLbl>'))


def _highlight(spec: dict, names: Sequence[str], cats: Sequence[str],
               point: bool, n_points: Optional[int] = None
               ) -> Tuple[Optional[int], Optional[str]]:
    h = spec.get("highlight")
    if h is None:
        return next(((i, "series") for i, s in enumerate(spec["series"])
                     if s.get("emphasis")), (None, None))
    if isinstance(h, str):
        if h in names:
            return names.index(h), "series"
        if h in cats:
            return cats.index(h), "point"
        raise ValueError(f"highlight {h!r} is not a series or category; "
                         f"series={list(names)} categories={list(cats)}")
    if isinstance(h, int) and not isinstance(h, bool):
        if point and 0 <= h < (n_points if n_points is not None else len(cats)):
            return h, "point"
        if not point and 0 <= h < len(names):
            return h, "series"
        raise ValueError(f"highlight index {h} is out of range")
    raise ValueError("highlight must be an int index or a series name")


def _label_mode(spec: dict, kind: str) -> str:
    default = "none" if kind in ("line", "area", "scatter") else "all"
    label = str(spec.get("label", default) or default).lower()
    if label not in _LABELS:
        raise ValueError(f"unknown label {label!r}; allowed: {', '.join(_LABELS)}")
    return label


def _band(spec: dict, legend: bool) -> float:
    return 0.03 + (0.38 if legend else 0.0) + (0.24 if spec.get("trend") else 0.0)


def _on(fill: str, theme: Theme) -> str:
    """Label colour with the better contrast on `fill`."""
    p = theme.palette
    return (p.accent_ink if contrast(fill, p.accent_ink) >= contrast(fill, p.ink)
            else p.ink)


# --------------------------------------------------------------------------- #
# column / bar / stacked / line / area / combo
# --------------------------------------------------------------------------- #
def _category(slide, box: Box, spec: dict, theme: Theme, kind: str) -> None:
    cats = [str(c) for c in spec["categories"]]
    specs, n, ns = spec["series"], len(cats), len(spec["series"])
    horizontal, stacked = kind == "bar", kind in ("stacked", "stacked100")
    line_idx = ([i for i, s in enumerate(specs)
                 if str(s.get("type", "")).lower() == "line"]
                if kind == "combo" else [])
    if kind == "combo" and len(line_idx) == ns:
        kind, line_idx = "line", []
    label = _label_mode(spec, kind)
    fmt = spec.get("label_fmt") or ("0%" if kind == "stacked100" else "#,##0")
    ax_fmt = spec.get("axis_fmt") or fmt
    show_cats = bool(spec.get("show_categories", True))
    legend = (spec.get("legend") if spec.get("legend") is not None
              else ns > 1 and label == "none")
    show_axis = spec.get("show_value_axis")
    if show_axis is None:
        show_axis = label == "none" or bool(line_idx)
    hi, hmode = _highlight(spec, [str(s.get("name", "")) for s in specs],
                           cats, point=ns == 1 and kind != "combo")

    ctype = {"column": XL_CHART_TYPE.COLUMN_CLUSTERED,
             "combo": XL_CHART_TYPE.COLUMN_CLUSTERED,
             "bar": XL_CHART_TYPE.BAR_CLUSTERED,
             "stacked": XL_CHART_TYPE.COLUMN_STACKED,
             "stacked100": XL_CHART_TYPE.COLUMN_STACKED_100,
             "line": XL_CHART_TYPE.LINE, "area": XL_CHART_TYPE.AREA}[kind]
    data = CategoryChartData()
    data.categories = cats
    for s in specs:
        data.add_series(str(s.get("name", "")), [float(v) for v in s["values"]])
    chart = slide.shapes.add_chart(ctype, Inches(box.x), Inches(box.y),
                                   Inches(box.w), Inches(box.h), data).chart

    vals = [float(v) for s in specs for v in s["values"]]
    vmin, vmax = min(vals), max(vals)
    if kind == "line":
        step = _nice_unit(vmax - vmin or 1.0)
        lo = math.floor((vmin - step * 0.4) / step) * step
        hi_v = math.ceil((vmax + step * 0.4) / step) * step
    elif stacked:
        lo = min(0.0, vmin)
        hi_v = max(sum(max(0.0, float(s["values"][i])) for s in specs)
                   for i in range(n))
    else:
        lo, hi_v = min(0.0, vmin), max(0.0, vmax)
        hi_v *= 1.02 if horizontal or label == "none" else 1.12
    if kind == "stacked100":
        lo, hi_v = 0.0, 1.0
    if spec.get("value_min") is not None:
        lo = float(spec["value_min"])
    if spec.get("value_max") is not None:
        hi_v = float(spec["value_max"])
    lo = 0.0 if 0 >= lo >= -1e-9 else (-_nice_ceil(-lo) if lo < 0 else lo)
    hi_v = _nice_ceil(max(lo + 0.01, hi_v)) if kind != "line" else hi_v
    if hi_v <= lo:
        hi_v = lo + 1.0

    samples = (["100%"] if kind == "stacked100"
               else [_sample(fmt, float(v)) for s in specs for v in s["values"]])
    widest = max((textfit.one_line(t, 9.0, theme.font) for t in samples), default=0.0)
    ins_l, ins_r = 0.05, 0.07
    ins_t = _band(spec, legend)
    ins_b = 0.31 if (show_cats and not horizontal) else 0.06
    if horizontal and show_cats:
        ins_l = min(2.8, max((textfit.one_line(c, 9.0, theme.font) for c in cats),
                             default=0.0) + 0.16)
    if show_axis:
        aw = max((textfit.one_line(_sample(ax_fmt, v), 8.0, theme.font)
                  for v in (lo, hi_v)), default=0.0)
        if horizontal:
            ins_b = 0.30
        else:
            ins_l = max(ins_l, aw + 0.15)
    if horizontal and label in ("all", "outside_end", "last", "value"):
        ins_r = max(ins_r, min(1.6, widest + 0.14))
    if not horizontal and label == "last":
        ins_r = max(ins_r, min(1.6, widest + 0.16))
    pw, ph = max(0.5, box.w - ins_l - ins_r), max(0.5, box.h - ins_t - ins_b)
    slot = (ph / n) if horizontal else (pw / max(1, n))
    if kind in ("line", "area"):
        slot = pw / max(1, n - 1)
    bar_slot = slot / 1.55 if stacked else slot
    size = (9.0 if label == "none" else _label_size(
        samples, slot if horizontal else bar_slot * (0.64 if stacked else 0.94), theme))
    skip = 1
    if show_cats and n > 1:
        if horizontal and ph / n < 0.18:
            skip = min(n, int(math.ceil(0.18 * n / ph)))
        elif not horizontal:
            lw = max((textfit.one_line(c, 9.0, theme.font) for c in cats), default=0.0)
            if lw > (pw / n) * 1.02:
                skip = min(n, int(math.ceil(lw * n / (pw * 1.02))))

    _frame(chart, box, (ins_l, ins_t, ins_r, ins_b), theme)
    _axis(chart.category_axis, theme, True, show_cats, skip=skip)
    _axis(chart.value_axis, theme, False, bool(show_axis) and kind != "stacked100",
          ax_fmt, bool(spec.get("horizontal_gridlines")))
    if kind != "stacked100":
        _scale(chart.value_axis, lo, hi_v)

    if hmode == "series" and hi is not None:
        cols = [theme.accent if i == hi else _context(theme, i) for i in range(ns)]
    else:
        cols = [s.get("colour") or theme.series_color(i) for i, s in enumerate(specs)]
        if ns == 1 and hmode == "point" and hi is not None:
            cols = [_context(theme, 0)]
    plot = chart.plots[0]
    plot.vary_by_categories = False
    if kind in ("column", "bar", "stacked", "stacked100", "combo"):
        plot.gap_width = 45 if horizontal else 55
        if stacked:
            plot.overlap = 100
    pos_map = {
        "all": XL_LABEL_POSITION.CENTER if stacked else
               (XL_LABEL_POSITION.ABOVE if kind in ("line", "area")
                else XL_LABEL_POSITION.OUTSIDE_END),
        "outside_end": (XL_LABEL_POSITION.ABOVE if kind in ("line", "area")
                        else XL_LABEL_POSITION.OUTSIDE_END),
        "inside_end": XL_LABEL_POSITION.CENTER if stacked else
                      (XL_LABEL_POSITION.ABOVE if kind in ("line", "area")
                       else XL_LABEL_POSITION.INSIDE_END),
        "value": XL_LABEL_POSITION.CENTER if stacked else
                 (XL_LABEL_POSITION.ABOVE if kind in ("line", "area")
                  else XL_LABEL_POSITION.CENTER),
        "last": XL_LABEL_POSITION.ABOVE if kind in ("line", "area")
                else XL_LABEL_POSITION.OUTSIDE_END,
    }
    for i, s in enumerate(specs):
        ser, col = chart.series[i], cols[i]
        if i in line_idx:
            ser.format.line.color.rgb = _rgb(col)
            ser.format.line.width = Pt(2.25)
            _effectless(ser._element)
            if label == "last":
                _labels(ser, theme, XL_LABEL_POSITION.ABOVE, fmt, 9.0, col,
                        last=True, bold=True)
            continue
        if kind in ("line", "area"):
            if kind == "area":
                _fill(ser, col, 0.22)
                ser.format.line.color.rgb = _rgb(col)
                ser.format.line.width = Pt(2.0)
                _effectless(ser._element)
            else:
                _stroke(ser, col)
        else:
            _fill(ser, col)
            if not stacked:
                for j, v in enumerate(s["values"]):
                    if float(v) < 0 and not (ns == 1 and hmode == "point" and j == hi):
                        _fill(ser.points[j], theme.palette.negative)
            if ns == 1 and hmode == "point" and hi is not None:
                _fill(ser.points[hi], theme.accent)
        if label == "none":
            continue
        if stacked:
            colour = (theme.palette.accent_ink if luminance(col) < 0.42
                      else theme.palette.ink)
            _labels(ser, theme, pos_map[label], fmt, size, colour,
                    last=label == "last", percent=kind == "stacked100")
        elif kind in ("line", "area"):
            _labels(ser, theme, pos_map[label], fmt, size,
                    col if label == "last" else theme.palette.ink2,
                    last=label == "last", bold=label == "last")
        else:
            _labels(ser, theme, pos_map[label], fmt, size, theme.palette.ink2,
                    last=label == "last")

    if line_idx:
        pa = chart._chartSpace.chart.plotArea
        bar = pa.find(qn("c:barChart"))
        ids = [el.get("val") for el in bar.findall(qn("c:axId"))]
        line = parse_xml(
            f'<c:lineChart {nsdecls("c")}><c:grouping val="standard"/>'
            f'<c:varyColors val="0"/><c:marker val="0"/>'
            f'<c:axId val="{ids[0]}"/><c:axId val="{ids[1]}"/></c:lineChart>')
        bar.addnext(line)
        for i in line_idx:
            el = chart.series[i]._element
            bar.remove(el)
            el.insert_element_before(
                parse_xml(f'<c:marker {nsdecls("c")}><c:symbol val="none"/></c:marker>'),
                "c:dPt", "c:dLbls", "c:cat", "c:val", "c:smooth", "c:extLst")
            el.insert_element_before(parse_xml(f'<c:smooth {nsdecls("c")} val="0"/>'),
                                     "c:extLst")
            line.insert(len(line) - 2, el)
    if legend:
        _legend(chart, theme, box,
                [str(sr.get("name") or f"Series {k + 1}")
                 for k, sr in enumerate(spec.get("series") or [])])
    else:
        chart.has_legend = False


# --------------------------------------------------------------------------- #
# waterfall
# --------------------------------------------------------------------------- #
def _waterfall(slide, box: Box, spec: dict, theme: Theme) -> None:
    cats = [str(c) for c in spec["categories"]]
    n = len(cats)
    vals = [float(v) for v in spec["series"][0]["values"]]
    totals = spec.get("waterfall_totals")
    totals = [False] * n if totals is None else [bool(t) for t in totals]
    if len(totals) != n:
        raise ValueError(f"waterfall_totals needs {n} booleans, got {len(totals)}")
    fmt = spec.get("label_fmt") or "#,##0"
    base, up, down = [0.0] * n, [0.0] * n, [0.0] * n
    cum, hi_v = 0.0, 0.0
    for i, (v, total) in enumerate(zip(vals, totals)):
        start, end = (0.0, v) if total else (cum, cum + v)
        cum = end
        base[i] = min(start, end)
        if base[i] < -1e-9:
            raise ValueError("waterfall needs a cumulative path at or above zero; "
                             f"category {cats[i]!r} ends at {end:g}")
        (up if (total or v >= 0) else down)[i] = abs(end - start)
        hi_v = max(hi_v, start, end)
    hi_v = _nice_ceil(max(0.01, hi_v) * (
        1.14 if _label_mode(spec, "waterfall") != "none" else 1.02))
    if spec.get("value_max") is not None:
        hi_v = float(spec["value_max"])

    data = CategoryChartData()
    data.categories = cats
    for nm, values in (("Base", base), ("Increase", up), ("Decrease", down)):
        data.add_series(nm, values)
    chart = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED, Inches(box.x),
                                   Inches(box.y), Inches(box.w), Inches(box.h),
                                   data).chart
    label = _label_mode(spec, "waterfall")
    show_axis = bool(spec.get("show_value_axis", False))
    samples = [_sample(fmt, abs(v)) for v in vals] or ["0"]
    size = _label_size(samples, (box.w - 0.13) / max(1, n) / 1.55, theme)
    ins_l = 0.05
    if show_axis:
        aw = max((textfit.one_line(_sample(spec.get("axis_fmt") or fmt, v), 8.0,
                                   theme.font) for v in (0.0, hi_v)), default=0.0)
        ins_l = max(ins_l, aw + 0.15)
    top_ins = _band(spec, False)
    bot_ins = 0.31 if spec.get("show_categories", True) else 0.06
    _frame(chart, box, (ins_l, top_ins, 0.07, bot_ins), theme)
    _axis(chart.category_axis, theme, True, bool(spec.get("show_categories", True)))
    _axis(chart.value_axis, theme, False, show_axis,
          spec.get("axis_fmt") or fmt, bool(spec.get("horizontal_gridlines")))
    _scale(chart.value_axis, 0.0, hi_v)
    plot = chart.plots[0]
    plot.vary_by_categories = False
    plot.gap_width, plot.overlap = 45, 100

    base_ser, up_ser, down_ser = chart.series
    base_ser.format.fill.background()
    base_ser.format.line.fill.background()
    _fill(up_ser, tint(theme.palette.ink, 0.38))
    for i, total in enumerate(totals):
        if total:
            _fill(up_ser.points[i], theme.palette.ink)
    _fill(down_ser, theme.palette.negative if spec.get("negative_direction")
          else theme.accent)
    chart.has_legend = False

    # Labels and connectors are drawn as shapes: on a stacked column the
    # renderer puts "outside end" labels inside the bar, and zero-length
    # segments would each get a "0" label.  Geometry is exact because _frame
    # sets a manual plot-area layout.
    if label != "none":
        plot_x, plot_y = box.x + ins_l, box.y + top_ins
        plot_w = box.w - ins_l - 0.07
        plot_h = box.h - top_ins - bot_ins
        cw = plot_w / n
        bar_w = cw * 100.0 / (100.0 + 45.0)

        def y_of(v: float) -> float:
            return plot_y + plot_h * (1.0 - (v / hi_v if hi_v else 0.0))

        levels, run = [], 0.0
        for i, (v, total) in enumerate(zip(vals, totals)):
            start, end = (0.0, v) if total else (run, run + v)
            levels.append((start, end))
            run = end
        lsize = min(size, 9.5)
        for i, (v, total) in enumerate(zip(vals, totals)):
            start, end = levels[i]
            cx = plot_x + (i + 0.5) * cw
            shown = _sample(fmt, abs(v))
            if total:
                txt = shown
            else:
                txt = ("+" if v >= 0 else "\u2212") + shown
            bw = max(0.5, cw * 0.94)
            prims.text(slide, Box(cx - bw / 2, y_of(max(start, end)) - 0.235,
                                  bw, 0.20), txt, lsize, theme.palette.ink2, theme,
                       align="c", anchor="b", line_spacing=1.0)
        for i in range(1, n):
            level = levels[i][0]
            x0 = plot_x + (i - 0.5) * cw + bar_w / 2
            x1 = plot_x + (i + 0.5) * cw - bar_w / 2
            if x1 - x0 > 0.01:
                prims.rule(slide, x0, y_of(level), x1 - x0,
                           tint(theme.palette.muted, 0.55), 0.5)


# --------------------------------------------------------------------------- #
# scatter
# --------------------------------------------------------------------------- #
def _xy_points(spec: dict, series: dict) -> List[Tuple[float, float]]:
    if series.get("x") is not None:
        xs = [float(v) for v in series["x"]]
        ys = [float(v) for v in series["values"]]
    elif series["values"] and isinstance(series["values"][0], (list, tuple)):
        return [(float(p[0]), float(p[1])) for p in series["values"]]
    elif spec.get("categories"):
        xs = [float(v) for v in spec["categories"]]
        ys = [float(v) for v in series["values"]]
    else:
        raise ValueError("scatter series need (x, y) pairs, an 'x' list, "
                         "or numeric categories")
    if len(xs) != len(ys):
        raise ValueError(f"scatter series {series.get('name')!r} has {len(xs)} x "
                         f"values but {len(ys)} y values")
    return list(zip(xs, ys))


def _xy_axes(chart) -> Tuple[ValueAxis, ValueAxis]:
    pa = chart._chartSpace.chart.plotArea
    by_pos = {ax.find(qn("c:axPos")).get("val"): ax
              for ax in pa.findall(qn("c:valAx"))}
    return ValueAxis(by_pos["b"]), ValueAxis(by_pos["l"])


def _scatter(slide, box: Box, spec: dict, theme: Theme) -> None:
    specs = spec["series"]
    points = [_xy_points(spec, s) for s in specs]
    xs = [p[0] for pts in points for p in pts]
    ys = [p[1] for pts in points for p in pts]
    fmt = spec.get("label_fmt") or "#,##0"
    ax_fmt = spec.get("axis_fmt") or fmt
    label = _label_mode(spec, "scatter")
    legend = (spec.get("legend") if spec.get("legend") is not None
              else len(specs) > 1 and label == "none")
    quad = bool(spec.get("quadrants"))
    hi, hmode = _highlight(spec, [str(s.get("name", "")) for s in specs], [],
                           point=len(specs) == 1,
                           n_points=len(points[0]) if points else 0)

    def bounds(values, lo, hi_, pad=0.08):
        a, b = min(values), max(values)
        span = (b - a) or (abs(b) or 1.0)
        lo = a - pad * span if lo is None else float(lo)
        hi_ = b + pad * span if hi_ is None else float(hi_)
        return (0.0 if lo >= 0 else -_nice_ceil(-lo)), _nice_ceil(hi_)

    x0, x1 = bounds(xs, spec.get("x_min"), spec.get("x_max"))
    y0, y1 = bounds(ys, spec.get("value_min"), spec.get("value_max"))
    if x1 <= x0:
        x1 = x0 + 1.0
    if y1 <= y0:
        y1 = y0 + 1.0
    ins_t = _band(spec, legend) + (0.16 if label != "none" else 0.0)
    if quad:
        ins_l = 0.55 if spec.get("y_label") else 0.10
        ins_r, ins_b = 0.12, (0.38 if spec.get("x_label") else 0.10)
    else:
        ins_l = max(0.16, max((textfit.one_line(_sample(ax_fmt, v), 8.0,
                                                theme.font) for v in (y0, y1)),
                              default=0.0) + 0.16)
        ins_r, ins_b = 0.16, 0.34 + (0.22 if spec.get("x_label") else 0.0)
    plot = Box(box.x + ins_l, box.y + ins_t, box.w - ins_l - ins_r,
               box.h - ins_t - ins_b)
    qx = min(max(float(spec.get("quadrant_x", (x0 + x1) / 2)), x0), x1)
    qy = min(max(float(spec.get("quadrant_y", (y0 + y1) / 2)), y0), y1)
    if quad:
        prims.vrule(slide, plot.x + (qx - x0) / (x1 - x0) * plot.w, plot.y,
                    plot.h, theme.palette.rule, 0.5)
        prims.rule(slide, plot.x, plot.y + (y1 - qy) / (y1 - y0) * plot.h,
                   plot.w, theme.palette.rule, 0.5)
    if spec.get("x_label"):
        prims.text(slide, Box(plot.x, plot.b + 0.10, plot.w, 0.24),
                   str(spec["x_label"]), 9, theme.palette.muted, theme, align="c")
    if spec.get("y_label"):
        cx, cy = plot.x - 0.30, plot.y + plot.h / 2.0
        tb = prims.text(slide, Box(cx - plot.h / 2.0, cy - 0.11, plot.h, 0.22),
                        str(spec["y_label"]), 9, theme.palette.muted, theme,
                        align="c", anchor="m", wrap=False)
        prims.rotate(tb, 270)

    data = XyChartData()
    for s, pts in zip(specs, points):
        sd = data.add_series(str(s.get("name", "")))
        for x, y in pts:
            sd.add_data_point(x, y)
    chart = slide.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER, Inches(box.x),
                                   Inches(box.y), Inches(box.w), Inches(box.h),
                                   data).chart
    _frame(chart, box, (ins_l, ins_t, ins_r, ins_b), theme)
    xax, yax = _xy_axes(chart)
    _scale(xax, x0, x1)
    _scale(yax, y0, y1)
    if quad:
        for ax in (xax, yax):
            ax.visible = False
            ax.has_major_gridlines = False
    else:
        _axis(xax, theme, False, True, ax_fmt)
        _no_rotate(xax)
        _axis(yax, theme, False, True, ax_fmt, bool(spec.get("horizontal_gridlines")))
    if hmode == "series" and hi is not None:
        cols = [theme.accent if i == hi else _context(theme, i)
                for i in range(len(specs))]
    else:
        cols = [s.get("colour") or theme.series_color(i) for i, s in enumerate(specs)]
        if len(specs) == 1 and hmode == "point" and hi is not None:
            cols = [_context(theme, 0)]
    for i, s in enumerate(specs):
        ser = chart.series[i]
        _marker(ser, cols[i])
        if hmode == "point" and hi is not None and i == 0:
            m = ser.points[hi].marker
            m.style, m.size = XL_MARKER_STYLE.CIRCLE, 11
            m.format.fill.solid()
            m.format.fill.fore_color.rgb = _rgb(theme.accent)
            m.format.line.fill.background()
        names = s.get("point_labels") or spec.get("point_labels")
        if names:
            for j, name in enumerate(names[:len(points[i])]):
                dl = ser.points[j].data_label
                dl.has_text_frame = True
                dl.text_frame.text = str(name)
                dl.position = XL_LABEL_POSITION.ABOVE
                dl.font.name, dl.font.size = theme.font, Pt(8)
                dl.font.color.rgb = _rgb(theme.palette.ink2)
        if label != "none":
            _labels(ser, theme, XL_LABEL_POSITION.RIGHT, fmt, 8.0,
                    theme.palette.ink2)
    if legend:
        _legend(chart, theme, box,
                [str(sr.get("name") or f"Series {k + 1}")
                 for k, sr in enumerate(spec.get("series") or [])])
    else:
        chart.has_legend = False


# --------------------------------------------------------------------------- #
# public entry point
# --------------------------------------------------------------------------- #
def build(slide: Slide, box: Box, spec: dict, theme: Theme) -> None:
    """Draw the chart described by ``spec`` to fill ``box``. Returns ``None``."""
    kind = str(spec.get("kind", "")).strip().lower()
    if kind not in _KINDS:
        raise ValueError(f"unknown chart kind {kind!r}; allowed: {', '.join(_KINDS)}")
    series = list(spec.get("series") or [])
    if not series:
        raise ValueError("chart needs at least one series with values")
    if kind != "scatter":
        cats = list(spec.get("categories") or [])
        if not cats:
            raise ValueError(f"{kind} chart needs a non-empty 'categories' list")
        for s in series:
            if len(s.get("values") or []) != len(cats):
                raise ValueError(f"series {s.get('name')!r} has "
                                 f"{len(s.get('values') or [])} values but there "
                                 f"are {len(cats)} categories")
    if kind == "scatter":
        _scatter(slide, box, spec, theme)
    elif kind == "waterfall":
        _waterfall(slide, box, spec, theme)
    else:
        _category(slide, box, spec, theme, kind)
