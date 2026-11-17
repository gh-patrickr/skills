---
name: game-requirement
description: Use when children describe a browser game in German and the idea must become a buildable spec — "wir wollen ein Spiel machen", a voice note, a wish list, a drawing with words, several kids talking over each other. Turns the German input into an English requirements spec for the webgame-development skill, a kid-readable German translation to confirm, and a German list of gaps, open questions and improvement ideas. Does not write the game itself.
---

# Game requirements from kids (German in, spec out)

**Applies to:** a German-language idea for a browser game from children (roughly 6–14),
a transcript, a chat log, or a wish list. If the input is already an English brief or a
technical ticket, do not load this skill — write the spec directly.

## The contract

Done means all of these:

1. `node scripts/check-spec.mjs docs/requirements` exits `0` and prints `PASS`.
2. `docs/requirements/` holds these four files: `intake.de.md` (verbatim),
   `spec.md` (English, canonical), `spec.de.md` (kid German),
   `open-questions.de.md` (gaps, questions, ideas in German).
3. Nothing was invented silently: every unknown is either a default with an `AD-xx`
   entry or an open question `OQ-xx` in the German file.
4. Every `P0` requirement has at least one acceptance criterion that is testable
   through the webgame bridge (`window.__WG__.step(n)`, `?seed=N`, `snapshot()`).
5. The German spec carries the same IDs as the English one, so a kid can point at a
   line and say "that's wrong".

If 1 does not hold, the spec is not ready for `webgame-development`. Say so; never hand
over a draft as if it were a spec.

## Non-negotiables

- **Kids own the fun, you own the structure.** Never ask a child about a framework, a
  file layout, a canvas size or a testing strategy. Decide those and label them.
- **Verbatim first.** The intake file is evidence, not prose. Do not fix spelling,
  dialect, names or contradictions there.
- **No silent invention.** A gap you fill becomes an `AD-xx` line with a reason. A gap
  you cannot fill becomes an `OQ-xx` in German. There is no third option.
- **No translation loss.** Character, level and item names stay as the kids said them,
  with an English gloss. "Feuerdrache Klaus" does not become "Fire Dragon".
- **English for dev, German for kids.** English spec is the contract, German files are
  the conversation. Never send the English spec to a child for review.
- **Never promise.** No multiplayer, no online saves, no accounts, no app store. A kid
  asking for one gets a question with a cost, not a requirement.
- **Defaults over interviews.** Block on at most three questions; default the rest,
  visibly.

## 0. Choose the path (30 seconds)

| Input | Do this |
| --- | --- |
| One sentence ("ein Spiel mit Tieren, die rennen") | One intake line, default a playable slice, ask at most 3 questions |
| A list of ideas / several kids | One line per statement with a speaker tag, then §1 |
| A voice-note transcript | Keep the raw transcript, split into statements, drop filler, never edit names |
| Contradictions ("Pinguin ist schneller" vs "Fuchs gewinnt immer") | Keep both lines, mark the conflict in §1, pick a default, ask as `OQ-xx` |
| Existing prototype or code | Read `docs/assumptions.md` and the current `spec.md`; this skill then writes change requests, not a new spec |

## 1. Capture: `docs/requirements/intake.de.md`

One statement per line, line 1 is the first statement, no header, no blank lines, no
bullet characters — the line number **is** the trace ID `Z.n`. Prefix the speaker when
more than one child talks. Keep the original wording, grammar mistakes included.

```text
[Lena] Also, wir wollen ein Spiel mit Tieren, die rennen.
[Max] Man fährt mit den Pfeiltasten nach rechts.
[Lena] Der Pinguin ist der schnellste.
```

Why so strict: `Z.n` is the only proof that a requirement came from a child rather than
from your imagination. `scripts/check-spec.mjs` verifies that every `Z.n` exists and is
non-empty.

## 2. Extract: stories → eight slots

Every game spec needs these slots, however small. Fill them from the intake *before*
writing a single requirement:

| Slot | Question it answers | Typical kid input |
| --- | --- | --- |
| Fantasy | What is the player pretending to be? | "Tiere, die rennen" |
| Core loop | What do you do in a 20-second stretch? | "Pfeiltasten, Bananen sammeln" |
| Goal | How does a round end in a win? | "Nach 3 Runden gewinnt der Erste" |
| Fail | What makes you lose or retry? | "Kaktus = verloren" |
| Content | What exists (levels, animals, items)? | "Lama, Fuchs, Pinguin" |
| Controls / device | What does the player hold? | "Tablet in der Schule" |
| Feel | How should it feel (fast, funny, cosy)? | "wie Mario Kart" |
| Scope edge | What is explicitly later? | "Mehr Level später, erstmal eins" |

An empty slot becomes a default (`AD-xx`) or a question (`OQ-xx`). Never leave it silent:
the dev skill would guess differently than the kids meant.

## 3. Default, never block

A child cannot answer "fixed timestep or variable?". Default it, write it down, move on.
Each default gets an `AD-xx` with the reason and what changes if it turns out wrong.

Standard defaults for this skill — override only with a reason in the handoff block:

| Topic | Default |
| --- | --- |
| Stack | TypeScript strict, Vite, Canvas 2D — the `webgame-development` baseline |
| World | 960×600 logical, 60 Hz fixed timestep, integer scaling |
| Controls | keyboard **and** touch/pointer; touch targets ≥ 48 px |
| UI language | German (`de`), because the players are German kids |
| Save | `localStorage`, one slot, visible reset |
| Audio | SFX on, music optional, mute toggle always reachable |
| Session | 3–5 minutes to a result screen |
| Players | 1, local only |
| Scope | one level that is fun for 60 seconds before a second exists |
| Safety | no accounts, no ads, no trackers, no external links, no chat, no IAP |

Ask at most **three** questions, and only ones that change the core loop. Everything
else is a default plus one line in the German file.

## 4. Write `docs/requirements/spec.md` (English)

Follow `references/spec-format.md` exactly — the checker parses it. Shape:

- Frontmatter: `status` (`draft` → `ready` → `confirmed`), `spec_version`, `game`,
  `ui_language`, `target_skill: webgame-development`.
- §2 handoff JSON — the values `webgame-development` reads instead of guessing.
- §5 requirements, one observable behaviour per row:

```text
| ID | Requirement (English) | Prio | Conf | Trace |
| --- | --- | --- | --- | --- |
| F-002 | Collecting a banana adds 1 point and plays a pickup sound. | P0 | EXPLICIT | Z.5 |
```

`Prio`: `P0` must ship, `P1` should ship, `P2` later.
`Conf`: `EXPLICIT` (a child said it), `DEFAULT` (you decided, references `AD-xx`),
`DERIVED` (follows from other rows). If you cannot observe it in `snapshot()`, `events()`,
pixels or bytes, it is a note — not a requirement.

## 5. Acceptance criteria the dev skill can run

Every `P0` needs at least one AC written so it becomes a test, not a mood:

```text
| AC | Covers | Given | When | Then | Test |
| --- | --- | --- | --- | --- | --- |
| AC-002 | F-002 | seed=42, run started | step(300) after setInput({right:true}) | snapshot().score === 1 and events() contains "banana.pickup" | unit |
```

Rules: `Given`/`When` use the bridge (`step(`, `?seed=`, `autoplay(`, `setInput(`,
`start(`) for `unit`/`bot`; `e2e` may use a real tap or click instead. `Then` is a value
or an event name, never "looks good". `visual` and
`a11y` criteria name a baseline or a rule. Details: `references/acceptance-and-handoff.md`.

## 6. Write the German files (what the kids actually read)

`spec.de.md` — same IDs, kid language:

- `du`, short sentences (≤ 12 words), one idea per line, concrete numbers ("3 Runden",
  not "mehrere Runden").
- Translate the *effect*, not the mechanism: "Wenn du einen Kaktus berührst, ist die
  Runde vorbei" — not "collision with the cactus entity ends the run".
- Priority as `Muss` / `Sollte` / `Kann später`, never `P0`.
- No jargon: no Requirement, Feature, MVP, Scope, Acceptance, Handoff, Spec, Blocker.
- `## Bitte bestätigen` at the end: checkboxes to tick, plus one line for "Das ist
  falsch" and one for "Das fehlt noch".

`open-questions.de.md` — three block types, all German, all answerable by a 10-year-old:

```text
## OQ-02 — Rennen gegen den Computer oder nur gegen die Uhr?
**Wichtig:** ja
**Warum wir fragen:** Das ändert, wie sich das Spiel anfühlt.
**Was wir vermuten:** Gegen den Computer, weil ihr "wer am weitesten ist" gesagt habt.
- A) Gegen 2 Computer-Tiere
- B) Nur gegen die Uhr
- C) Beides, umschaltbar (dauert länger)
**Unsere Empfehlung:** A
**Eure Antwort:** ____
```

When an `OQ-xx` is answered: fold the answer into the spec, delete the question block,
and keep the answer under a plain heading (`## Eure Antworten`) so the kids see it was
heard. Never leave an answered question standing as if it were still open.

`GAP-xx` = something missing the kids never thought about, with a proposal.
`IDEA-xx` = an improvement nobody asked for, with effort `klein` / `mittel` / `groß`.
Order: blockers first, then gaps, then ideas. Never more than five `OQ-xx` in total —
kids stop reading after that.

## 7. Verify, then hand over

```bash
node scripts/check-spec.mjs docs/requirements
node scripts/check-spec.mjs docs/requirements --json   # for tooling
```

`PASS` prints the counts: requirements by priority, ACs, defaults, trace links, open
questions, blockers. Exit `2` means a file or the intake format is missing — fix the
structure, not the checker.

`scripts/new-spec.sh --game "Tier-Rennen"` creates the four files from `templates/`.

Handoff to `webgame-development`:

1. Set `status: ready` only when the blocker count is `0` and every `P0` has an AC.
2. Tell the dev skill to read `spec.md`: §2 first (handoff JSON), then §5/§6. It uses its
   own defaults only where this spec is silent.
3. Post the German summary in the reply: the kid section of `spec.de.md` condensed to
   one screen, then the `OQ-xx` questions with options. The files stay the source of truth;
   the chat is what the kids actually read.
4. After the kids confirm, set `status: confirmed`, fill `confirmed_by` / `confirmed_on`,
   bump `spec_version`, add a changelog line. From then on changes are change requests:
   new ID, new AC, version bump — never an edit in place.

## 8. Kid-safety floor (never waived)

- No accounts, no e-mail, no stored names, no analytics with personal data.
- No ads, no purchases, no external links, no chat, no user-generated content.
- Mute control and a way out of the game always reachable.
- No copyrighted characters, names, music or art. "Like Minecraft" ⇒ own blocks, own
  names, and a `RISK-xx` line.
- An adult checks the content for the target age and records who did.
- If a child asks for anything above, it becomes a question with a cost, not a feature.

## 9. Reference map

| File | Read it for |
| --- | --- |
| `references/spec-format.md` | exact frontmatter, sections, tables, IDs, handoff fields |
| `references/intake-and-language.md` | reading kids' German, glossary rules, kid-German style |
| `references/gaps-and-questions.md` | gap taxonomy, blocker rules, German phrasing |
| `references/acceptance-and-handoff.md` | bridge-based ACs, test types, handoff and change protocol |
| `references/examples.md` | one worked example: German line in, requirement out |

## 10. Definition of done

- [ ] `intake.de.md` verbatim, one statement per line, no blanks
- [ ] `spec.md` in English, honest `status`, handoff JSON complete
- [ ] every unknown is `AD-xx` or `OQ-xx` — nothing guessed silently
- [ ] every `P0` has a bridge-testable AC; every requirement has a trace or an `AD-xx`
- [ ] `spec.de.md` mirrors every ID, in kid German, with a confirmation block
- [ ] `open-questions.de.md` has ≤ 5 questions, blockers first, options with a recommendation
- [ ] `node scripts/check-spec.mjs` prints `PASS`; its counts are quoted in the final message
