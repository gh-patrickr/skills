# Spec format (machine-checked)

`scripts/check-spec.mjs` parses the four files. This page is the exact shape it
accepts. Deviate and the run fails — that is the point: the format is what lets
`webgame-development` read the spec without asking a human to interpret it.

## File set

| File | Language | Role |
| --- | --- | --- |
| `intake.de.md` | German, verbatim | evidence; one statement per line, line number = `Z.n` |
| `spec.md` | English | canonical contract for the dev skill |
| `spec.de.md` | German, kid language | translation for confirmation; same IDs |
| `open-questions.de.md` | German, kid language | `OQ-xx`, `GAP-xx`, `IDEA-xx` |

`spec.md` is the source of truth. If the German files and `spec.md` disagree, the
English one wins until the kids change it — then both change and the version bumps.

## `intake.de.md`

- Line 1 = first statement. No frontmatter, no headings, no blank lines, no `- ` bullets.
- One idea per line. Split a paragraph like "wir wollen rennen und sammeln und vielleicht
  auch kämpfen" into three lines.
- Speaker tag when more than one child: `[Lena] …`. Use the name the kids use.
- Keep wording, spelling and dialect. Do not fix grammar, do not translate.
- Filler ("ähm", "also", "weißt du") may stay; it is cheap and keeps the evidence honest.
- 3–80 lines is the useful range. Longer means several games in one file — split them.

## `spec.md` frontmatter

```yaml
---
spec: game-requirement
spec_version: 0.1.0
status: draft            # draft | ready | confirmed
game: Tier-Rennen
ui_language: de          # de | en | de+en
target_skill: webgame-development
intake: intake.de.md
confirmed_by:
confirmed_on:
---
```

| Key | Rule |
| --- | --- |
| `spec` | always `game-requirement` |
| `spec_version` | `MAJOR.MINOR.PATCH`; bump MINOR on any requirement change, PATCH on wording |
| `status` | `draft` while writing, `ready` for handoff, `confirmed` after the kids signed off |
| `game` | the name the kids use; may stay German |
| `ui_language` | language of the game's own UI, not of the spec |
| `target_skill` | always `webgame-development` |
| `confirmed_by` | names/initials of the kids who confirmed, only when `confirmed` |
| `confirmed_on` | `YYYY-MM-DD`, only when `confirmed` |

`status: ready` and `confirmed` add gates: no `TBD`/`TODO`, every `P0` covered by an AC,
zero open blockers, changelog mentions the current `spec_version`.

## Sections (English, numbered, this order)

| Nr | Heading must contain | Content |
| --- | --- | --- |
| 1 | Game summary | 5–10 sentences: what the player does, why it is fun, what "one round" is |
| 2 | Handoff | the JSON block below |
| 3 | Players and context | age, devices, place, reading level, glossary of kid words |
| 4 | Core loop | numbered 20-second loop, then win / lose / retry lines |
| 5 | Requirements | tables, see below |
| 6 | Acceptance criteria | table, see below |
| 7 | Out of scope | bullets with a reason each; the kid quote that put it there |
| 8 | Assumptions and defaults | `AD-xx` table |
| 9 | Traceability | `Z.n` → ID table |
| 10 | Risks | `RISK-xx` table |
| 11 | Open questions | `- OQ-xx (BLOCKER|NOT-BLOCKER) — …` list |
| 12 | Changelog | `| Version | Date | Change |` |

The checker matches the number and a keyword; the rest of the heading is yours.

## §2 handoff JSON

```json
{
  "name": "Tier-Rennen",
  "genre": "side-scrolling race",
  "viewpoint": "side-scroll-2d",
  "world": "one desert track, 3 laps, 960x600 logical",
  "resolution": "960x600",
  "framerate": 60,
  "input": ["keyboard", "touch"],
  "session_minutes": 4,
  "players": 1,
  "ui_language": "de",
  "save": "localStorage",
  "audio": "sfx+music",
  "levels": 1,
  "seed": 42,
  "out_of_scope": ["more levels", "multiplayer", "online leaderboard"]
}
```

| Field | Type / allowed |
| --- | --- |
| `name` | non-empty string |
| `genre` | free string, short |
| `viewpoint` | `side-scroll-2d`, `top-down-2d`, `isometric-2d`, `fixed-camera-2d`, `3d` |
| `world` | one line: what fits on screen, how a round is laid out |
| `resolution` | `WIDTHxHEIGHT`; `960x600` is the baseline — any other value needs `resolution_reason` |
| `framerate` | `30` or `60` |
| `input` | non-empty array of `keyboard`, `pointer`, `touch`, `gamepad` |
| `session_minutes` | integer 1–30, time to one result screen |
| `players` | integer 1–4, local only |
| `ui_language` | `de`, `en` or `de+en`; anything but `de` needs `ui_language_reason` |
| `save` | `none`, `localStorage`, `localStorage+export` |
| `audio` | `none`, `sfx`, `sfx+music` |
| `levels` | integer ≥ 1 |
| `seed` | integer, the seed the ACs use |
| `out_of_scope` | non-empty array of short strings |

Optional extra keys are allowed (`resolution_reason`, `ui_language_reason`, `theme`,
`art_style`, `notes`). The checker rejects unknown *required* values, not extra keys.

## §5 requirement tables

```text
| ID | Requirement (English) | Prio | Conf | Trace |
| --- | --- | --- | --- | --- |
| F-001 | Holding right moves the animal right at 220 px/s. | P0 | EXPLICIT | Z.2 |
| S-001 | The game loads no third-party requests and shows no ads. | P1 | DEFAULT | AD-01 |
```

| Prefix | Use for |
| --- | --- |
| `F-xxx` | behaviour the player can trigger or observe |
| `C-xxx` | content: characters, levels, items, texts |
| `N-xxx` | non-functional: frame budget, device, input, audio, save, load time |
| `S-xxx` | safety, legal, privacy, content suitability |

Rules:

- IDs are `F-001`-style, three digits, unique across all four prefixes.
- One behaviour per row. "Collects bananas and the score grows and a sound plays" is
  three rows or one row plus two ACs — not one sentence with three verbs.
- Write what is observable: numbers (`220 px/s`, `3 laps`, `≥ 48 px`), names, events.
- `Prio`: `P0` needed for the first playable slice, `P1` needed for a good version,
  `P2` nice later. More than six `P0` rows means the slice is too big — cut.
- `Conf`: `EXPLICIT` needs a `Z.n`; `DEFAULT` needs an `AD-xx`; `DERIVED` needs a `Z.n`
  or another requirement ID.
- Do not use `|` inside a cell; write `or`, `/` or "and".

## §6 acceptance criteria table

```text
| AC | Covers | Given | When | Then | Test |
| --- | --- | --- | --- | --- | --- |
| AC-001 | F-001 | seed=42, started | step(120) after setInput({right:true}) | snapshot().player.x > 200 | unit |
```

- `Covers` lists requirement IDs, comma-separated; every ID must exist in §5.
- `Test` ∈ `unit`, `e2e`, `visual`, `a11y`, `bot`, `perf`.
- For `unit` and `bot` the `Given`/`When` cells must contain a bridge call: `step(`,
  `?seed=`, `autoplay(`, `setInput(`, `start(` or `restart(`. `e2e` may use a real
  tap or click in `When` instead.
- `Then` is a comparison, a value or an event name. "Fun", "smooth", "nice" are not
  criteria.

## §8 assumptions table

```text
| ID | Assumption | Why we assumed it | If wrong, change |
| --- | --- | --- | --- |
| AD-01 | No ads, accounts or trackers. | Kids' product, safety floor. | S-001 and the release checklist. |
```

`AD-xx` IDs are two digits. Every `DEFAULT` requirement must reference one that exists.

## §9 traceability table

```text
| Kid statement | Becomes | Note |
| --- | --- | --- |
| Z.3 | C-001 | three animals, names kept |
| Z.7 | RISK-01 | "like Mario Kart" → own art, no Nintendo assets |
| Z.12 | — | more levels: out of scope for now |
```

- `Becomes` is a requirement ID, `RISK-xx`, `AD-xx`, or `—`.
- Every `Z.n` used as a trace in §5 must appear here, and every `Z.n` here must exist
  in `intake.de.md`.
- One statement may produce several rows (one per resulting ID). Do not merge them into
  one row with a comma; each row gets its own note.
- Lines that produced nothing still get a row with `—` and a reason. Nothing a child
  said disappears without a note.

## §10 risks table

```text
| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-01 | Kids expect Mario Kart, including its characters. | Own animals, own art, no Nintendo names or music. |
```

`RISK-xx`, two digits. Typical: IP, device performance, scope, reading load, audio
autoplay, save corruption, content suitability for the age.

## §11 open questions

```text
- OQ-01 (NOT-BLOCKER) — Restart after a crash: from the start or from the last lap? Default: from the start (AD-06).
- OQ-02 (BLOCKER) — Race against computer animals or only against the clock? Changes the core loop.
```

The IDs must match the `OQ-xx` headings in `open-questions.de.md` exactly — same set,
both directions. When every question is answered, write `None open.` and list what the
answers changed; an empty list is a finished round, not a missing section. `BLOCKER` means "the answer changes the core loop or the first slice";
everything else is `NOT-BLOCKER` and gets a default.

## §12 changelog

```text
| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | first draft from intake |
```

The newest row must mention the current `spec_version` when `status` is `ready` or
`confirmed`. One row per change, newest first.

## German mirror rules

`spec.de.md` must contain every requirement ID, every `AC-xx`, every `AD-xx` from
`spec.md`, with a visible mapping from English priority:

| English | German |
| --- | --- |
| `P0` | `Muss` |
| `P1` | `Sollte` |
| `P2` | `Kann später` |

The checker compares the two, so a requirement that exists only in English is a
requirement the kids never confirmed — it fails.

`open-questions.de.md` block formats are in `references/gaps-and-questions.md`.
