---
spec: game-requirement
spec_version: 0.1.0
status: draft
game: {{GAME}}
ui_language: de
target_skill: webgame-development
intake: intake.de.md
confirmed_by:
confirmed_on:
---

# {{GAME}} — requirements spec

> Canonical contract for `webgame-development`. Read §2 first, then §5 and §6.
> German mirror for the kids: `spec.de.md`. Questions and ideas: `open-questions.de.md`.

## 1. Game summary

A short, funny side-scrolling race with three animals: the player picks one, runs three
laps along a desert track, collects bananas and avoids cacti. The fun is the speed and
the near misses; one round takes about four minutes and ends on a result screen that
ranks all three animals.

The kids' own words: "Tiere, die rennen" (Z.1), "wie Mario Kart, aber mit Tieren" (Z.7).
The comparison is used as a feel reference only — no Nintendo characters, names, music
or art (see `RISK-01`).

## 2. Handoff to webgame-development

```json
{
  "name": "{{GAME}}",
  "genre": "side-scrolling race, 3 laps",
  "viewpoint": "side-scroll-2d",
  "world": "one desert track, 3 laps, 960x600 logical, horizontal scroll",
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
  "out_of_scope": ["more levels", "multiplayer", "online leaderboard"],
  "snapshot_keys": ["player.x", "player.speed", "player.animal", "score", "lap", "phase"]
}
```

`snapshot_keys` is optional; it tells the dev skill which state names the ACs read.
Any value that differs from the `webgame-development` baseline needs its reason key
(`resolution_reason`, `ui_language_reason`).

## 3. Players and context

| Topic | Answer |
| --- | --- |
| Age | 8–11 |
| Who | small groups in a school, mixed reading level |
| Device | school tablet (touch) and laptop (keyboard) |
| Place | classroom, short breaks, sound may be off |
| Players per device | 1 |
| Reading load | icons + lines of ≤ 8 words |

Glossary — kid words kept as they are:

| Kid word | English gloss | Where it appears |
| --- | --- | --- |
| Banane | banana | collectible, UI label "Bananen" |
| Kaktus | cactus | obstacle |
| Runde | lap | HUD "Runde 1/3" |
| Nochmal | retry | result screen button |

## 4. Core loop

1. The animal runs right automatically at a slow base speed.
2. The player steers up/down to line up with bananas and avoid cacti.
3. Collecting a banana adds 1 point and a short sound.
4. Hitting a cactus ends the run.
5. After 3 laps the result screen shows the ranking and "Nochmal".

- Win: first to finish 3 laps; the player sees their rank and points.
- Lose: one crash ends the run; "Nochmal" restarts from the start (AD-06).
- Retry: one tap, same seed, no menu dive.

## 5. Requirements

| ID | Requirement (English) | Prio | Conf | Trace |
| --- | --- | --- | --- | --- |
| F-001 | The animal moves right on its own at 120 px/s; holding right raises the speed to 220 px/s; up/down switch the lane. | P0 | EXPLICIT | Z.2 |
| F-002 | Collecting a banana adds 1 point and plays a pickup sound. | P0 | EXPLICIT | Z.5 |
| F-003 | Hitting a cactus ends the run, plays a hit sound and shows "Nochmal". | P0 | EXPLICIT | Z.6 |
| F-004 | After 3 laps the result screen shows the rank of all three animals, the player's points and "Nochmal". | P0 | EXPLICIT | Z.8 |
| F-005 | The current level and best score are saved to `localStorage` and restored on reload. | P1 | EXPLICIT | Z.11 |
| C-001 | Three animals exist with the kids' names: Lama, Fuchs, Pinguin. | P0 | EXPLICIT | Z.3 |
| C-002 | The penguin's top speed is 1.25× the llama's; the fox sits between them. | P1 | DERIVED | Z.4, AD-05 |
| N-001 | Touch works on a tablet: every control is reachable and ≥ 48 px. | P0 | EXPLICIT | Z.10 |
| N-002 | Music plays when the run starts; a mute button is always visible and its state persists. | P1 | EXPLICIT | Z.9 |
| N-003 | The game holds 60 FPS on the school tablet; below 45 FPS it drops particles instead of frames. | P1 | DEFAULT | AD-02 |
| S-001 | The game loads no third-party requests, shows no ads and needs no account. | P1 | DEFAULT | AD-01 |

Do not put `|` inside a cell. One observable behaviour per row.

## 6. Acceptance criteria

| AC | Covers | Given | When | Then | Test |
| --- | --- | --- | --- | --- | --- |
| AC-001 | F-001 | seed=42, started | step(120) after setInput({right:true}) | snapshot().player.speed === 220 and snapshot().player.x > 200 | unit |
| AC-002 | F-002 | seed=42, banana on the path | step(300) after setInput({right:true}) | snapshot().score === 1 and events() contains "banana.pickup" | unit |
| AC-003 | F-003 | seed=42, cactus on the path | step(600) after setInput({right:true}) | snapshot().phase === "lost" and events() contains "run.crash" | unit |
| AC-004 | F-004 | seed=42, last lap | step(60) after the finish line | snapshot().phase === "results" and the rank list has 3 entries | unit |
| AC-005 | C-001 | seed=42, started | snapshot() after start(42) | the animal names are "Lama", "Fuchs", "Pinguin" | unit |
| AC-006 | N-001 | ?seed=42 on a 1024×768 touch viewport | tap the right control once | the animal moves and every control box is ≥ 48 px | e2e |
| AC-007 | C-002 | seed=42 | start(42) then snapshot() | penguin > fox > llama > 0 | unit |
| AC-008 | F-005 | ?seed=42, score 3 | reload the page | the saved best score is restored | e2e |
| AC-009 | N-002 | ?seed=42, run started | click the mute button | audio is silent and the muted state survives a reload | e2e |
| AC-010 | S-001 | ?seed=42 | load the page once | no requests to third-party hosts, no ad nodes, no console errors | e2e |
| AC-011 | N-003 | ?seed=42, 240 real frames | measure the frame budget | median FPS ≥ 60 and long-frame ratio ≤ 5 % | perf |

## 7. Out of scope

- More than one level — "Mehr Level später, erstmal eins" (Z.12).
- Multiplayer or split-screen: doubles input and camera work, not in the first slice.
- Online leaderboard: needs a backend and personal data, forbidden by `S-001`.
- Character customisation: nice, but nothing in the intake asks for it.

## 8. Assumptions and defaults

| ID | Assumption | Why we assumed it | If wrong, change |
| --- | --- | --- | --- |
| AD-01 | No ads, accounts, trackers or external links. | Kids' product, safety floor. | S-001 and the release checklist. |
| AD-02 | 960×600 logical, 60 Hz, TypeScript strict, Vite, Canvas 2D. | `webgame-development` baseline. | N-003 and the handoff JSON. |
| AD-03 | The game UI is German. | The players are German kids. | `ui_language` plus the German strings. |
| AD-04 | One track, three laps per run. | "Nach 3 Runden" (Z.8), "erstmal eins" (Z.12). | F-004, C-001, level content. |
| AD-05 | "Der Pinguin ist der schnellste" means 1.25× the slowest, not instant win. | A playable race needs a reachable finish. | C-002 and the balance tuning. |
| AD-06 | A crash ends the run; "Nochmal" starts from the beginning, no checkpoints. | No checkpoint was mentioned, and short retries suit the age group. | F-003, AC-003, OQ-01. |

## 9. Traceability

| Kid statement | Becomes | Note |
| --- | --- | --- |
| Z.1 | F-001 | "Tiere, die rennen" became the race premise |
| Z.2 | F-001 | keyboard named by the kids, touch added for the school tablet |
| Z.3 | C-001 | names kept verbatim |
| Z.4 | C-002 | "fastest" became a speed ratio |
| Z.5 | F-002 | collectible plus score plus sound |
| Z.6 | F-003 | crash ends the run |
| Z.7 | RISK-01 | "wie Mario Kart": feel only, own art, no Nintendo assets |
| Z.8 | F-004 | three laps and a result screen |
| Z.9 | N-002 | music is P1, not needed for the first slice |
| Z.10 | N-001 | tablet in school ⇒ touch is P0 |
| Z.11 | F-005 | save means `localStorage`, not an account |
| Z.12 | — | more levels: explicitly later |

## 10. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-01 | Kids expect Mario Kart, including its characters and music. | Own animals and art, no Nintendo names, sounds or fonts. |
| RISK-02 | School tablets drop below 45 FPS with particles and music. | Quality tiers, particle cap, mute default at home, N-003. |

## 11. Open questions

- OQ-01 (NOT-BLOCKER) — After a crash, restart from the start or from the last lap? Default: from the start (AD-06).
- OQ-02 (BLOCKER) — Race against two computer animals, or only against the clock? The kids said "wer am weitesten ist" (Z.8) but the animals could be skins.

`BLOCKER` means the answer changes the core loop; the dev skill must not default it.

## 12. Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | {{DATE}} | first draft from the kids' intake |
