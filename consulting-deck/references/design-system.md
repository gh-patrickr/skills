# Design system

The numbers below are the ones in `scripts/deckkit/theme.py`. If you change a token,
change it there — never patch a slide by hand.

## Why this system

A consulting deck reads as one object: same margins on every page, same title
position, same footer, one accent colour, two type sizes doing most of the work.
Consistency is what makes a deck look expensive; variety is what makes it look
generated. The system deliberately removes choices that do not improve comprehension.

## Page geometry (16:9, 13.333 × 7.5 in = 960 × 540 pt)

| zone | from | to | notes |
|---|---|---|---|
| eyebrow / kicker | 0.36 in | 0.56 in | 8.5 pt caps, accent, +1.1 pt tracking |
| action title | 0.52 in | 1.50 in | 26 pt bold, max 2 lines, −0.35 pt tracking |
| takeaway line | 1.46 in | 1.86 in | 12.5 pt, secondary ink |
| body | 1.94 in | 6.50 in | 12.09 × 4.56 in of usable space |
| footer rule | 6.79 in | | 0.75 pt hairline, full content width |
| footer text | 6.86 in | 7.08 in | 8 pt: source left, section + page right |

Side margins are 0.62 in each, giving a 12.09 in content width. The body is a 12-column
grid, 0.843 in columns, 0.18 in gutters — `col_x = 0.62 + n × 1.023`.

Nothing may cross the outer 0.6 in margin except a deliberate full-bleed image or the
dark cover/divider backgrounds. Nothing may enter the footer band: the QA pass fails
the build if a block does.

## Type

One family per deck. `Arial` is the default because it exists on macOS and Windows,
is metrically identical to Liberation Sans (used by LibreOffice), and measures
exactly — so the builder can predict wrapping to the line. `Georgia` is the only
serif alternative worth offering; anything else is a substitution risk.

| role | size | weight | notes |
|---|---|---|---|
| cover title | 38 pt | bold | max 2 lines, 1.04 spacing |
| section number | 72 pt | bold | accent, −1.5 tracking |
| section title | 32 pt | bold | 1.06 spacing |
| action title | 26 pt | bold | 2 lines max, auto-shrinks to 22.5 before it fails |
| takeaway | 12.5 pt | regular | one line, reads as the "so what" under the title |
| body / bullets | 12 pt | regular | 1.22 spacing, 7 pt between bullets |
| bold lead-in | 12 pt | bold | same size, ink colour; body in secondary ink |
| table header | 8.5 pt | bold caps | +0.5 tracking |
| table cell | 10.5 pt | regular | numbers right-aligned, text left |
| chart labels | 9.5 pt | | category + data labels |
| source / page | 8 pt | regular | muted |

Rules: never below 8 pt; body never below 10 pt (the builder refuses to shrink past
9 pt silently and warns); left-align all text except numbers and page furniture;
no justified text; no centred paragraphs; no all-caps sentences (caps are reserved
for eyebrows and table headers, always tracked).

## Colour

`navy` (default) — restrained, print-safe, survives greyscale:

| role | hex | use |
|---|---|---|
| ink | `16202B` | headings, primary bars, dark covers |
| ink2 | `3B4757` | body copy |
| muted | `78859A` | axis labels, captions, footers |
| rule | `D7DEE7` | hairlines, grid |
| accent | `B8873C` | the one thing the page is about |
| positive | `2F7A5F` | favourable deltas |
| negative | `A8442C` | unfavourable deltas |
| bg | `FFFFFF` | page |
| tint / tint2 | `F3F5F8` / `E8EDF3` | panels, banners, total rows |
| series 1-6 | `1B3A5B` `B8873C` `6E8FA8` `9AA6B3` `45617C` `D9C6A5` | charts |

Alternatives: `graphite` (charcoal + teal `0E7C6B`), `burgundy` (`8C2F39`). Pick one
per deck; never mix palettes.

Colour rules:
- **One accent per slide.** The accent marks the series, cell or word the page is
  about; everything else is ink, ink2, or a tint. If two things are accented, nothing is.
- Context series are grey (`9AA6B3`), never a second bright colour.
- Text on colour must clear 4.5:1; large text and graphic marks 3:1. The two dark
  palettes are checked for this; do not invent new pairings.
- Tints are for surfaces, never for text.

## Composition

- **Title does the work.** If a reader only reads titles, the deck must make sense.
- **One exhibit per page.** Two charts side by side is usually two pages, unless the
  comparison *is* the point.
- **Whitespace is a feature.** A page with 40% empty space reads as confident. Fill
  space with meaning, not boxes.
- **Align to the grid.** Every element starts on a column edge; nothing is centred
  unless it is a cover or divider.
- **Hierarchy is size + weight + colour, in that order.** A third type size is a bug.
- **Footers are furniture, not content**: source left, section + page right, 8 pt,
  muted — always present, never bigger, never bold.

## Tables

Header row: white background, 8.5 pt bold caps, 1 pt ink rule below. Body rows:
hairline rules only (`rule`, 0.5 pt), no vertical lines, no zebra. First column bold
ink, numbers right-aligned in ink2, totals in tint with a 1 pt ink rule above. Row
height is computed from the text, never fixed. Maximum 8 rows × 6 columns on a page —
beyond that it is a chart or an appendix.

## Charts

Native PowerPoint charts only (editable, crisp, no font substitution). No gridlines,
no plot border, no chart junk, no legend when one series, no 3-D, no gradients.
Data labels carry the numbers; category labels are 9.5 pt and never rotated. One
highlighted series in accent, everything else in grey or ink. Waterfalls are built as
invisible-base stacked columns. Full key list: `spec-reference.md`.

## Anti-patterns (each one is a tell)

Default Office blue · drop shadows · rounded rectangles everywhere · gradients ·
centred body text · bullet lists longer than six items · titles that name the topic ·
two accents · clip-art or emoji · icons in three different stroke weights · tables
with vertical lines · charts with legends and gridlines and no labels · a source line
that says "internet" · footers that move.
