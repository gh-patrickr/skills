#!/usr/bin/env python3
"""deckkit — build consulting-grade PowerPoint decks from a compact YAML spec.

Usage
-----
  deck.py build   deck.yaml -o deck.pptx [--review] [--strict]
  deck.py check   deck.yaml            # validate + build to a temp file, no images
  deck.py review  deck.yaml            # build + render + contact sheet + report
  deck.py outline deck.yaml            # one line per slide, for quick checking
  deck.py render  deck.pptx [--pages 1-3]
  deck.py new     [template] -o deck.yaml
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from deckkit import render as render_mod  # noqa: E402
from deckkit import spec as spec_mod  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(os.path.dirname(HERE), "templates")

GLYPH = {"error": "x", "warn": "!", "info": "i"}


def _print_report(res, verbose=True) -> None:
    status = "ok" if res.ok() else "FAILED"
    print(f"{status}: {res.path}  {res.slides} slides  {res.size_kb:.0f} KB  "
          f"{res.seconds:.1f}s  score {res.score}/100")
    shown = 0
    for p in sorted(res.problems, key=lambda x: (x["slide"], x["level"] != "error")):
        if p["level"] == "warn" and not verbose:
            continue
        print(f"  {GLYPH.get(p['level'], '?')} s{p['slide']:<3} {p['code']:<14} {p['msg']}")
        shown += 1
    if res.ok() and shown == 0:
        print("  all static checks passed")


def cmd_build(args) -> int:
    spec = spec_mod.load(args.spec)
    out = args.out or os.path.splitext(args.spec)[0] + ".pptx"
    try:
        res = spec_mod.build(spec, out)
    except spec_mod.SpecError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    _print_report(res, verbose=not args.quiet)
    if args.review:
        _review(out, os.path.splitext(out)[0] + "-preview")
    if res.errors and args.strict:
        return 1
    return 0


def cmd_check(args) -> int:
    import tempfile

    spec = spec_mod.load(args.spec)
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "check.pptx")
        try:
            res = spec_mod.build(spec, out)
        except spec_mod.SpecError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        _print_report(res, verbose=True)
    return 1 if res.errors else 0


def cmd_outline(args) -> int:
    spec = spec_mod.load(args.spec)
    errs = spec_mod.validate(spec)
    if errs:
        for e in errs:
            print(f"error: {e}")
        return 2
    meta = spec.get("meta") or {}
    slides = spec["slides"]
    cap = meta.get("max_slides")
    print(f"{meta.get('title', '(untitled)')}  |  {len(slides)} slides  |  "
          f"palette={meta.get('palette', 'navy')}"
          + (f"  |  cap {cap}" if cap else ""))
    body = sum(1 for s in slides if s.get("layout") not in ("cover", "section", "end"))
    dividers = sum(1 for s in slides if s.get("layout") == "section")
    print(f"  {body} content pages, {dividers} dividers, "
          f"{len(slides) - body - dividers} furniture (cover/end)")
    for i, s in enumerate(slides, start=1):
        layout = s.get("layout", "content")
        title = (s.get("title") or "").replace("\n", " ")
        slots = s.get("slots") or ({**({"full": s["block"]})} if s.get("block") else {})
        kinds = ",".join(f"{k}:{(v.get('kind') or v.get('block') or '')}"
                         for k, v in slots.items())
        flag = "" if len(title) <= 95 else f"  [{len(title)} chars]"
        purpose = s.get("purpose")
        print(f"{i:>2}. [{layout:<7}] {title}{flag}" + (f"   ({kinds})" if kinds else ""))
        if purpose:
            print(f"     ↳ {purpose}")
    print("\nEvery page must answer: what decision does this page move? "
          "If nothing breaks when you delete it, delete it.")
    return 0


def _review(pptx: str, prefix: str) -> None:
    if not render_mod.available():
        print("  (no LibreOffice Kit CLI found; visual review skipped)")
        return
    out_dir = prefix + "-pages"
    data = render_mod.preview(pptx, out_dir)
    print(f"  contact sheet: {data['sheet']}")
    for st in data["stats"]:
        if st["ink"] < 0.01:
            print(f"  ! s{st['page']} looks empty (ink {st['ink']})")
        elif st["ink"] < 0.25 and st["edge_ink"] > 60:
            print(f"  ! s{st['page']} has ink in the outer margin ({st['edge_ink']}px)")
    print(f"  pages: {out_dir}/page-*.png")


def cmd_review(args) -> int:
    spec = spec_mod.load(args.spec)
    out = args.out or os.path.splitext(args.spec)[0] + ".pptx"
    try:
        res = spec_mod.build(spec, out)
    except spec_mod.SpecError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    _print_report(res)
    _review(out, os.path.splitext(out)[0] + "-preview")
    return 0 if res.ok() else 1


def cmd_render(args) -> int:
    pages = None
    if args.pages:
        pages = []
        for part in str(args.pages).split(","):
            if "-" in part:
                a, b = part.split("-", 1)
                pages.extend(range(int(a), int(b) + 1))
            else:
                pages.append(int(part))
    out = args.out or (os.path.splitext(args.deck)[0] + "-pages")
    pngs = render_mod.render(args.deck, out, pages=pages)
    sheet = render_mod.montage(pngs, os.path.join(os.path.dirname(os.path.abspath(out)),
                                                  "contact-sheet.png"), cols=args.cols)
    print(f"{len(pngs)} pages -> {out}")
    print(f"contact sheet -> {sheet}")
    return 0


def cmd_new(args) -> int:
    name = args.template or "strategy-review"
    src = os.path.join(TEMPLATES, name + ".yaml")
    if not os.path.exists(src):
        avail = [os.path.splitext(f)[0] for f in sorted(os.listdir(TEMPLATES))]
        print(f"error: no template {name!r}; available: {', '.join(avail)}", file=sys.stderr)
        return 2
    out = args.out or (name + ".yaml")
    if os.path.exists(out) and not args.force:
        print(f"error: {out} exists (use --force)", file=sys.stderr)
        return 1
    with open(src, "r", encoding="utf-8") as fh:
        body = fh.read()
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(body)
    print(out)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build a deck")
    b.add_argument("spec")
    b.add_argument("-o", "--out")
    b.add_argument("--review", action="store_true", help="render + contact sheet afterwards")
    b.add_argument("--strict", action="store_true", help="exit 1 on any error")
    b.add_argument("-q", "--quiet", action="store_true", help="suppress warnings")
    b.set_defaults(func=cmd_build)

    c = sub.add_parser("check", help="validate spec and report problems")
    c.add_argument("spec")
    c.set_defaults(func=cmd_check)

    o = sub.add_parser("outline", help="print slide outline")
    o.add_argument("spec")
    o.set_defaults(func=cmd_outline)

    r = sub.add_parser("review", help="build, render and contact-sheet a deck")
    r.add_argument("spec")
    r.add_argument("-o", "--out")
    r.set_defaults(func=cmd_review)

    rr = sub.add_parser("render", help="render an existing pptx")
    rr.add_argument("deck")
    rr.add_argument("--pages")
    rr.add_argument("--out")
    rr.add_argument("--cols", type=int, default=3)
    rr.set_defaults(func=cmd_render)

    n = sub.add_parser("new", help="scaffold a spec from a template")
    n.add_argument("template", nargs="?")
    n.add_argument("-o", "--out")
    n.add_argument("--force", action="store_true")
    n.set_defaults(func=cmd_new)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
