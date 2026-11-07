# Worked example: one German sentence at a time

Input was a group of three kids, 9–10, talking over each other. Twelve intake lines, one
finished spec, two German files. This page shows the decisions, not the whole spec.

## Intake (verbatim, line numbers are the trace IDs)

```text
[Lena] Also, wir wollen ein Spiel mit Tieren, die rennen.
[Max] Man fährt mit den Pfeiltasten nach rechts.
[Lena] Es gibt ein Lama, einen Fuchs und einen Pinguin.
[Lena] Der Pinguin ist der schnellste.
[Max] Auf dem Weg liegen Bananen, die muss man einsammeln.
[Max] Wenn man gegen einen Kaktus fährt, verliert man.
[Lena] Es soll wie Mario Kart sein, aber mit Tieren.
[Lena] Nach 3 Runden ist das Spiel vorbei und wer am weitesten ist, gewinnt.
[Max] Musik wäre cool.
[Lena] Wir spielen das auf dem Tablet in der Schule.
[Max] Man soll speichern können, damit man nicht jedes Mal von vorne anfängt.
[Lena] Mehr Level später, erstmal eins.
```

## Decisions, line by line

| Z | What it is | Where it goes | Why |
| --- | --- | --- | --- |
| 1 | Fantasy | `F-001` + §1 summary | the game's premise |
| 2 | Controls | `F-001`, handoff `input` | keyboard is named, touch is added by the study device (Z.10) |
| 3 | Content | `C-001` | three named animals, names kept |
| 4 | Balance | `C-002` | "fastest" is a stat, so it is testable: `topSpeed` |
| 5 | Collectible | `F-002` + AC | score and sound observable |
| 6 | Fail | `F-003` + AC | observable state change |
| 7 | Comparison | `RISK-01`, not a requirement | "wie Mario Kart" is feel + IP risk, not a feature list |
| 8 | Win | `F-004` | 3 laps and a ranking result screen |
| 9 | Audio | `N-002`, `P1` | not needed for the first slice, cheap to add |
| 10 | Device | `N-001`, handoff `input: ["keyboard","touch"]` | tablet in school ⇒ touch is `P0` |
| 11 | Save | `F-005`, `P1` | `localStorage`, not an account |
| 12 | Scope edge | §7 out of scope | explicitly later, do not build |

Two gaps the kids did not mention, both defaulted instead of asked:

- What happens after a crash? No checkpoint mentioned ⇒ `AD-06`: run ends, "Nochmal"
  restarts from the start. Confirm-only `OQ-01`.
- Is the race against computer animals or only the clock? "wer am weitesten ist" implies
  opponents, but the animals could be the player's skins. This changes the core loop ⇒
  `OQ-02`, `BLOCKER`. It is the one question the dev skill cannot default.

## How the rows read in English

```text
| ID | Requirement (English) | Prio | Conf | Trace |
| --- | --- | --- | --- | --- |
| F-003 | Hitting a cactus ends the run, plays a hit sound and offers "Nochmal". | P0 | EXPLICIT | Z.6 |
| C-002 | The penguin's top speed is 1.25× the llama's; the fox is between them. | P0 | DERIVED | Z.4 |
| S-001 | The build loads no third-party requests, shows no ads and needs no account. | P1 | DEFAULT | AD-01 |
```

Note `C-002`: the kids said "the penguin is the fastest", not a ratio. The ratio is a
default, labelled `DERIVED` from `Z.4` plus the balance default `AD-05` — visible, not
hidden in the code.

## How it reads back to the kids

```text
| ID | Was du im Spiel merkst | Wichtig? |
| --- | --- | --- |
| F-003 | Wenn du einen Kaktus berührst, ist die Runde vorbei und du kannst neu starten. | Muss |
| C-002 | Der Pinguin ist am schnellsten, dann der Fuchs, dann das Lama. | Muss |
| S-001 | Keine Werbung, keine Anmeldung, keine fremden Seiten. | Sollte |
```

Same IDs, same order, shorter sentences, no mechanisms.

## The one blocking question

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

## An idea, offered not built

```text
## IDEA-01 — Ein Geist deiner besten Runde
**Idee:** Ein durchsichtiges Tier fährt genau die Strecke, die du beim letzten Mal gefahren bist.
**Aufwand:** mittel
**Warum es Spaß macht:** Du kannst gegen dich selbst rennen, ohne einen Gegner.
**Eure Antwort:** ____
```

## What was cut, and why

- "Online-Highscore": safety floor, no backend for a school tablet, `out_of_scope`.
- "Zu zweit an einem Tablet": local split input is possible but doubles the input and
  camera work; noted, not in the first slice.
- "Mehr Level": `Z.12` says later; building one that is fun for 60 seconds wins.

## The bad version, for contrast

```text
F-001: The game should be fun and fast, with animals racing.
AC-001: When the player plays, the game feels like Mario Kart.
```

No number, no state, no test, and a trademark. The dev skill would guess, the kids would
see a different game, and nobody could tell who was wrong.
