"""Low-level drawing helpers. Nothing here knows about consulting content.

Conventions
-----------
* every geometry argument is in **inches** and is a plain float
* colour arguments are hex strings without ``#``
* text is placed with zero internal margins and top anchoring, so a box's
  measured height is the space the text actually occupies
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Sequence, Tuple

from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls, qn
from pptx.util import Emu, Inches, Pt

from . import textfit
from .theme import Theme


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float

    @property
    def r(self) -> float:
        return self.x + self.w

    @property
    def b(self) -> float:
        return self.y + self.h

    def inset(self, left: float = 0.0, top: float = 0.0,
              right: Optional[float] = None, bottom: Optional[float] = None) -> "Box":
        right = left if right is None else right
        bottom = top if bottom is None else bottom
        return Box(self.x + left, self.y + top, self.w - left - right, self.h - top - bottom)

    def pad(self, amount: float) -> "Box":
        return self.inset(amount, amount, amount, amount)

    def split_h(self, fraction: float, gap: float = 0.0) -> Tuple["Box", "Box"]:
        left = Box(self.x, self.y, self.w * fraction - gap / 2, self.h)
        right = Box(self.x + self.w * fraction + gap / 2, self.y,
                    self.w * (1 - fraction) - gap / 2, self.h)
        return left, right

    def split_v(self, fraction: float, gap: float = 0.0) -> Tuple["Box", "Box"]:
        top = Box(self.x, self.y, self.w, self.h * fraction - gap / 2)
        bottom = Box(self.x, self.y + self.h * fraction + gap / 2,
                     self.w, self.h * (1 - fraction) - gap / 2)
        return top, bottom

    def cols(self, n: int, gap: float = 0.18) -> list["Box"]:
        w = (self.w - gap * (n - 1)) / n
        return [Box(self.x + i * (w + gap), self.y, w, self.h) for i in range(n)]

    def cover(self, other: "Box") -> "Box":
        """This box scaled/cropped to exactly fill `other` (same aspect logic as images)."""
        return other


# --------------------------------------------------------------------------- #
# colour / fill plumbing
# --------------------------------------------------------------------------- #
def _rgb(hexstr: str) -> RGBColor:
    h = hexstr.lstrip("#")
    return RGBColor.from_string(h.upper())


def _replace_fill(shape, xml: str) -> None:
    spPr = shape.fill._xPr
    for tag in ("a:noFill", "a:solidFill", "a:gradFill", "a:pattFill", "a:blipFill"):
        for el in spPr.findall(qn(tag)):
            spPr.remove(el)
    spPr.insert_element_before(parse_xml(xml), "a:ln")


def solid(shape, colour: str) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(colour)


def solid_alpha(shape, colour: str, alpha: float) -> None:
    """alpha in 0..1."""
    _replace_fill(
        shape,
        f'<a:solidFill {nsdecls("a")}><a:srgbClr val="{colour.lstrip("#").upper()}">'
        f'<a:alpha val="{int(round(alpha * 100000))}"/></a:srgbClr></a:solidFill>',
    )


def gradient(shape, stops: Sequence[Tuple[float, str, float]], angle: float = 0.0) -> None:
    """stops: [(position 0..1, hex, alpha 0..1)]. angle in degrees, 0 = left->right."""
    gs = "".join(
        f'<a:gs pos="{int(round(p * 100000))}"><a:srgbClr val="{c.lstrip("#").upper()}">'
        f'<a:alpha val="{int(round(a * 100000))}"/></a:srgbClr></a:gs>'
        for p, c, a in stops
    )
    xml = (f'<a:gradFill {nsdecls("a")} rotWithShape="1"><a:gsLst>{gs}</a:gsLst>'
           f'<a:lin ang="{int(angle * 60000)}" scaled="0"/></a:gradFill>')
    _replace_fill(shape, xml)


def no_line(shape) -> None:
    shape.line.fill.background()


def line(shape, colour: str, weight_pt: float = 0.75, dash: Optional[str] = None) -> None:
    shape.line.color.rgb = _rgb(colour)
    shape.line.width = Pt(weight_pt)
    if dash:
        from pptx.enum.dml import MSO_LINE_DASH_STYLE
        shape.line.dash_style = getattr(MSO_LINE_DASH_STYLE, dash)


def no_shadow(shape) -> None:
    """Remove every inherited effect, including the theme's shape style."""
    sp = shape._element
    style = sp.find(qn("p:style"))
    if style is not None:
        sp.remove(style)
    try:
        shape.shadow.inherit = False
    except Exception:  # text boxes on some python-pptx versions
        spPr = sp.spPr
        if spPr.find(qn("a:effectLst")) is None:
            spPr.append(parse_xml(f'<a:effectLst {nsdecls("a")}/>'))


# --------------------------------------------------------------------------- #
# shapes
# --------------------------------------------------------------------------- #
def shape(slide, box: Box, kind=MSO_SHAPE.RECTANGLE, fill: Optional[str] = None,
          alpha: Optional[float] = None, outline: Optional[str] = None,
          weight: float = 0.75, radius: Optional[float] = None,
          dash: Optional[str] = None, adj: Optional[Sequence[float]] = None):
    s = slide.shapes.add_shape(kind, Inches(box.x), Inches(box.y), Inches(box.w), Inches(box.h))
    no_shadow(s)
    if fill is None:
        s.fill.background()
    elif alpha is not None:
        solid_alpha(s, fill, alpha)
    else:
        solid(s, fill)
    if outline is None:
        no_line(s)
    else:
        line(s, outline, weight, dash)
    if radius is not None and kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = max(0.0, min(0.5, radius / max(0.01, min(box.w, box.h))))
    if adj:
        for i, v in enumerate(adj):
            s.adjustments[i] = v
    s.text_frame.word_wrap = True
    return s


def rect(slide, box: Box, fill: str, **kw):
    return shape(slide, box, MSO_SHAPE.RECTANGLE, fill=fill, **kw)


def rule(slide, x: float, y: float, w: float, colour: str, weight: float = 0.75) -> None:
    ln = slide.shapes.add_connector(1, Inches(x), Inches(y), Inches(x + w), Inches(y))
    ln.line.color.rgb = _rgb(colour)
    ln.line.width = Pt(weight)


def vrule(slide, x: float, y: float, h: float, colour: str, weight: float = 0.75) -> None:
    ln = slide.shapes.add_connector(1, Inches(x), Inches(y), Inches(x), Inches(y + h))
    ln.line.color.rgb = _rgb(colour)
    ln.line.width = Pt(weight)


# --------------------------------------------------------------------------- #
# text
# --------------------------------------------------------------------------- #
@dataclass
class Run:
    """One styling level inside a paragraph."""
    text: str
    bold: bool = False
    italic: bool = False
    colour: Optional[str] = None
    size: Optional[float] = None
    font: Optional[str] = None
    caps: bool = False
    tracking: Optional[float] = None
    link: Optional[str] = None


def _style_run(run, theme: Theme, size: float, colour: str, bold: bool = False,
               italic: bool = False, caps: bool = False, tracking: Optional[float] = None,
               font: Optional[str] = None, link: Optional[str] = None) -> None:
    f = run.font
    f.name = font or theme.font
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
    f.color.rgb = _rgb(colour)
    rPr = f._element
    if caps:
        rPr.set("cap", "all")
    tr = theme.body_tracking if tracking is None else tracking
    if abs(tr) > 1e-9:
        rPr.set("spc", str(int(round(tr * 100))))
    if link:
        rPr.set("hlinkClick", "")  # replaced below for correctness
        rPr.attrib.pop("hlinkClick", None)
        run.hyperlink.address = link


def text(slide, box: Box, content, size: float, colour: str, theme: Theme,
         bold: bool = False, italic: bool = False, align: str = "l",
         anchor: str = "t", line_spacing: float = 1.22, space_after: float = 0.0,
         caps: bool = False, tracking: Optional[float] = None, font: Optional[str] = None,
         margins: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0),
         autofit: bool = False, wrap: bool = True):
    """Add a text box. `content` is a string, a Run, or a list of paragraphs where
    each paragraph is a string, a Run, or a list of Runs."""
    tb = slide.shapes.add_textbox(Inches(box.x), Inches(box.y), Inches(box.w), Inches(box.h))
    no_shadow(tb)
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.auto_size = MSO_AUTO_SIZE.NONE
    l, t, r, b = margins
    tf.margin_left, tf.margin_top = Inches(l), Inches(t)
    tf.margin_right, tf.margin_bottom = Inches(r), Inches(b)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE,
                          "b": MSO_ANCHOR.BOTTOM}[anchor]
    al = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT,
          "j": PP_ALIGN.JUSTIFY}[align]

    paras: list = [content] if isinstance(content, (str, Run)) else list(content)
    if not paras:
        paras = [""]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = al
        p.line_spacing = line_spacing
        p.space_before = Pt(0)
        p.space_after = Pt(space_after if i < len(paras) - 1 else 0)
        runs = [para] if isinstance(para, (str, Run)) else list(para)
        for item in runs:
            r = item if isinstance(item, Run) else Run(text=str(item))
            run = p.add_run()
            run.text = r.text
            _style_run(run, theme, r.size if r.size else size,
                       r.colour or colour, r.bold or bold, r.italic or italic,
                       r.caps or caps,
                       r.tracking if r.tracking is not None else tracking,
                       r.font or font, r.link)
    return tb


# --------------------------------------------------------------------------- #
# bullets
# --------------------------------------------------------------------------- #
def _bullet_xml(kind: str, indent_in: float, colour: str) -> list[str]:
    """Return one or more drawingml snippets (each a single root element)."""
    if kind == "none":
        return [f'<a:buNone {nsdecls("a")}/>']
    if kind == "number":
        return [f'<a:buFont {nsdecls("a")} typeface="Arial"/>',
                f'<a:buAutoNum {nsdecls("a")} type="arabicPeriod" startAt="1"/>']
    char = {"dot": "\u2022", "dash": "\u2013", "square": "\u25aa"}[kind]
    return [f'<a:buClr {nsdecls("a")}><a:srgbClr val="{colour}"/></a:buClr>',
            f'<a:buFont {nsdecls("a")} typeface="Arial"/>',
            f'<a:buChar {nsdecls("a")} char="{char}"/>']


def bullets(slide, box: Box, items, size: float, colour: str, theme: Theme,
            bullet: str = "dot", indent: float = 0.20, line_spacing: float = 1.20,
            space_after: float = 6.0, lead_colour: Optional[str] = None,
            lead_bold: bool = True) -> None:
    """Bulleted list. Items are strings or dicts {lead, text, level}."""
    tb = slide.shapes.add_textbox(Inches(box.x), Inches(box.y), Inches(box.w), Inches(box.h))
    no_shadow(tb)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        if isinstance(item, dict):
            lead = item.get("lead", "")
            body = item.get("text", "")
            level = int(item.get("level", 1))
        else:
            lead, body, level = "", str(item), 1
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = line_spacing
        p.space_before = Pt(0)
        p.space_after = Pt(space_after if i < len(items) - 1 else 0)
        marL = indent if level == 1 else indent * 2
        pPr = p._pPr if p._pPr is not None else p._p.get_or_add_pPr()
        pPr.set("marL", str(int(marL * 914400)))
        pPr.set("indent", str(int(-indent * 914400)))
        for el in pPr.findall(qn("a:buNone")) + pPr.findall(qn("a:buChar")) + \
                pPr.findall(qn("a:buAutoNum")) + pPr.findall(qn("a:buFont")) + \
                pPr.findall(qn("a:buClr")):
            pPr.remove(el)
        for snippet in _bullet_xml(bullet, indent, theme.accent):
            pPr.append(parse_xml(snippet))
        if lead:
            r = p.add_run()
            r.text = lead.rstrip() + ("  " if body else "")
            _style_run(r, theme, size, lead_colour or colour, bold=lead_bold)
        if body:
            r = p.add_run()
            r.text = body
            _style_run(r, theme, size, colour, bold=False)
    return tb


# --------------------------------------------------------------------------- #
# images
# --------------------------------------------------------------------------- #
def picture(slide, path: str, box: Box, mode: str = "cover"):
    from PIL import Image
    with Image.open(path) as im:
        iw, ih = im.size
    target = box.w / box.h
    source = iw / ih
    pic = slide.shapes.add_picture(path, Inches(box.x), Inches(box.y),
                                   Inches(box.w), Inches(box.h))
    if mode == "cover":
        if source > target:            # too wide -> crop sides
            excess = (1 - target / source) / 2
            pic.crop_left = pic.crop_right = excess
        elif source < target:          # too tall -> crop top/bottom
            excess = (1 - source / target) / 2
            pic.crop_top = pic.crop_bottom = excess
    no_shadow(pic)
    return pic


def scrim(slide, box: Box, colour: str = "000000", alpha: float = 0.55) -> None:
    solid_alpha(rect(slide, box, colour), colour, alpha)


# --------------------------------------------------------------------------- #
# misc
# --------------------------------------------------------------------------- #
def notes(slide, body: str) -> None:
    if body:
        slide.notes_slide.notes_text_frame.text = body


def rotate(shape_obj, degrees: float) -> None:
    shape_obj.rotation = degrees


# --------------------------------------------------------------------------- #
# table cell rules
# --------------------------------------------------------------------------- #
_EDGE_TAG = {"L": "a:lnL", "R": "a:lnR", "T": "a:lnT", "B": "a:lnB"}
_FILL_TAGS = ("a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill",
              "a:grpFill", "a:headers", "a:extLst")


def _cell_border(cell, edge: str, colour: str, weight_pt: float) -> None:
    """Draw one edge of a table cell. python-pptx exposes no border API."""
    tag = _EDGE_TAG[edge]
    tcPr = cell._tc.get_or_add_tcPr()
    for el in tcPr.findall(qn(tag)):
        tcPr.remove(el)
    ln = parse_xml(
        f'<{tag} {nsdecls("a")} w="{max(1, int(round(weight_pt * 12700)))}" cap="flat" '
        f'cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="{colour.lstrip("#").upper()}"/>'
        f'</a:solidFill><a:prstDash val="solid"/></{tag}>')
    tcPr.insert_element_before(ln, *_FILL_TAGS)
