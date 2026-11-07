# Gaps, open questions, improvement ideas

A gap is anything the kids did not say that the game still needs. Every gap has exactly
two exits: a written default (`AD-xx`) or a German question (`OQ-xx`). The difference is
whether the answer changes what the kids will play.

## 1. Blocker test

Ask: **would a different answer change the core loop or the first playable slice?**

- Yes → `BLOCKER`. Ask. There are at most three.
- No → `NOT-BLOCKER`. Default it, ask it anyway only if you have room under five
  questions, and mark it as confirm-only.
- Never block on technology, scope of the spec document, or anything the dev skill owns.

Rules the checker and the skill agree on:

- `BLOCKER` count > 0 ⇒ `status: ready` is forbidden. Draft until answered.
- Total `OQ-xx` ≤ 5. Kids stop reading after that.
- Every `OQ-xx` appears in both `spec.md` §11 and `open-questions.de.md` with the same ID
  and the same blocker flag. The German one carries the options.

## 2. Gap taxonomy

| # | Gap | How you notice it | Default if not blocking | Ask if… |
| --- | --- | --- | --- | --- |
| 1 | No win condition | "man rennt und sammelt" with no end | time or distance target, result screen | the kids described a race but not a finish |
| 2 | No fail condition | nothing bad happens | one forgiving fail + instant retry | failure means a whole new idea (fighting, lives) |
| 3 | No retry | result screen ends cold | big "Nochmal" button, same seed | — |
| 4 | No core loop repeat | one action described once | 20-second loop, repeat until result | the loop changes on round 2 |
| 5 | Unbounded quantity | "viele Level", "unendlich" | 1 level, 3 laps, 3 lives | content volume drives the schedule |
| 6 | No difficulty | everything is the same speed | 3 difficulty steps across the round | the kids want "easy for everyone" vs "hard" |
| 7 | No feedback | no sound, no score, no flash | score + sound + hit flash | — |
| 8 | No start state | game begins mid-action | title screen + "Start" + controls hint | — |
| 9 | Device unclear | "auf dem Tablet" vs keyboard | keyboard + touch both | a keyboard-only design breaks the device |
| 10 | Language unclear | kids switch between German and English | German UI | the kids want English words in the game |
| 11 | Audio unclear | "Musik wäre cool" | SFX on, music optional, mute visible | music licensing or no audio at all |
| 12 | Save unclear | "nicht immer von vorne" | `localStorage`, one slot, reset | accounts or cross-device are expected |
| 13 | Session length | not mentioned | 3–5 minutes to a result | the game is meant for a 20-minute lesson |
| 14 | Tutorial / first 10 s | assumed understood | one-line hint that fades | controls are unusual (drift, brake, jump+duck) |
| 15 | Multiplayer wish | "zu zweit", "gegen Freunde" | local hot-seat is out of scope, note it | they expect it in the first version |
| 16 | Online anything | "Highscore online", "Chat" | out of scope + safety note | never for kids; explain why in German |
| 17 | IP / clone | "wie Mario Kart / Minecraft / Fortnite" | own characters, own art, `RISK-xx` | nothing to ask — it is a rule, not a question |
| 18 | Reading load | long instructions in the idea | icons + ≤ 8-word lines | the age group cannot read fluently yet |
| 19 | Accessibility | not mentioned | 48 px targets, contrast, reduced-motion toggle | a child in the group needs it |
| 20 | Performance device | "in der Schule" | 60 Hz target with a quality tier | the device is a 10-year-old tablet |
| 21 | Content suitability | fighting, scary, ads | age-appropriate, adult check recorded | the game contains violence or money |
| 22 | "And then?" ending | the idea stops after winning | result screen + "Nochmal" | they expect a campaign |

## 3. Writing the German question

```text
## OQ-03 — Was passiert, wenn du gegen einen Kaktus fährst?
**Wichtig:** nein
**Warum wir fragen:** Davon hängt ab, wie streng das Spiel ist.
**Was wir vermuten:** Die Runde ist vorbei und du startest neu (unser Vorschlag).
- A) Runde vorbei, sofort neu starten
- B) Runde vorbei, erst nach 3 Sekunden neu starten
- C) Du verlierst nur ein Leben und fährst weiter
**Unsere Empfehlung:** A
**Eure Antwort:** ____
```

Rules:

- Title is the question in kid words, one sentence.
- `**Wichtig:** ja` means it blocks; `nein` means it is a confirmation of a default.
- `**Warum wir fragen:**` says what changes, never "we need a decision".
- `**Was wir vermuten:**` is your default, with the `AD-xx` id in the English spec.
- Options are concrete outcomes, not adjectives. Include the boring one.
- `**Unsere Empfehlung:**` always present — kids trust a recommendation and correct it.
- `**Eure Antwort:** ____` always present, blank until answered.

## 4. Missing-slot block (`GAP-xx`)

For something the kids never mentioned and you do not want to invent as a requirement:

```text
## GAP-02 — Was passiert nach dem Sieg?
**Warum wichtig:** Sonst endet das Spiel plötzlich und es gibt keinen Grund, nochmal zu spielen.
**Was wir vermuten:** Ein Ergebnisbildschirm mit Pokal und "Nochmal".
**Was wir vorschlagen:** Ergebnisbildschirm, Beste Punkte, "Nochmal"-Knopf.
**Eure Antwort:** ____
```

`GAP-xx` is not a requirement. When the kids answer, it becomes one: new `F-xxx`, new AC,
version bump. Until then it lives only in the German file and in §7/§10 of the spec.

## 5. Improvement ideas (`IDEA-xx`)

Ideas nobody asked for. Only propose ideas that are cheap, add fun for the age group, and
do not widen the scope.

```text
## IDEA-01 — Ein Geist deiner besten Runde
**Idee:** Ein durchsichtiges Tier fährt genau die Strecke, die du beim letzten Mal gefahren bist.
**Aufwand:** mittel
**Warum es Spaß macht:** Du kannst gegen dich selbst rennen, ohne einen Gegner.
**Eure Antwort:** ____
```

Effort words (never days, never sprint talk):

| Word | Means |
| --- | --- |
| `klein` | a few hours of work, no new system |
| `mittel` | one new system or a day of tuning |
| `groß` | a new mode, new art, or a new idea — probably a second game |

Good ideas for kids' games: instant restart, big touch buttons, sound on/off, a ghost of
your best run, a "Beste Punkte" line stored locally, a small celebration on winning, a
short how-to-play card, animal noises on pickup, a colour-blind-safe palette.

Bad ideas, do not propose: online leaderboards, accounts, multiplayer, chat, skins for
money, daily challenges with a server, anything that needs a backend.

## 6. Ordering and count

1. `BLOCKER` questions first (max 3).
2. `NOT-BLOCKER` questions (so the total stays ≤ 5).
3. `GAP-xx`, most important first.
4. `IDEA-xx`, cheapest and most fun first, max 3.

If the input was one sentence, do not produce twelve questions. Default everything, ship
a 60-second slice, show it, and ask the three questions that matter after the kids have
seen something move.

## 7. Anti-patterns

- Asking a child to pick a framework, a canvas size, or a test strategy.
- Turning "wie Mario Kart" into "kart racer with items" — that is the kids' idea, not
  yours, and the IP risk is real.
- Writing `OQ-xx` for something you already decided. That is a lie with extra steps.
- Ten questions in a "nice list". Kids answer two.
- Questions without a recommendation. Kids answer "weiß nicht".
- Answering the question in `**Eure Antwort:**` to keep the process moving. Leave it blank.
- Promising the answer's result before the kids answered.
