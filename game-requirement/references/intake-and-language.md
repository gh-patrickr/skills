# Intake and language: kids' German in, English spec out, kid German back

Three languages are in play at once: the kids' spoken German, the English spec, and the
German you write *back* to them. Mixing them up is the most common failure of this skill.

## 1. Capture without cleaning

Write `intake.de.md` while the idea is still messy. Rules:

- One statement per line. The line number is the trace ID `Z.n`, so it must never move.
  If you add a line later, append it; never insert.
- Keep the speaker: `[Lena]`, `[Max]`, `[Kind 2]`. Kids contradict each other; the
  speaker tells you whose wish it is.
- Keep the mistakes. "Der Pinguin ist am schnellsten" and "Pinguin schnellste" are both
  fine. Normalising grammar loses the difference between a confident claim and a guess.
- Keep emphasis: "gaaanz viele Bananen", "ULTRA schnell". It carries the feel, which is
  a requirement (see `N-xxx` and the feel row of the core loop).
- Filler may stay. Do not rewrite a sentence into your own words; that is invention.

What you must not keep:

- Instructions to you ("mach das mal", "kannst du das programmieren") unless they carry a
  requirement. Then they become a line, not a task.
- Anything a child did not say. Your own ideas go to `IDEA-xx` in the German file — never
  into the intake.

## 2. Reading German from children

| Pattern | Example | What to do |
| --- | --- | --- |
| Comparison instead of description | "wie Mario Kart" | Take the *feel* (speed, drifting, chaos), never the IP. `RISK-xx` + own art. |
| Fuzzy quantity | "voll viele Level", "ganz schnell" | Pick a number, put it in `AD-xx`, confirm in `OQ-xx` if it changes scope. |
| Hyperbole | "unendlich Leben" | Interpret as "forgiving", propose 3 lives or a checkpoint. |
| Wish list without order | 12 ideas, no priority | Ask "was ist das Wichtigste?" once, default the rest to `P1`/`P2`. |
| Technical wish by proxy | "mit Speichern wie bei Fortnite" | Translate to the need: progress survives a reload. Not an account system. |
| Contradiction | "Fuchs gewinnt immer" vs "Pinguin ist schneller" | Keep both, note the conflict, default the playable one, ask in `OQ-xx`. |
| Shy or silent child | one word answers | Do not interview. Default, build something small, show it, ask again later. |
| Mixed German/English | "der Boss ist voll OP" | Keep as said; gloss in the glossary; game UI stays German unless asked. |
| Dialect / regional words | "Erdäpfel", "Jause", "Gokart", "Velo" | Keep the word, gloss it, use the standard German in UI only if kids agree. |
| Homonyms | "Maus" (animal or input device) | Disambiguate in §3 context, not by guessing. |

Ambiguity that survives all of this is a question, not a decision.

## 3. Names and glossary

Names invented by kids are content, not translation.

- `spec.md` keeps the German name and adds an English gloss: `Lama (llama)`,
  `Bananen-Rutsche (banana slide)`.
- Code identifiers may be English; the UI strings the child sees stay German.
- Never rename a character to make it "cleaner". A rename needs a version bump and a
  line in the changelog.
- The glossary lives in §3 of `spec.md`:

```text
| Kid word | English gloss | Where it appears |
| --- | --- | --- |
| Banane | banana | collectible, UI label "Bananen" |
| Kaktus | cactus | obstacle, never translated for the UI |
| Tier-Rennen | animal race | game title, kept as-is |
```

## 4. English spec style

- Present tense, active voice, one behaviour per sentence, numbers over adjectives.
- "The player collects a banana; score +1; `banana.pickup` event fires."
- Not: "Bananas should be collectible in a satisfying way."
- No hedging ("maybe", "perhaps", "we could") — that is an `OQ-xx`, not a sentence.
- The spec is read by an agent that will implement and test it. Anything it cannot test
  does not belong in §5.

## 5. German for kids

The German files are read by 8–12 year-olds, often on a tablet, often aloud in a group.

- `du`-form, present tense, active. "Du sammelst Bananen." Not "Es werden Bananen
  gesammelt."
- ≤ 12 words per sentence. One idea per line. No nested clauses.
- Concrete numbers and units the kids used: "3 Runden", "2 Sekunden", "so groß wie dein
  Daumen".
- Explain every technical word once, in brackets: "Speicher (das Spiel merkt sich deinen
  Stand)".
- No engineering words. Never: Requirement, Feature, MVP, Scope, Acceptance, Handoff,
  Spec, Blocker, Backend, Framework, Deploy, API, Ticket.
- Priority words: `Muss` (geht nicht ohne), `Sollte` (wichtig), `Kann später` (kommt
  vielleicht danach).
- Neutral, not teacherly. No "Super gemacht!", no praise, no scolding.
- Emojis are allowed but sparse: one per section at most, never inside a table.
- End with `## Bitte bestätigen`: checkboxes plus "Das ist falsch: ____" and
  "Das fehlt noch: ____". Kids confirm by ticking, not by writing essays.

## 6. Phrasebook

| Kids say | English spec | Kid German you write back |
| --- | --- | --- |
| Level | level / stage | Level (ein Abschnitt im Spiel) |
| Runde | lap / round | Runde |
| Gegner | opponent / enemy | Gegner |
| Punkte | score | Punkte |
| Leben | lives | Leben |
| Speichern | save to `localStorage` | Speichern (das Spiel merkt sich deinen Stand) |
| Steuerung | input / controls | Steuerung (Tasten oder Finger) |
| Schwierigkeit | difficulty curve | Wie schwer es wird |
| Ton | audio, mute | Ton (an oder aus) |
| Musik | music track | Musik |
| Highscore | best score | Beste Punkte |
| Hindernis | obstacle | Hindernis |
| Sammeln | collect | Einsammeln |
| Rennen | race | Rennen |
| Strecke | track | Strecke |

## 7. How to ask

- One question per `OQ-xx`. Two questions in one block get one answer and one guess.
- Give 2–3 options, lettered, plus a recommendation. Kids decide faster between options
  than in front of a blank line.
- Say what changes: "Das ändert, wie schwer das Spiel ist."
- Say what it costs in kid terms: "(dauert länger)", "(geht schnell)".
- `**Eure Antwort:** ____` stays, even empty. The blank is the invitation.
- Never ask a child to choose a technology, a number of tests, or a deadline.

## 8. Don't

- Don't paraphrase the kids into your words and call it intake.
- Don't translate the game's UI to English because the spec is English.
- Don't put English sentences in the German files "because it's shorter".
- Don't write a 40-line German spec for a one-level game. Kids stop at two screens.
- Don't answer a question in the German file on the kids' behalf. The blank stays blank
  until they fill it.
