"""Static quality checks: geometry, density, wording, data hygiene.

These run on the build log (measured boxes, not guesses) so they catch the
mistakes a render would show you, without needing a render.
"""
from __future__ import annotations

import re
from typing import Dict, List

from .theme import CONTENT_W, MARGIN_L, MARGIN_R, PAGE_H, PAGE_W

_BODY_BOTTOM_LIMIT = PAGE_H - 0.55      # nothing may intrude into the footer band
_TITLE_SOFT = 95
_TITLE_HARD = 118
_MAX_BULLETS = 6
_MAX_WORDS = 170
_MIN_FONT = 8.0
_TARGET_SLIDES = 18      # above this, the delete test is overdue


def _box_of(entry) -> tuple:
    b = entry.get("box")
    if b is None:
        return (0, 0, 0, 0)
    return (b.x, b.y, b.w, b.h)


def check(spec: dict, ctx, prs) -> List[dict]:
    out: List[dict] = []
    slides = spec.get("slides") or []
    meta = spec.get("meta") or {}

    def add(no: int, level: str, code: str, msg: str) -> None:
        out.append(dict(slide=no, level=level, code=code, msg=msg))

    # ---- deck-level economy --------------------------------------------- #
    cap = meta.get("max_slides")
    if cap is not None:
        try:
            cap = int(cap)
        except (TypeError, ValueError):
            add(0, "warn", "max-slides", "meta.max_slides is not an integer; ignored")
            cap = None
    if cap is not None and len(slides) > cap:
        add(0, "error", "too-many-slides",
            f"{len(slides)} slides exceeds meta.max_slides={cap}; delete or merge")
    elif cap is None and len(slides) > _TARGET_SLIDES:
        add(0, "warn", "long-deck",
            f"{len(slides)} slides; run the delete test (most decks land under {_TARGET_SLIDES})")

    # a divider costs a full page: it has to cover a section worth navigating
    for i, s in enumerate(slides):
        if s.get("layout") != "section":
            continue
        covered = 0
        j = i + 1
        while j < len(slides) and slides[j].get("layout") not in ("section", "end"):
            covered += 1
            j += 1
        if covered < 2:
            add(i + 1, "warn", "thin-section",
                f"divider covers {covered} page(s); it costs a page and carries no content — "
                "remove it and let the kicker do the work")

    # ---- per-slide authoring checks ------------------------------------- #
    seen: Dict[str, int] = {}
    for i, s in enumerate(slides, start=1):
        layout = s.get("layout", "content")
        title = (s.get("title") or "").strip()
        if layout in ("content", "summary", "agenda") and title:
            n = len(title)
            if n > _TITLE_HARD:
                add(i, "error", "title-long", f"action title is {n} chars (hard max {_TITLE_HARD}); cut it")
            elif n > _TITLE_SOFT:
                add(i, "warn", "title-long", f"action title is {n} chars (aim <{_TITLE_SOFT})")
            if title.endswith("."):
                add(i, "warn", "title-period", "action titles take no full stop")
            if title.isupper():
                add(i, "warn", "title-caps", "action title is in capitals; use sentence case")
            if len(title.split()) < 3:
                add(i, "warn", "title-terse", "title is too short to carry a message")
            key = title.lower()
            if key in seen:
                add(i, "warn", "title-dup", f"same title as slide {seen[key]}")
            seen[key] = i
        if layout == "section":
            continue

        # density
        words = _count_words(s)
        if words > _MAX_WORDS:
            add(i, "warn", "dense", f"~{words} words on this slide; split it")
        if layout == "summary" and len(s.get("messages", [])) > 4:
            add(i, "warn", "summary-count", "executive summary should carry 3-4 messages")

        # data hygiene
        if _has_data(s) and not s.get("source"):
            add(i, "warn", "no-source", "chart/table/KPI slide has no source line")

    # ---- geometry checks from the build log ----------------------------- #
    by_slide: Dict[int, List[dict]] = {}
    for e in ctx.log:
        by_slide.setdefault(e.get("slide", 0), []).append(e)

    for no, entries in by_slide.items():
        boxes = []
        for e in entries:
            x, y, w, h = _box_of(e)
            if w <= 0 or h <= 0:
                continue
            if e.get("kind") == "slot":
                if x < MARGIN_L - 0.02 or x + w > PAGE_W - MARGIN_R + 0.02:
                    add(no, "error", "margin", f"slot {e.get('name')} breaks the side margin")
                if y + h > _BODY_BOTTOM_LIMIT + 0.02:
                    add(no, "error", "footer", f"slot {e.get('name')} runs into the footer band")
                boxes.append((e.get("name"), x, y, w, h))
            if e.get("kind") == "table":
                if y + h > _BODY_BOTTOM_LIMIT + 0.02:
                    add(no, "error", "footer", "table runs into the footer band")
        # slots must not overlap
        for a in range(len(boxes)):
            for b in range(a + 1, len(boxes)):
                _, ax, ay, aw, ah = boxes[a]
                _, bx, by, bw, bh = boxes[b]
                ox = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
                oy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
                if ox > 0.02 and oy > 0.02:
                    add(no, "error", "overlap",
                        f"slots {boxes[a][0]} and {boxes[b][0]} overlap by "
                        f"{ox:.2f}x{oy:.2f}in")

    # keep only the strongest message per (slide, code)
    dedup: Dict[tuple, dict] = {}
    for p in out:
        dedup.setdefault((p["slide"], p["code"], p["msg"]), p)
    return list(dedup.values())


def _count_words(s: dict) -> int:
    n = 0

    def walk(node) -> None:
        nonlocal n
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("text", "title", "takeaway", "lead", "subtitle", "label", "banner"):
                    if isinstance(v, str):
                        n += len(v.split())
                else:
                    walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, str):
            n += len(node.split())

    for key in ("slots", "messages", "banner", "block"):
        walk(s.get(key))
    if s.get("title"):
        n += len(str(s["title"]).split())
    if s.get("takeaway"):
        n += len(str(s["takeaway"]).split())
    return n


def _has_data(s: dict) -> bool:
    def walk(node) -> bool:
        if isinstance(node, dict):
            if node.get("kind") in ("chart", "table", "kpi"):
                return True
            return any(walk(v) for v in node.values())
        if isinstance(node, list):
            return any(walk(v) for v in node)
        return False

    return walk(s.get("slots") or s.get("block") or {})


WEIGHTS = {"error": 12, "warn": 2}


def score(problems: List[dict], n_slides: int) -> int:
    penalty = sum(WEIGHTS.get(p["level"], 1) for p in problems)
    return max(0, min(100, 100 - penalty))
