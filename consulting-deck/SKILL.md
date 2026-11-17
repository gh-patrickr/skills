---
name: consulting-deck
description: Build board-grade PowerPoint decks (.pptx) the way a strategy consultant does — few pages, one argument, evidenced exhibits, native editable slides. Use for pitch decks, board/steering-committee decks, strategy reviews, market-entry or CDD readouts, any request for a "professional PPT" or to fix an ugly generated .pptx.
---

# Consulting deck

Produce the shortest deck that carries the argument. A partner would rather read
ten pages that decide something than thirty that describe everything. The tool in
this folder turns a compact YAML spec into a `.pptx` and checks it for you.

**Do not hand-write python-pptx code for a whole deck.** Write the spec, build, look,
fix. That is what makes this fast and consistent.

## Non-negotiables

1. **Every page earns its place.** If nothing in the argument breaks when you delete
   a page, delete it. State each page's `purpose:` in the spec; if you cannot finish
   "this page exists so the reader can…", it does not belong.
2. **Budget the length before writing.** Body pages (excluding cover, dividers,
   end): board update 5–7, strategy review 8–11, market entry or cost programme
   10–13, CDD 13–18, fundraising 8–11. Set `meta.max_slides` and let the build fail
   if you exceed it.
3. **Section dividers are expensive.** They cost a full page and carry no content.
   Use one only when the deck exceeds ~15 pages and the section runs three or more
   pages; below that, the kicker in the corner does the navigation.
4. **The storyline exists before the slides.** Write the action titles as a numbered
   list, read only the titles, and confirm they argue. If the chain does not hold,
   fix the argument — not the layout.
5. **Every non-divider title is a full sentence with a verb and a number where one
   exists.** Never "Market overview", "Analysis", "Next steps".
6. **One message per page.** Exceptions: executive summary, a KPI dashboard, appendix.
7. **Adjacent slides connect** with therefore / because / however / meanwhile. "Also"
   means merge or cut.
8. **Answer on page 2.** Page 1 is a cover; the executive summary states the
   recommendation, the three supporting claims and the ask.
9. **Every number has a source line** on the page that carries it. No source, no
   number. If an estimate is yours, write "Illustrative — team analysis".
10. **No PowerPoint defaults.** No default blue, no gradients, no shadows, no stock
    chart styling, no clip-art. The builder already enforces the design system.
11. **Never invent a fact.** Not a market size, not a competitor's share, not a
    citation. Use the research playbook; label estimates.
12. **Look at the rendered pages before delivering.** A deck that has never been
    rendered is a draft, not a deliverable.

## Workflow

### 1. Frame (5 lines, not 5 slides)
Write down: the decision the audience must make, the audience, the answer in one
sentence, the two to four supporting claims (MECE), and the time they will give you.
If the user gave no data, choose an explicit, labelled scenario rather than inventing
precision.

### 2. Storyline gate, then prune
Produce a title-only outline with a `purpose:` line per page, and run:

```bash
{skill}/scripts/deck outline mydeck.yaml
```

Read it top to bottom. Then run the three pruning passes in
`references/storyline.md`: **delete** (does the argument break without it?),
**merge** (two pages making the same point become one), **divider** (does this
section run three pages?). Come back under budget before you build anything.

### 3. Evidence
For each surviving page, decide the exhibit before the words: chart, table, 2×2,
waterfall, timeline, KPI row, comparison. Source first, then the insight in the
title. `references/research-playbook.md` covers sourcing, triangulation, labelling.

### 4. Build
```bash
{skill}/scripts/deck new strategy-review -o mydeck.yaml   # optional skeleton
{skill}/scripts/deck check mydeck.yaml                    # fast: static checks only
{skill}/scripts/deck build mydeck.yaml -o deck.pptx       # pptx + report
{skill}/scripts/deck review mydeck.yaml                   # build + render + contact sheet
```
`check` costs no render time and catches titles that are too long, text that will
overflow, table overflow, missing sources, density, slot overlaps, a thin divider
and an over-budget deck. Get it clean first.

### 5. Visual QA (the part that makes it professional)
`review` writes `mydeck-preview/contact-sheet.png` (one image, every slide) and
`mydeck-preview-pages/page-NNNN.png` (full resolution). **Look at the contact sheet
first.** Open individual pages only for the two or three that look wrong — this is the
single biggest token saving in the loop. The cheapest fix is always to delete a page.

Fix in this order: delete → merge → cut words → change block → adjust layout.
Never "fix" a full page by shrinking type below 9 pt.
`references/qa-playbook.md` maps symptom → cause → fix.

### 6. Deliver
Reopen the `.pptx` once with python-pptx to confirm slide count and that no text frame
is empty; then present the file. Keep the spec next to the deck so it can be rebuilt.

## The spec in 60 seconds

```yaml
meta: {title: "...", client: "...", date: "October 2026", palette: navy,
       confidentiality: "Confidential — draft", max_slides: 12}
sources: {s1: "Company FY25 10-K, p.42", s2: "Eurostat, Aug 2026"}
slides:
  - layout: cover
    title: "Restoring margin while defending share"
    subtitle: "Board discussion document"
    purpose: "Names the decision and the answer."
  - layout: summary                        # exec summary: 3 messages + so-what banner
    title: "Three moves restore 340 bps of margin by 2028"
    messages: [{lead: "Reprice the core", text: "..."}, {lead: "...", text: "..."}]
    banner: "The plan is self-funding from Q3 2027."
    purpose: "The whole argument and the ask on one page."
  - layout: content
    title: "Input costs, not volume, explain the margin gap"
    takeaway: "Every unrecovered point of cost has taken 60 bps since FY23"
    kicker: "01 · Where we are"            # small section label above the title
    source: s1                             # id from `sources`, or literal text
    purpose: "Proves the problem is cost, not demand."
    slots:                                 # full | left+right | top+bottom | col1..3
      left:  {kind: bullets, items: [{lead: "Cost", text: "Resin +22%, freight +31%"}]}
      right: {kind: chart, chart: column, categories: ["FY23", "FY25"],
              series: [{name: "Index", values: [100, 122]}], label_fmt: "#,##0"}
```

The full grammar — every layout, block, chart and diagram with all keys — is in
`references/spec-reference.md`. Read only the sections you need.

## Commands

| command | purpose |
|---|---|
| `deck outline spec.yaml` | titles, purpose lines, page count vs cap — the pruning view |
| `deck check spec.yaml` | validate + build in temp + static report |
| `deck build spec.yaml -o x.pptx` | produce the deck, print score and problems |
| `deck review spec.yaml` | build + render + contact sheet + ink diagnostics |
| `deck render x.pptx --pages 1-3` | re-render pages of an existing deck |
| `deck new <template> -o spec.yaml` | scaffold (`strategy-review`, `board-update`) |

`deck` is `{skill}/scripts/deck`. If it reports a missing environment, run
`{skill}/scripts/bootstrap.sh` once (creates `.venv` with python-pptx, Pillow, PyYAML;
needs `uv` or `python3-venv` and network). Rendering needs the LibreOffice Kit CLI;
`review` says so if it is missing and everything else still works.

## Rules the builder already enforces

Page geometry, margins, grid, type scale, colour roles, footer/source/page numbers,
title measuring, text wrapping, table rules, chart styling, thin dividers and the
`max_slides` cap. You choose *content*, *which layout*, and what to delete. If a page
looks wrong, the answer is almost always fewer words or one fewer page.

## File map

```
SKILL.md                  this file
references/storyline.md   argument, titles, skeletons, pruning, rubric
references/spec-reference.md  every layout/block/chart/diagram key
references/design-system.md   the tokens, and why they are what they are
references/qa-playbook.md     symptom → cause → fix, review protocol
references/research-playbook.md  sourcing, triangulation, fact-check
scripts/deck              launcher (finds the right interpreter)
scripts/deckkit/          the library
templates/                starter specs (11 and 7 pages)
examples/                 a complete 13-page worked deck (spec + pptx + preview)
```
