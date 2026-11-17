# deckkit — consulting-grade PowerPoint from a YAML spec

Build a board-grade `.pptx` in one command, from a compact spec, with a design
system that cannot drift and a QA loop that catches overflow before you present.

```bash
./scripts/bootstrap.sh                 # once: venv + python-pptx, Pillow, PyYAML
./scripts/deck review examples/northwind-growth-plan.yaml -o deck.pptx
open deck.pptx
```

`review` builds the deck, renders every slide, and writes a contact sheet at
`deck-preview/contact-sheet.png` so you can judge the whole thing in one look.

## Why it is built this way

- **Content as data.** A slide is 5–15 lines of YAML, not 60 lines of python-pptx.
  That is cheaper for a model to write and far easier to revise.
- **Few pages, each with a job.** `purpose:` is a required discipline at outline
  time and `meta.max_slides` is a hard cap, so the tool pushes back on padding.
- **Measured text.** Every string is measured with the real font (Pillow) before
  it is placed, so "does it fit" is computed, not guessed. PowerPoint's own
  autofit never resizes text — this does.
- **A closed design system.** Margins, type scale, palette, chart styling and
  table rules live in `scripts/deckkit/theme.py`. Nothing on a slide is styled
  ad hoc, so page 14 matches page 4.
- **Native objects.** Charts are real PowerPoint charts, tables are real tables,
  diagrams are real shapes. Everything is editable by a human afterwards.

## What is in the box

| path | what |
|---|---|
| `SKILL.md` | the agent-facing skill: workflow, rules, commands |
| `references/` | storyline, spec grammar, design tokens, QA, research method |
| `scripts/deckkit/` | theme, text measurement, primitives, layouts, charts, diagrams, QA, render |
| `scripts/deck` | launcher that finds the right interpreter |
| `templates/` | `strategy-review`, `board-update` skeletons |
| `examples/` | a complete 13-page deck: spec, pptx, contact sheet |

## Commands

```
deck new strategy-review -o mydeck.yaml   scaffold
deck outline mydeck.yaml                  title-only view (storyline gate)
deck check mydeck.yaml                    validate + build in a temp file
deck build mydeck.yaml -o deck.pptx       build + static report + score
deck review mydeck.yaml                   build + render + contact sheet
deck render deck.pptx --pages 1-3         re-render selected pages
```

## Requirements

- Python 3.10+ with `python-pptx`, `Pillow`, `PyYAML` (`bootstrap.sh` creates a
  `.venv` with them; `uv` is used when available).
- Rendering only: the LibreOffice Kit CLI (`dsoffice`, or
  `libreoffice-kit/lib/cli.js` run with node). Without it, `build`/`check` still
  work; `review` says so and stops.
- Measurement uses the macOS system font files under
  `/System/Library/Fonts/Supplemental`. On another platform, point
  `textfit._MAC` at a directory containing Arial; rendering still works without
  it, but overflow prediction degrades.

## Extending it

- New palette: add a `Palette` to `theme.PALETTES`.
- New diagram: write `_kind(slide, box, spec, theme)` in `diagrams.py` and
  register the name in `diagrams.build`'s dispatch.
- New chart type: add it to `charts._KINDS` and handle it in `charts.build`.
- New block: add a branch in `layouts.block` and validate it in `spec.ALLOWED_BLOCKS`.

Keep the rule: geometry and colour come from tokens; text comes from measurement.
