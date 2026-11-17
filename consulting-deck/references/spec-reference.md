# Spec reference

One YAML file describes the whole deck. Build it with
`scripts/deck build deck.yaml -o deck.pptx`. Unknown keys are ignored, so a typo
is silent — check the rendered page, not just the exit code.

## Page economy

Two keys do the pruning for you:

- `meta.max_slides` — the build **fails** if the deck exceeds it. Set it before you
  write, at the budget for the deck type (board 6–8, strategy 8–12, market entry or
  cost 11–14, CDD 14–19, fundraising 9–12), so scope creep is visible.
- `purpose:` on any slide — one sentence on what the page lets the reader decide or
  believe. `deck outline` prints it under each title; a page whose purpose you cannot
  finish is a page to delete.

A `section` divider is a full page that carries no content. `deck check` warns when
a divider covers fewer than two pages. Below ~15 total pages, use `kicker` labels
instead and delete the dividers.

## Top level

```yaml
meta: {...}
sources: {s1: "Eurostat, Aug 2026", s2: "Company FY25 10-K, p.42"}
slides: [ ... ]
```

| `meta` key | default | notes |
|---|---|---|
| `title` | — | used by the cover when the slide has none; also document properties |
| `subtitle` | — | cover subtitle |
| `client` | — | cover bottom-right |
| `author` | — | cover bottom-left, document properties |
| `date` | — | cover bottom-left |
| `confidentiality` | — | small caps line under the cover footer |
| `palette` | `navy` | `navy` · `graphite` · `burgundy` |
| `font` | `Arial` | `Arial` · `Georgia` · `Verdana` · `Tahoma` · `Trebuchet MS` · `Arial Narrow` · `Times New Roman` |
| `cover_style` | `dark` | `dark` · `light` |
| `footer` | `true` | source line + rule + page number |
| `page_numbers` | `true` | starts on page 2 |
| `max_slides` | — | hard cap; the build errors above it |

`sources` maps an id to the exact text printed after "Source:". Use it so one
citation cannot drift between pages. A slide's `source:` may also be literal text.

## Layouts

### `cover`

```yaml
- layout: cover
  eyebrow: "Strategy review · board discussion"
  title: "Restoring 340 bps of margin while returning to growth"   # max 2 lines
  subtitle: "Three moves, self-funded, delivering €74m EBIT by 2028"
  date: "October 2026"       # overrides meta.date
  author: "Strategy team"
  client: "Northwind Industrial"
```

### `section` (divider)

```yaml
- layout: section
  number: "01"              # auto-numbered if omitted
  label: "Where we are"     # small caps above the title
  title: "Where we are"     # 32 pt, max 2 lines
  subtitle: "One line on why this section exists"
```
Dark page, accent number. Do not repeat `label` and `title`.

### `agenda`

Auto-built from the deck's `section` slides, including their page numbers.

```yaml
- layout: agenda
  title: "Agenda"
  # items: [{number, title, page, text}]   # only to override
```

### `summary` (executive summary)

```yaml
- layout: summary
  title: "Three moves restore 340 bps of margin and €512m revenue by 2028"
  messages:                       # 3-4, each a bold claim + one sentence of evidence
    - {lead: "Reprice the core", text: "Selective increases worth €18m on the top 400 SKUs…"}
    - {lead: "Rebalance toward specialty", text: "Shift 8 points of revenue…"}
    - {lead: "Take 12% out of indirect cost", text: "Consolidating three plants…"}
  banner: "Self-funded from Q3 2027, with €96m of cumulative free cash flow."
  banner_label: "So what"          # default
```

### `content`

```yaml
- layout: content
  title: "Volume held, but price realisation lagged input-cost inflation"
  takeaway: "Unrecovered cost has taken 180 bps of EBIT margin since FY23"
  kicker: "01 · Where we are"
  source: s2                       # id from `sources`, or literal text
  section: "Where we are"          # footer, right of the source
  split: 0.44                      # left/right split
  split_v: 0.36                    # top/bottom split
  slots: {...}
  notes: "Speaker notes for this page"
```

`purpose` (any layout) is metadata, printed by `deck outline`, never rendered.

`kicker` sits above the title. `takeaway` sits between the title and the body.
Without a `takeaway` the body starts higher — use it when the page needs the
extra 0.3 in.

### `end`

```yaml
- layout: end
  title: "Questions and discussion"
  subtitle: "Appendices available: …"
  contact: "Strategy team · strategy@client.example"
```

## Slots

`slots` maps a slot name to one block. Legal combinations:

| keys | geometry |
|---|---|
| `full` | whole body |
| `left` + `right` | horizontal split (`split`, default 0.5) |
| `top` + `bottom` | vertical split (`split_v`, default 0.55) |
| `top` + `left` + `right` | band + two columns |
| `top` + `col1` + `col2` (+ `col3`) | band + equal columns |
| `col1` + `col2` (+ `col3`) | equal columns |
| `left` + `right` + `bottom` | two columns + band (`split_v`, default 0.30) |

Anything else raises an error naming the legal set. There is no four-block page:
if you need it, the page is two pages.

## Blocks

### text

```yaml
{kind: text, text: "One paragraph.\n\nA second paragraph.", size: 12, line_spacing: 1.26,
 space_after: 9, align: l, bold: false, colour: "3B4757"}
```
`paragraphs: [...]` is an alternative to `text`. Inline `**bold**` is supported in
`text`, `bullets`, `table` cells and `lead` fields.

### bullets

```yaml
{kind: bullets, bullet: dot, items: [
   {lead: "Input costs", text: "Resin +22%, freight +31%"},
   "A plain bullet",
   {lead: "Sub-point", text: "…", level: 2}
 ], size: 12, line_spacing: 1.20, space_after: 7}
```
`bullet`: `dot` · `dash` · `number` · `none`. Six items is the practical maximum.

### table

```yaml
kind: table
columns:
  - {label: "Segment", width: 1.6}       # width is a relative weight, default 1 (first column 1.6)
  - {label: "Revenue, €m", align: r}
rows:
  - ["Core MRO", "218"]
  - ["Total", "461"]
total: true                 # style the last row as a total (tint + 1 pt rule above)
columns_total: ["Total", "461"]   # appended automatically as the total row
size: 10.5                  # cell size; header is 8.5 caps
stretch: true               # default: rows grow to fill the slot
first_col_bold: true
valign: middle              # centre instead of stretching
note: "Excludes corporate costs"
```
No vertical lines, ever. Numbers right-aligned, text left. Maximum 8 rows × 6 columns.

### image

```yaml
{kind: image, path: "assets/store.jpg", mode: cover, scrim: 0.45, scrim_colour: "000000", label: "Store 14, North"}
```
`mode`: `cover` (crop to fill) or `contain`. Paths are relative to the spec file.

### chart

```yaml
kind: chart
chart: column            # see below
categories: ["FY23", "FY24", "FY25"]
series:
  - {name: "Revenue", values: [412, 441, 461]}
  - {name: "EBIT", values: [53, 52, 51], type: line}   # type: line only for combo
highlight: "Revenue"     # index or series name: the one thing the page is about
label: all               # none | all | last | outside_end | inside_end | value
label_fmt: "#,##0.0"
axis_fmt: "#,##0"
value_max: 520
show_value_axis: false
legend: true             # default: only when >1 series and no labels
```

| `chart` | use for | notes |
|---|---|---|
| `column` | comparing magnitudes across categories | sorted order is your job |
| `bar` | long category names, ranking | horizontal |
| `stacked` / `stacked100` | composition | 2-4 series max |
| `line` | trends over time | 2-4 series, no markers |
| `area` | volume trend | sparingly |
| `combo` | two units (bars + line) | series with `type: line` |
| `scatter` | relationship, 2×2 positioning | `values` are `[x, y]` pairs; `quadrants: true`, `point_labels: [...]`, `x_label`, `y_label` |
| `waterfall` | bridges, value creation | `waterfall_totals: [true, false, …, true]` |

Waterfall specifics: `categories` are the bars in order, `series[0].values` the
signed steps in €m (the first and last are totals, flagged by
`waterfall_totals`). Labels and connectors are drawn automatically; do not set
`label: none` unless you want a bare chart.

Chart styling is fixed: no gridlines, no plot border, no chart junk, one accent.
Use `highlight` rather than colouring everything.

### Diagrams

```yaml
kind: kpi
items:
  - {value: "31", label: "Net promoter score", delta: "Peers 44", tone: negative}
  - {value: "91%", label: "On-time delivery", delta: "Peers 96%", tone: negative}
columns: 4        # optional
```
`tone`: `positive` · `negative` · `neutral`. 2-4 items. The value is the hero —
keep it short (`31`, `91%`, `€18m`).

```yaml
kind: steps
items: [{title: "Weeks 1-2 · Mandate", text: "Board approves guardrails"}]
numbered: true            # 3-5 items
```

```yaml
kind: timeline
phases:
  - {label: "Q1–Q2 2027", title: "Stabilise", text: "Price governance…", gate: "Pricing council live"}
milestones:
  - {at: 0.06, text: "Board approval"}     # at = 0-1 across the axis
tone: accent                             # optional per phase
```
`gate` renders as a labelled line at the foot of the phase panel — use it for the
decision that releases the next phase's spend.

```yaml
kind: cards
emphasis: 1                # 0-based; gets the accent fill
items:
  - title: "Reprice the core"
    text: "Optional one-liner"
    bullets: ["6% list increase on the top 400 SKUs", "€18m price, capped at €6m at risk"]
    metric: "€18m"
    metric_label: "Price benefit by 2028"
```
2-5 cards. `metric` anchors the foot of the card — it is what stops a 3-card page
looking empty.

```yaml
kind: matrix
x_axis: ["Low market growth", "High market growth"]
y_axis: ["Weak right to win", "Strong right to win"]
quadrants: ["Defend", "Invest", "Divest", "Build"]   # TL, TR, BL, BR
points:
  - {label: "Services", x: 0.72, y: 0.78, highlight: true}
```

```yaml
kind: flow
items: [{title: "Diagnose", text: "…"}, {title: "Design", text: "…"}]
```

```yaml
kind: funnel
items: [{label: "Leads", value: "12,400"}, {label: "Qualified", value: "3,100"}]
```

```yaml
kind: org
root: {title: "CEO", subtitle: "Northwind"}
children:
  - {title: "CCO", subtitle: "Commercial", children: [{title: "Pricing"}, {title: "Key accounts"}]}
```

```yaml
kind: quote
text: "We do not lose on price; we lose on the promise we make at order."
attribution: "COO, Northwind"
role: "Win/loss interview, March 2026"
```

```yaml
kind: callout
title: "Watch-out"
text: "The second price wave assumes churn stays below 9%."
tone: warn                # accent | neutral | warn
```

```yaml
kind: banner
label: "So what"
text: "The plan is self-funding from Q3 2027."
```

## Reading the build report

```
ok: deck.pptx  16 slides  85 KB  0.3s  score 100/100
  ! s7  title-long   action title is 104 chars (aim <95)
  x s9  text-overflow  bulleted list overflows its slot by 0.31in
```

`x` fails the page; `!` is a warning. Exit code is 1 when `--strict` and any
error exists. Geometry errors name the slot, because that is what you fix: fewer
words, a smaller block, or a different slot combination.
