"""Page furniture and block composition.

A slide is a *layout* (cover, section, agenda, summary, content, end) plus, for
content slides, a set of named *slots* that each hold one *block* (text,
bullets, table, chart, diagram, image).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

from . import charts, diagrams, prims, textfit
from .prims import Box, Run
from .theme import (BODY_BOTTOM, BODY_TOP, CONTENT_W, EYEBROW_H, EYEBROW_TOP, FOOTER_Y,
                    MARGIN_L, MARGIN_R, PAGE_H, PAGE_W, RULE_Y, SIZE, TITLE_H,
                    TITLE_SOFT_CHARS, TITLE_TOP, Theme, tint, mix)

DIAGRAM_KINDS = {"kpi", "steps", "timeline", "cards", "matrix", "flow",
                 "funnel", "org", "quote", "callout", "banner"}


# --------------------------------------------------------------------------- #
# build context
# --------------------------------------------------------------------------- #
@dataclass
class Ctx:
    theme: Theme
    meta: dict
    sources: Dict[str, str] = field(default_factory=dict)
    sections: List[dict] = field(default_factory=list)
    log: List[dict] = field(default_factory=list)      # QA observations
    current: int = 0
    problems: List[dict] = field(default_factory=list)

    def note(self, kind: str, **kw) -> None:
        kw.update(slide=self.current, kind=kind)
        self.log.append(kw)

    def problem(self, level: str, code: str, msg: str) -> None:
        self.problems.append(dict(slide=self.current, level=level, code=code, msg=msg))


# --------------------------------------------------------------------------- #
# small text utilities
# --------------------------------------------------------------------------- #
def rich(value: str, colour: Optional[str] = None, bold_colour: Optional[str] = None) -> List[Run]:
    """Parse minimal inline markup: ``**bold**`` segments become bold runs."""
    parts = str(value).split("**")
    runs: List[Run] = []
    for i, part in enumerate(parts):
        if not part:
            continue
        runs.append(Run(part, bold=(i % 2 == 1),
                        colour=(bold_colour or colour) if i % 2 == 1 else colour))
    return runs or [Run("")]


def rich_paragraphs(lines: Sequence[str], colour: Optional[str] = None) -> List[List[Run]]:
    return [rich(l, colour) for l in lines]


# --------------------------------------------------------------------------- #
# page furniture
# --------------------------------------------------------------------------- #
def _bg(slide, colour: str) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = prims._rgb(colour)


def _title(slide, ctx: Ctx, text: str, colour: str, top: float = TITLE_TOP,
           size: float = SIZE["title"], width: float = CONTENT_W,
           max_lines: int = 2) -> float:
    t = ctx.theme
    fit = textfit.fit(text, width, TITLE_H, size, size - 3.5, t.font,
                      bold=True, line_spacing=1.06, tracking=t.title_tracking)
    if fit.n_lines > max_lines:
        ctx.problem("error", "title-too-long",
                    f"title needs {fit.n_lines} lines at {fit.size}pt (max {max_lines}): {text[:70]!r}")
    h = min(fit.height_pt + 2, TITLE_H) / 72.0
    prims.text(slide, Box(MARGIN_L, top, width, h), "\n".join(fit.lines) or text,
               fit.size, colour, t, bold=True, line_spacing=1.06,
               tracking=t.title_tracking)
    return fit.size


def _eyebrow(slide, ctx: Ctx, text: str, colour: str, top: float = EYEBROW_TOP) -> None:
    if not text:
        return
    t = ctx.theme
    prims.text(slide, Box(MARGIN_L, top, 9.0, EYEBROW_H), text, SIZE["kicker"], colour, t,
               bold=True, caps=True, tracking=1.1)
    # small accent tick to the left of the eyebrow is drawn by the caller when wanted


def _takeaway(slide, ctx: Ctx, text: str, colour: str, top: float = 1.56) -> None:
    t = ctx.theme
    size = SIZE["subtitle"]
    fit = textfit.fit(text, CONTENT_W, 0.46, size, 10.0, t.font, line_spacing=1.18)
    prims.text(slide, Box(MARGIN_L, top, CONTENT_W, fit.height_pt / 72.0 + 0.02),
               "\n".join(fit.lines), fit.size, colour, t, line_spacing=1.18)


def _footer(slide, ctx: Ctx, page_no: int, source: Optional[str], section: Optional[str],
            dark: bool = False) -> None:
    t, p = ctx.theme, ctx.theme.palette
    if not ctx.meta.get("footer", True):
        return
    rule_c = mix(p.rule, "FFFFFF", 0.55) if dark else p.rule
    text_c = mix(p.muted, "FFFFFF", 0.35) if dark else p.muted
    prims.rule(slide, MARGIN_L, RULE_Y, CONTENT_W, rule_c, 0.75)
    if source:
        label = ctx.sources.get(source, source)
        prims.text(slide, Box(MARGIN_L, FOOTER_Y, 9.3, 0.22),
                   f"Source: {label}" if not label.lower().startswith("source:") else label,
                   SIZE["micro"], text_c, t)
    if section:
        prims.text(slide, Box(MARGIN_L + 9.3, FOOTER_Y, 2.05, 0.22), section.upper(),
                   SIZE["micro"], text_c, t, align="r", caps=True, tracking=0.6)
    if ctx.meta.get("page_numbers", True) and page_no > 1:
        prims.text(slide, Box(PAGE_W - MARGIN_R - 0.5, FOOTER_Y, 0.5, 0.22), str(page_no),
                   SIZE["micro"], text_c, t, align="r")


def page_chrome(slide, ctx: Ctx, page_no: int, *, title: str = "", kicker: str = "",
                takeaway: str = "", source: Optional[str] = None,
                section: Optional[str] = None) -> None:
    t, p = ctx.theme, ctx.theme.palette
    _bg(slide, p.bg)
    if kicker:
        _eyebrow(slide, ctx, kicker, p.accent)
    _title(slide, ctx, title, p.ink)
    if takeaway:
        _takeaway(slide, ctx, takeaway, p.ink2)
    _footer(slide, ctx, page_no, source, section)


# --------------------------------------------------------------------------- #
# layouts
# --------------------------------------------------------------------------- #
def cover(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    t, p = ctx.theme, ctx.theme.palette
    dark = ctx.meta.get("cover_style", "dark") == "dark"
    _bg(slide, p.ink if dark else p.bg)
    fg = "FFFFFF" if dark else p.ink
    sub = mix(p.rule, "FFFFFF", 0.35) if dark else p.ink2

    if dark:
        # a single restrained accent band anchors the type block
        prims.rect(slide, Box(0, 0, 0.16, PAGE_H), p.accent)
    else:
        prims.rect(slide, Box(MARGIN_L, 0.9, 1.1, 0.05), p.accent)

    eyebrow = s.get("eyebrow") or ctx.meta.get("client", "")
    if eyebrow:
        prims.text(slide, Box(MARGIN_L, 2.02, 9.0, 0.24), eyebrow, SIZE["kicker"], p.accent, t,
                   bold=True, caps=True, tracking=1.4)

    title = s.get("title", ctx.meta.get("title", ""))
    fit = textfit.fit(title, 10.6, 2.0, SIZE["cover_title"], 26.0, t.font,
                      bold=True, line_spacing=1.04, tracking=-0.6)
    prims.text(slide, Box(MARGIN_L, 2.36, 10.6, fit.height_pt / 72.0 + 0.05),
               "\n".join(fit.lines), fit.size, fg, t, bold=True, line_spacing=1.04,
               tracking=-0.6)

    y = 2.42 + fit.height_pt / 72.0 + 0.24
    sub_text = s.get("subtitle", ctx.meta.get("subtitle", ""))
    if sub_text:
        f2 = textfit.fit(sub_text, 10.0, 1.0, SIZE["cover_sub"], 10.5, t.font, line_spacing=1.26)
        prims.text(slide, Box(MARGIN_L, y, 10.0, f2.height_pt / 72.0 + 0.04),
                   "\n".join(f2.lines), f2.size, sub, t, line_spacing=1.26)
        y += f2.height_pt / 72.0 + 0.1

    bottom = PAGE_H - 1.02
    prims.rule(slide, MARGIN_L, bottom, CONTENT_W, mix(p.rule, "FFFFFF", 0.55) if dark else p.rule)
    left = "  |  ".join(x for x in [s.get("date") or ctx.meta.get("date", ""),
                                    s.get("author") or ctx.meta.get("author", "")] if x)
    right = s.get("client") or ctx.meta.get("client", "")
    prims.text(slide, Box(MARGIN_L, bottom + 0.12, 6.0, 0.24), left, SIZE["small"],
               mix(p.muted, "FFFFFF", 0.4) if dark else p.muted, t)
    if right:
        prims.text(slide, Box(PAGE_W - MARGIN_R - 6.0, bottom + 0.12, 6.0, 0.24), right,
                   SIZE["small"], mix(p.muted, "FFFFFF", 0.4) if dark else p.muted, t,
                   align="r")
    conf = ctx.meta.get("confidentiality", "")
    if conf:
        prims.text(slide, Box(MARGIN_L, bottom + 0.44, CONTENT_W, 0.2), conf, 7.5,
                   mix(p.muted, "FFFFFF", 0.15) if dark else p.muted, t, caps=True,
                   tracking=0.8)
    prims.notes(slide, s.get("notes", ""))


def section(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    t, p = ctx.theme, ctx.theme.palette
    _bg(slide, p.ink)
    num_size = SIZE["divider_num"] * 0.9
    number = s.get("number", "")
    label = s.get("label", "")
    title = s.get("title", "")
    fit = textfit.fit(title, 10.4, 1.7, SIZE["divider_title"], 20.0, t.font,
                      bold=True, line_spacing=1.06, tracking=-0.6)
    title_h = fit.height_pt / 72.0

    num_h = num_size * 1.12 / 72.0 if number else 0.0
    label_h = 0.24 if label else 0.0
    sub_h = 0.34 if s.get("subtitle") else 0.0
    gap1 = 0.10 if number else 0.0
    gap2 = 0.26
    total = num_h + gap1 + label_h + gap2 + title_h + (0.24 + sub_h if sub_h else 0)
    y = max(1.6, (PAGE_H - total) / 2.0 - 0.15)

    if number:
        prims.text(slide, Box(MARGIN_L, y, 4.0, num_h), number, num_size, p.accent, t,
                   bold=True, tracking=-1.5, line_spacing=1.0)
        y += num_h + gap1
    else:
        prims.rect(slide, Box(MARGIN_L, y + 0.1, 0.9, 0.05), p.accent)
        y += 0.3
    if label:
        prims.text(slide, Box(MARGIN_L, y, 6.0, label_h), label, SIZE["kicker"], p.accent, t,
                   bold=True, caps=True, tracking=1.4)
        y += label_h
    y += gap2
    prims.text(slide, Box(MARGIN_L, y, 10.4, title_h + 0.04), "\n".join(fit.lines), fit.size,
               "FFFFFF", t, bold=True, line_spacing=1.06, tracking=-0.6)
    if s.get("subtitle"):
        yy = y + title_h + 0.22
        f2 = textfit.fit(s["subtitle"], 9.6, 0.7, 13.5, 9.5, t.font, line_spacing=1.3)
        prims.text(slide, Box(MARGIN_L, yy, 9.6, f2.height_pt / 72.0 + 0.03),
                   "\n".join(f2.lines), f2.size, mix(p.rule, "FFFFFF", 0.3), t, line_spacing=1.3)
    if ctx.meta.get("page_numbers", True):
        prims.text(slide, Box(PAGE_W - MARGIN_R - 0.6, FOOTER_Y, 0.6, 0.22), str(page_no),
                   SIZE["micro"], mix(p.muted, "FFFFFF", 0.3), t, align="r")
    prims.notes(slide, s.get("notes", ""))


def agenda(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    t, p = ctx.theme, ctx.theme.palette
    page_chrome(slide, ctx, page_no, title=s.get("title", "Agenda"),
                takeaway=s.get("takeaway", ""), kicker=s.get("kicker", ""),
                source=s.get("source"))
    body = Box(MARGIN_L, BODY_TOP, CONTENT_W, BODY_BOTTOM - BODY_TOP)
    items = s.get("items") or [
        {"number": sec.get("number", f"{i+1:02d}"), "title": sec.get("title", ""),
         "page": sec.get("page")}
        for i, sec in enumerate(ctx.sections)
    ]
    n = max(1, len(items))
    row_h = min(0.86, body.h / n)
    for i, item in enumerate(items):
        y = body.y + i * row_h
        prims.rule(slide, body.x, y, body.w, p.rule, 0.75)
        prims.text(slide, Box(body.x, y + 0.16, 0.9, 0.4), str(item.get("number", f"{i+1:02d}")),
                   SIZE["h2"], p.accent, t, bold=True)
        prims.text(slide, Box(body.x + 0.9, y + 0.14, 8.6, 0.42), item.get("title", ""),
                   SIZE["h2"], p.ink, t, bold=True)
        if item.get("page"):
            prims.text(slide, Box(body.x + body.w - 0.8, y + 0.16, 0.8, 0.36),
                       str(item["page"]), SIZE["body"], p.muted, t, align="r")
        if item.get("text"):
            prims.text(slide, Box(body.x + 0.9, y + 0.56, 10.4, 0.26), item["text"],
                       SIZE["small"], p.muted, t)
    prims.notes(slide, s.get("notes", ""))


def summary(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    t, p = ctx.theme, ctx.theme.palette
    page_chrome(slide, ctx, page_no, title=s.get("title", "Executive summary"),
                kicker=s.get("kicker", ""), takeaway=s.get("takeaway", ""),
                source=s.get("source"), section=s.get("section"))
    body = Box(MARGIN_L, BODY_TOP, CONTENT_W, BODY_BOTTOM - BODY_TOP)
    messages = s.get("messages", [])
    banner = s.get("banner")
    if banner:
        body, ban = body.split_v(0.80, 0.22)
    else:
        ban = None
    n = max(1, len(messages))
    row_h = body.h / n
    for i, m in enumerate(messages):
        y = body.y + i * row_h
        if i:
            prims.rule(slide, body.x, y - 0.02, body.w, p.rule, 0.75)
        # number
        circ = prims.shape(slide, Box(body.x + 0.02, y + 0.16, 0.34, 0.34),
                           prims.MSO_SHAPE.OVAL, outline=p.accent, weight=1.0)
        prims.text(slide, Box(body.x + 0.02, y + 0.205, 0.34, 0.26), str(i + 1), 10.5,
                   p.accent, t, bold=True, align="c")
        tx = body.x + 0.58
        tw = body.w - 0.58
        lead = m.get("lead", "")
        text = m.get("text", "")
        prims.text(slide, Box(tx, y + 0.13, tw, 0.3), lead, 13.0, p.ink, t, bold=True)
        if text:
            fit = textfit.fit(text, tw, row_h - 0.52, SIZE["body"], 9.0, t.font, line_spacing=1.24)
            prims.text(slide, Box(tx, y + 0.45, tw, fit.height_pt / 72.0 + 0.04),
                       "\n".join(fit.lines), fit.size, p.ink2, t, line_spacing=1.24)
    if ban:
        prims.rect(slide, ban, p.tint)
        prims.rect(slide, Box(ban.x, ban.y, 0.055, ban.h), p.accent)
        label = s.get("banner_label", "So what")
        prims.text(slide, Box(ban.x + 0.22, ban.y + 0.13, 5.0, 0.2), label, SIZE["kicker"],
                   p.accent, t, bold=True, caps=True, tracking=1.1)
        f = textfit.fit(banner, ban.w - 0.5, ban.h - 0.36, 12.5, 9.5, t.font, line_spacing=1.2)
        prims.text(slide, Box(ban.x + 0.22, ban.y + 0.34, ban.w - 0.45, f.height_pt / 72.0 + 0.04),
                   "\n".join(f.lines), f.size, p.ink, t, line_spacing=1.2)
    prims.notes(slide, s.get("notes", ""))


def end(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    t, p = ctx.theme, ctx.theme.palette
    _bg(slide, p.ink)
    prims.rect(slide, Box(0, 0, 0.16, PAGE_H), p.accent)
    title = s.get("title", "Thank you")
    prims.text(slide, Box(MARGIN_L, 2.55, 9.0, 0.9), title, SIZE["cover_title"], "FFFFFF",
               t, bold=True, tracking=-0.6)
    if s.get("subtitle"):
        prims.text(slide, Box(MARGIN_L, 3.55, 9.0, 0.9), s["subtitle"], 14.0,
                   mix(p.rule, "FFFFFF", 0.3), t, line_spacing=1.3)
    contact = s.get("contact") or ctx.meta.get("author", "")
    if contact:
        prims.rule(slide, MARGIN_L, PAGE_H - 1.5, 3.0, p.accent, 0.75)
        prims.text(slide, Box(MARGIN_L, PAGE_H - 1.38, 8.0, 0.5), contact, SIZE["small"],
                   mix(p.rule, "FFFFFF", 0.2), t)
    prims.notes(slide, s.get("notes", ""))


# --------------------------------------------------------------------------- #
# content slides: slot resolution
# --------------------------------------------------------------------------- #
def _slots(body: Box, keys: Sequence[str], s: dict) -> Dict[str, Box]:
    keys = set(keys)
    if keys == {"full"}:
        return {"full": body}
    if keys == {"left", "right"}:
        l, r = body.split_h(float(s.get("split", 0.5)), 0.42)
        return {"left": l, "right": r}
    if keys == {"top", "bottom"}:
        t_, b_ = body.split_v(float(s.get("split_v", 0.55)), 0.22)
        return {"top": t_, "bottom": b_}
    if keys == {"top", "left", "right"}:
        t_, rest = body.split_v(float(s.get("split_v", 0.42)), 0.22)
        l, r = rest.split_h(float(s.get("split", 0.5)), 0.42)
        return {"top": t_, "left": l, "right": r}
    if keys == {"top", "col1", "col2", "col3"}:
        t_, rest = body.split_v(float(s.get("split_v", 0.38)), 0.22)
        cs = rest.cols(3, 0.30)
        return {"top": t_, "col1": cs[0], "col2": cs[1], "col3": cs[2]}
    if keys <= {"col1", "col2", "col3"}:
        n = len(keys)
        cs = body.cols(n, 0.30)
        names = ["col1", "col2", "col3"][:n]
        return dict(zip(names, cs))
    if keys == {"left", "right", "bottom"}:
        top, bottom = body.split_v(1 - float(s.get("split_v", 0.30)), 0.22)
        l, r = top.split_h(float(s.get("split", 0.5)), 0.42)
        return {"left": l, "right": r, "bottom": bottom}
    raise ValueError(
        f"unsupported slot combination {sorted(keys)}; use full | left+right | "
        "top+bottom | top+left+right | top+col1..3 | col1..3 | left+right+bottom")


# --------------------------------------------------------------------------- #
# blocks
# --------------------------------------------------------------------------- #
def _bullets_block(slide, box: Box, b: dict, ctx: Ctx, colour: str) -> None:
    t = ctx.theme
    items = b.get("items", [])
    size = float(b.get("size", SIZE["body"]))
    line_spacing = float(b.get("line_spacing", 1.20))
    space = float(b.get("space_after", 7.0))
    kind = b.get("bullet", "dot")
    # shrink until the list fits, then verify
    while size > 9.0:
        h = 0.0
        for it in items:
            lead = it.get("lead", "") if isinstance(it, dict) else ""
            body = it.get("text", "") if isinstance(it, dict) else str(it)
            text = (lead + "  " + body) if lead else body
            h += textfit.needed_height(text, box.w - 0.22, size, t.font,
                                       line_spacing=line_spacing) + space / 72.0
        if h <= box.h + 1e-6:
            break
        size -= 0.5
    prims.bullets(slide, box, items, size, colour, t, bullet=kind, line_spacing=line_spacing,
                  space_after=space, lead_colour=t.palette.ink)
    if h > box.h + 0.02:
        ctx.problem("error", "text-overflow",
                    f"bulleted list overflows its slot by {h - box.h:.2f}in")


def _text_block(slide, box: Box, b: dict, ctx: Ctx, colour: str) -> None:
    t = ctx.theme
    body = b.get("text", "")
    paras = b.get("paragraphs")
    size = float(b.get("size", SIZE["body"]))
    ls = float(b.get("line_spacing", 1.26))
    space = float(b.get("space_after", 9.0))
    align = b.get("align", "l")
    if paras:
        raw = "\n\n".join(paras)
    else:
        raw = body
    fit = textfit.fit(raw, box.w, box.h, size, 8.5, t.font, line_spacing=ls,
                      bold=bool(b.get("bold")))
    blocks = ("\n".join(fit.lines)).split("\n\n")
    paragraphs = [rich(p.replace("\n", " "), colour) for p in blocks]
    prims.text(slide, Box(box.x, box.y, box.w, box.h), paragraphs, fit.size, colour, t,
               line_spacing=ls, space_after=space, align=align,
               bold=bool(b.get("bold")))
    if not fit.fits:
        ctx.problem("warn", "text-tight",
                    f"text needed shrinking to {fit.size}pt to fit ({box.w:.1f}x{box.h:.1f}in)")


def _table_block(slide, box: Box, b: dict, ctx: Ctx) -> None:
    t, p = ctx.theme, ctx.theme.palette
    cols = b.get("columns", [])
    rows = list(b.get("rows", []))
    if b.get("columns_total"):
        rows.append(list(b["columns_total"]))
    if not cols or not rows:
        raise ValueError("table block needs 'columns' and 'rows'")
    ncol, nrow = len(cols), len(rows) + 1
    size = float(b.get("size", SIZE["table"]))
    head_size = float(b.get("head_size", SIZE["table_head"]))
    col_keys = [c if isinstance(c, str) else c.get("label", "") for c in cols]
    aligns = ["l"] * ncol
    weights = [1.6] + [1.0] * (ncol - 1)
    for i, c in enumerate(cols):
        if isinstance(c, dict):
            aligns[i] = c.get("align", "l")
            weights[i] = float(c.get("width", 1.0))
    total_w = sum(weights)
    widths = [box.w * w / total_w for w in weights]

    # row heights from measured text
    pad_y = 0.075
    heights = []
    for r in [col_keys] + rows:
        hcell = 0.0
        for i, cell in enumerate(r):
            txt = "" if cell is None else str(cell)
            need = textfit.needed_height(txt, widths[i] - 0.16, size if r is not rows[0] else head_size,
                                         t.font, line_spacing=1.14)
            hcell = max(hcell, need)
        heights.append(hcell + pad_y * 2)

    table_h = sum(heights)
    # a table that fills 2/3 of its slot looks unfinished: let its rows breathe
    if b.get("stretch", True) and table_h < box.h * 0.92:
        extra = (box.h - table_h) / nrow
        heights = [h + extra for h in heights]
        table_h = sum(heights)
    if b.get("fit_height") and table_h > box.h:
        ctx.problem("error", "table-overflow",
                    f"table needs {table_h:.2f}in but slot is {box.h:.2f}in")
        scale = box.h / table_h
        heights = [x * scale for x in heights]

    if b.get("valign") == "middle" and table_h < box.h:
        box = Box(box.x, box.y + (box.h - table_h) / 2, box.w, box.h)
    gf = slide.shapes.add_table(nrow, ncol, Inches(box.x), Inches(box.y),
                                Inches(box.w), Inches(table_h))
    tbl = gf.table
    # kill the built-in style: we draw our own rules
    tblPr = tbl._tbl.tblPr
    tblPr.set("firstRow", "0")
    tblPr.set("bandRow", "0")
    # "No Style, No Grid": we draw every rule ourselves
    style_el = tblPr.find(qn("a:tableStyleId"))
    if style_el is None:
        from pptx.oxml import parse_xml as _px
        from pptx.oxml.ns import nsdecls as _ns
        style_el = _px(f'<a:tableStyleId {_ns("a")}>{{2D5ABB26-0587-4C30-8999-92F81FD0307C}}</a:tableStyleId>')
        tblPr.append(style_el)
    else:
        style_el.text = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"
    for i, w in enumerate(widths):
        tbl.columns[i].width = Inches(w)
    for i, h in enumerate(heights):
        tbl.rows[i].height = Inches(h)

    for ri in range(nrow):
        is_head = ri == 0
        is_total = (not is_head) and ri == nrow - 1 and bool(b.get("total", False))
        for ci in range(ncol):
            cell = tbl.cell(ri, ci)
            val = (col_keys if is_head else rows)[ci] if is_head else rows[ri - 1][ci]
            text = "" if val is None else str(val)
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.08)
            cell.margin_top = Inches(0.02)
            cell.margin_bottom = Inches(0.02)
            cell.vertical_anchor = prims.MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = prims._rgb("FFFFFF" if not is_total else p.tint)
            tf = cell.text_frame
            tf.word_wrap = True
            para = tf.paragraphs[0]
            para.alignment = {"l": PP_ALIGN.LEFT, "r": PP_ALIGN.RIGHT,
                              "c": PP_ALIGN.CENTER}[aligns[ci]]
            para.line_spacing = 1.14
            for part in rich(text, p.ink if (is_head or is_total) else p.ink2):
                r = para.add_run()
                r.text = part.text
                prims._style_run(r, t, head_size if is_head else size,
                                 part.colour or (p.ink if (is_head or is_total) else p.ink2),
                                 bold=is_head or is_total or ci == 0 and bool(b.get("first_col_bold", True)),
                                 caps=is_head, tracking=0.5 if is_head else 0.0)
            # borders: header bottom + hairlines, no verticals
            edges = []
            if is_head:
                edges.append(("B", p.ink, 1.0))
                edges.append(("T", "FFFFFF", 0.01))
            else:
                edges.append(("B", p.rule, 0.5))
            if is_total:
                edges.append(("T", p.ink, 1.0))
            else:
                edges.append(("T", "FFFFFF", 0.01))
            for edge, colour, wpt in edges:
                prims._cell_border(cell, edge, colour, wpt)
    ctx.note("table", box=Box(box.x, box.y, box.w, table_h), rows=nrow)
    notes = b.get("note")
    if notes:
        prims.text(slide, Box(box.x, box.y + table_h + 0.1, box.w, 0.3), notes, SIZE["micro"],
                   p.muted, t, italic=True)


def _image_block(slide, box: Box, b: dict, ctx: Ctx) -> None:
    t, p = ctx.theme, ctx.theme.palette
    path = b.get("path")
    if not path:
        raise ValueError("image block needs 'path'")
    prims.picture(slide, path, box, mode=b.get("mode", "cover"))
    if b.get("scrim"):
        prims.scrim(slide, box, b.get("scrim_colour", "000000"), float(b.get("scrim", 0.5)))
    if b.get("label"):
        prims.text(slide, Box(box.x + 0.2, box.b - 0.45, box.w - 0.4, 0.3), b["label"],
                   SIZE["small"], "FFFFFF", t)


def block(slide, box: Box, b: dict, ctx: Ctx, default_colour: Optional[str] = None) -> None:
    t, p = ctx.theme, ctx.theme.palette
    kind = b.get("kind") or b.get("block")
    colour = b.get("colour") or default_colour or p.ink
    if kind == "bullets":
        _bullets_block(slide, box, b, ctx, colour)
    elif kind in ("text", "paragraphs"):
        _text_block(slide, box, b, ctx, colour)
    elif kind == "table":
        _table_block(slide, box, b, ctx)
    elif kind == "image":
        _image_block(slide, box, b, ctx)
    elif kind == "chart":
        chart_spec = dict(b)
        chart_spec["kind"] = b.get("chart") or b.get("chart_kind")
        charts.build(slide, box, chart_spec, t)
        ctx.note("chart", box=box, chart_kind=chart_spec["kind"])
    elif kind in DIAGRAM_KINDS:
        diagrams.build(slide, box, b, t)
        ctx.note(kind, box=box)
    elif kind == "spacer":
        return
    else:
        raise ValueError(f"unknown block kind {kind!r}; expected bullets, text, table, image, "
                         f"chart or one of {sorted(DIAGRAM_KINDS)}")


def content(slide, ctx: Ctx, s: dict, page_no: int) -> None:
    p = ctx.theme.palette
    page_chrome(slide, ctx, page_no, title=s.get("title", ""),
                kicker=s.get("kicker", ""), takeaway=s.get("takeaway", ""),
                source=s.get("source"), section=s.get("section"))
    slots = s.get("slots") or {}
    if not slots and s.get("block"):
        slots = {"full": s["block"]}
    if not slots:
        return
    top = BODY_TOP if s.get("takeaway") else 1.76
    body = Box(MARGIN_L, top, CONTENT_W, BODY_BOTTOM - top)
    boxes = _slots(body, list(slots), s)
    for name, bx in boxes.items():
        spec = slots.get(name)
        if not spec:
            continue
        block(slide, bx, spec, ctx)
        ctx.note("slot", name=name, box=bx, block=spec.get("kind") or spec.get("block"))
    prims.notes(slide, s.get("notes", ""))


LAYOUTS = {"cover": cover, "section": section, "agenda": agenda, "summary": summary,
           "content": content, "end": end}
