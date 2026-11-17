# QA playbook

A deck is finished when a partner would sign it, not when the script exits 0.
This is the loop that gets you there without re-reading every slide.

## The three passes

1. **Static** (`deck check spec.yaml`) — titles, density, overflow maths, slot
   collisions. Fix every `x`. Fix `!` warnings unless you can say why not.
2. **Contact sheet** (`deck review spec.yaml` → `<name>-preview/contact-sheet.png`)
   — one image, every page. Look for: pages that are visibly emptier or denser
   than their neighbours, decoration that repeats, anything that draws the eye to
   the wrong place. This is where 80% of the problems are caught.
3. **Full page** (`<name>-preview-pages/page-0007.png`) — open the two or three
   pages the contact sheet flagged, plus the one page you are least sure about.
   Check optical alignment, label collisions, hyphenation, number formatting.

Do not open every page at full size. It costs tokens and adds nothing over the
contact sheet for layout-level defects.

## Symptom → cause → fix

| symptom | likely cause | fix |
|---|---|---|
| text runs past the bottom of its box | too many words for the slot | cut 20% of the words; do not shrink the font |
| a bullet list ends mid-sentence | renderer overflow the maths missed | shorten items, or move one to the next page |
| table spills into the footer | too many rows, or `stretch` on a full table | drop a row, or `stretch: false` |
| two blocks touch | a slot combination the grid cannot hold | change the slot combination, not `split` |
| page looks half-empty | content is thin for a full page | add a `banner` (implication), a `metric` on each card, or merge with the next page |
| deck feels long | pages that restate a point already made | merge them; the second-best exhibit becomes a callout or appendix |
| divider opens a one-page section | a divider used for navigation | delete the divider; the kicker already says where you are |
| a page has no title you can defend | it was written to "cover" a topic | delete it; the deck gets stronger |
| title takes three lines | the claim is doing two jobs | split the claim; the title must be one sentence |
| title reads like a label ("Overview") | no verb, no number | rewrite as "[driver] + [verb] + [number] + [when]" |
| chart bars are unreadable | too many categories, or a highlight on everything | top 6 categories; one accent, rest grey |
| chart numbers float oddly | data labels on a stacked/waterfall series | waterfalls already draw their own labels — do not add labels |
| a colour appears that is not in the palette | hard-coded hex in a block | remove it; use `highlight`, `tone` or `emphasis` |
| footer collides with content | body exceeds 6.5 in | remove rows/text; never move the footer |
| page looks grey and flat | three tints and no ink | one ink element (a dark number, a solid bar, bold lead-in) |
| every page has the same shape | no rhythm | alternate evidence (chart/table) with argument (cards/steps/banner) |
| deck reads fine page by page, not as a whole | titles are topics, not a chain | rewrite the title chain before touching layout |
| numbers contradict another page | data entered twice | put the number in one place; the source register keeps the citation honest |

## How to fix a page (in order)

0. **Delete or merge first.** A page that survives the delete test is worth more
   than any layout fix. Two pages with the same message are one page.
1. **Cut words.** Most overflow is a writing problem. 12 pt body holds ~90 words
   on a full page; if you need 140, you have two pages.
2. **Change the block**, not the geometry: bullets → table, table → chart,
   two columns → `top`/`bottom`.
3. **Split the page.** A page with two messages hides both.
4. **Only then** reduce type — and never below 10 pt body / 9 pt label.

## Delivery checklist

- [ ] Titles read as an argument with no slides in between
- [ ] Page 2 answers the question; the ask is explicit
- [ ] Every exhibit has a source line with a date and an entity
- [ ] Totals add up; percentages sum to 100 where they should
- [ ] Units and periods are consistent across pages (€m, FY, bps)
- [ ] One accent colour per page; greys for context
- [ ] Numbers use one convention: thousands separator, one decimal for €m, `pp` for points
- [ ] No page has more than one message
- [ ] Every page states a purpose that a reader would miss if it were gone
- [ ] The deck is inside its page budget; dividers only where a section runs 3+ pages
- [ ] Section dividers match the agenda
- [ ] Nothing sits in the footer band or outside the margins
- [ ] Speaker notes exist on pages that will be presented
- [ ] The file opens in PowerPoint without a repair prompt (render once and reopen with python-pptx)

## Known limits

- Rendering here uses LibreOffice. PowerPoint is usually crisper; line breaks can
  differ by a word. Leave a 5% height margin on the tightest block.
- Fonts: the deck names Arial (or Georgia and friends). If it opens on a machine
  without the font, PowerPoint substitutes and text reflows. Arial is the only
  safe default.
- Charts are native and editable, but per-point styling done in code is not
  re-derivable by PowerPoint's own chart wizard — editing data in PowerPoint can
  reset series colours to the theme.
- No animation, transitions, SmartArt or embedded media. Add those in PowerPoint
  if the story needs them; they are not part of this system.
