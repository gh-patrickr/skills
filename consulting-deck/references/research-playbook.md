# Research Playbook: Evidencing a Board-Grade Deck

A deck is an argument, not a document. Every number must have a home: a source you opened, a date you can name, an arithmetic path a director can re-walk in thirty seconds.

**The one rule:** if you cannot point to the row, page or table where a number lives, it does not go on the slide.

## 1. Research in the right order

| # | Step | Do this | Artefact |
|---|---|---|---|
| 1 | **Frame the decision** | One interrogative with actor, action, threshold, deadline — not "research Germany" but "should we enter Germany by FY28, and what share clears a 15% IRR?" | One sentence |
| 2 | **Hypothesis tree** | The day-one answer plus the evidence that would kill it | Falsifiable claim |
| 3 | **Issue tree (MECE)** | 3–5 branches, one logic per layer, roughly sized | One-page structure |
| 4 | **Evidence plan** | Per leaf: metric with units, tier-1 source, fallback | Evidence grid |
| 5 | **Gather** | Filings, then official statistics, then trade press; log each number at capture | Source register |
| 6 | **Triangulate** | Two independent methods or sources; explain any gap | Corroborated range |
| 7 | **Design the exhibit** | Chart the claim you already proved | One exhibit, one claim |

If a question cannot change an action, delete it. If a hypothesis cannot be falsified, rewrite it. Search to disprove, not to decorate.

**Source register — one row per number, captured when you read it:**

`value | unit | period | entity/segment | source name | document title | page/table | URL | date accessed | tier | note (restated? non-GAAP? estimate?)`

It is the deck's spine: every exhibit and fact-check item traces to a row in it.

**Triangulation:** two methods, two sources, two periods. Agreement within ±20% is a finding; a wider gap is also a finding — locate the assumption driving it and disclose it.

## 2. Hypothesis trees and MECE issue trees

**Branching rules**

- **One logic per layer** — arithmetic, process or segmentation, never mixed at the same level.
- **3–5 branches.** Fewer hides a driver; more means the layer above is wrong.
- **Mutually exclusive.** Apply the boundary test: can one item sit in two branches? If so, write a placement rule ("driver-granted discounts sit under price, not logistics").
- **Collectively exhaustive.** Branches must sum to the parent. An "other" branch is admissible only if sized.
- **"So what" at every leaf.** Each leaf must be answerable with a number and a source, and imply an action.
- **Prune by size.** Park low-value branches in writing, with the reason. Depth: 2–3 layers.

**Worked example — "Why has EBITDA margin declined?"**

Governing question: *How do we return EBITDA margin to at least 4% within 18 months without losing more than 5% of revenue?*

- **1. Price realisation** — did we sell at lower realised prices?
  - 1.1 List price changes (price book vs invoiced)
  - 1.2 Discount depth and frequency (off-invoice, rebates, promo)
  - 1.3 Mix shift to lower-price customers or channels
- **2. Input costs** — did what we buy get dearer?
  - 2.1 Commodity index vs contracted price (lag effects)
  - 2.2 Energy and freight surcharges
  - 2.3 FX on imported inputs, hedged vs unhedged
- **3. Cost to serve** — did serving the same order get dearer?
  - 3.1 Delivery and route density
  - 3.2 Storage cost and depot utilisation
  - 3.3 Labour productivity (units per labour hour)
  - 3.4 Shrinkage and write-offs
- **4. Volume and absorption** — did fixed costs spread over fewer units?
  - 4.1 Volume change by segment
  - 4.2 Capacity utilisation
  - 4.3 Non-recurring items (restructuring, one-off credits)

Leaf tests: 1.2 from invoice data (average discount by route, n = accounts); 2.1 from index vs contract; 4.2 from site utilisation. Then size the branches: if 1.2 explains ~120bps of a 180bps decline and 3.2 ~80bps, you have two named problems — not "margins are under pressure".

## 3. Source hierarchy

| Tier | Sources | Acceptable for | Never for | Cross-check |
|---|---|---|---|---|
| **1 — primary** | SEC EDGAR filings (10-K, 10-Q, 8-K, S-1, proxy); Companies House accounts; regulators; Eurostat, OECD, World Bank, IMF; ONS, Census, BLS; central banks | Financials, market denominators, growth, regulation — anything a decision number rests on | — | Prior-year filing (restatements), GAAP vs non-GAAP, peer filing, revision history |
| **2 — credible secondary** | Industry associations, broker/analyst reports, rating agencies, trade press, academic papers | Segmentation, competitive intensity, forward estimates, context | Company financials that should be filed | Two independent houses; consensus is a range, not a point; trace to the underlying data |
| **3 — weak** | Vendor marketing and vendor "market sizes", blogs, Wikipedia, press releases, conference decks, LLM output | Orientation and leads only | Any number on a board slide as sole support | Discard the number; follow its citation one hop to tier 1 or 2 |

Prefer primary over secondary; go one hop back whenever a source cites another. Date-stamp every capture, and for paywalled work record title, publisher, date, page, access route. A tier-2 estimate no peer corroborates is a hypothesis — label it.

## 4. Market sizing

1. **Define the boundary in one sentence:** product, geography, customer, channel, revenue vs GMV vs units.
2. **Top-down:** market = eligible population or units × penetration × frequency × price. Write the identity before substituting numbers.
3. **Bottom-up:** units × capacity × utilisation × price, or top-N player revenues plus a sized remainder.
4. **Report both as a range with a midpoint.** Within ~20–25% the range holds; wider means one assumption is doing all the work — sensitivity-test and disclose it.
5. **Sanity-check against something known:**

| Check | Test |
|---|---|
| Per-capita | Implied spend per head vs comparable categories |
| Per-site | Revenue per outlet vs observed peers |
| Share of GDP | Implausible fraction of the economy? |
| Implied growth | CAGR outrunning GDP or category growth for a decade? |
| Penetration | In line with a better-documented comparable country? |

6. **List assumptions as a numbered table** — input, value, basis (source or judgement), sensitivity — marking which are given and which are yours.
7. **Label the output.** "Illustrative — team analysis based on [anchors]" goes in the subtitle, not a footnote. Two significant figures; never dress modelled precision as measurement.

## 5. Evidence standards per slide

- **One exhibit, one claim.** The action title carries claim and number: "Discounting, not input costs, explains 120 of the 180bps of margin loss."
- **Reconcile.** Components sum to the total; show arithmetic as a bridge ("+120bps discounting, −80bps energy, +20bps mix").
- **Rounding discipline.** Same decimals throughout; percentages to one decimal; never mix "$4.7bn" with "$4,713m".
- **Disclose n.** Any survey or benchmark carries base, definition, fieldwork dates: "n = 214 UK finance directors, fieldwork 3–18 Mar 2026."
- **Date-stamp every point.** "as of 31 Mar 2026", "FY25A", "FY26E", "2028E". State non-December fiscal year-ends; never mix fiscal with calendar series.
- **CAGR:** (end ÷ start)^(1 ÷ periods) − 1, periods = intervals not data points. Label the span: "CAGR 2022–2025".
- **pp vs %:** "margin rose 3pp to 27%", not "rose 3%". Use bps below 100bp.
- **Indexes and currency:** state the base — "Index: 2019 = 100, real 2025 prices"; name currency and FX rate/date for any conversion.

## 6. Citation and footer conventions

**Source line = what, who, when, where.**

> Source: Acme Corp 10-K FY2025, p. 42 (filed 14 Feb 2026); ONS Retail Sales Index, Table 2 (Jan 2026); team analysis.

| Situation | Write |
|---|---|
| Single source | Publisher, document, page, date |
| Multiple | Primary first, semicolons; under ~110 characters, detail to footnote |
| Our arithmetic | "Team analysis based on [named inputs]" — never bare "team analysis" |
| Directional/modelled | "Illustrative — team analysis; not externally verified" |
| Confidential | "Source: client data (confidential)" — no client name, no title |
| Missing number | "Not disclosed" — never backfill silently |

**Hard prohibitions.** Never invent a citation, URL, page, report title, interview or dataset; never cite what you did not open. Redraw third-party charts rather than reproducing them. Keep client-confidential and licensed material out of decks that travel.

## 7. Fact-check checklist (12 items)

Run against the finished deck; all twelve pass before delivery.

| # | Check | Pass condition |
|---|---|---|
| 1 | Traceability | Every number maps to a register row |
| 2 | Reachability | Every cited document opens and contains the figure |
| 3 | Units | Consistent across slide, appendix, axis |
| 4 | Totals | Components sum to the stated total |
| 5 | Shares | Percentages sum to 100% ± rounding; pp and % correct |
| 6 | Dates | Compared series cover the same periods |
| 7 | Orphan claims | Every exhibit's claim appears in the storyline, or it is cut |
| 8 | Entities | Company, product, person names exist and are spelled as sourced |
| 9 | Arithmetic | CAGR, growth, share recomputed independently |
| 10 | Basis | Real/nominal, index base, currency stated |
| 11 | Method | n, base, fieldwork, definitions given for surveys |
| 12 | Labels | Source line everywhere; estimates marked E or illustrative; footer current |

## 8. When you cannot source it

Three honest options, in order. Never a fourth.

1. **Label it illustrative.** Keep the number, mark it, show the derivation: *"Illustrative: 14–18% of spend, derived from ONS category spend × assumed 15% addressable share; not externally verified."*
2. **Remove the number.** Keep the claim if it survives without the figure; otherwise cut the exhibit. A weaker slide beats a falsifiable one.
3. **Restate qualitatively.** Attribute to the person, not to data: *"Management estimates 15% of volume is discounted; unaudited."*

Then escalate in the delivery note: open items, what is missing, what evidence would close them. The unforgivable error is the silent estimate — a plausible number with a plausible-looking citation that nobody can reproduce.

## Sources

- UK Government, *Issue Trees* — [assets.publishing.service.gov.uk/.../Issue_Trees.pdf](https://assets.publishing.service.gov.uk/media/5a816cd1e5274a2e8ab53eb1/Issue_Trees.pdf)
- The Strategy Toolkit, *Issue Trees & MECE* — [thebastrategytoolkit.com/frameworks/issue-trees](https://thebastrategytoolkit.com/frameworks/issue-trees/)
- MBB Prep, *Market Sizing Cases* — [mbbprep.com/blog/market-sizing-case-interview](https://mbbprep.com/blog/market-sizing-case-interview)
- SEC, *EDGAR company search* — [sec.gov/edgar/searchedgar/companysearch](https://www.sec.gov/edgar/searchedgar/companysearch)
- Companies House, *Find and update company information* — [find-and-update.company-information.service.gov.uk](https://find-and-update.company-information.service.gov.uk/)
- Eurostat, *Database* — [ec.europa.eu/eurostat/web/main/data/database](https://ec.europa.eu/eurostat/web/main/data/database)
- World Bank, *Data* — [data.worldbank.org](https://data.worldbank.org/)
- UK Statistics Authority, *Code of Practice for Statistics* — [code.statisticsauthority.gov.uk/the-code](https://code.statisticsauthority.gov.uk/the-code/)
- ONS, *Methodology* — [ons.gov.uk/methodology](https://www.ons.gov.uk/methodology)
- Datawrapper Academy, *Annotating your visualization* — [datawrapper.de/academy/annotate-tab](https://www.datawrapper.de/academy/annotate-tab)
- Financial Times, *Chart Doctor / Visual Vocabulary* — [github.com/Financial-Times/chart-doctor](https://github.com/Financial-Times/chart-doctor)
- Reuters, *Standards & Values* — [reutersagency.com/en/about/standards-values](https://www.reutersagency.com/en/about/standards-values/)
