# Acceptance criteria and handoff

The spec's job is to be implementable and testable by `webgame-development` without a
second conversation. That means every `P0` requirement carries an acceptance criterion
the dev skill can turn into a failing test on the first try.

## 1. The bridge is the contract

The dev skill's e2e build exposes a deterministic bridge (`src/bridge.ts`, `window.__WG__`):

| Call | Use it for |
| --- | --- |
| `start(seed)` / `restart(seed)` | fresh deterministic run |
| `step(frames)` | advance the simulation without wall-clock time |
| `setInput(patch)` / `clearInput()` | press and release |
| `snapshot()` | read state: score, position, phase, entities |
| `events()` | names of gameplay events since start (`banana.pickup`) |
| `autoplay(frames)` | bot run for `bot` tests |
| `endRun()` | force a run end |
| `setReducedMotion(bool)` | accessibility checks |
| `errors()`, `fps()` | console errors, frame rate |

A requirement that cannot be read through this surface is a note, not a requirement.
Name the snapshot keys you rely on in §2 as an optional `snapshot_keys` array so the dev
skill exposes exactly those.

## 2. Writing the criterion

```text
| AC | Covers | Given | When | Then | Test |
| --- | --- | --- | --- | --- | --- |
| AC-003 | F-003 | seed=42, started, moving right | step(600) | snapshot().phase === "lost" and events() contains "run.crash" | unit |
```

- `Given`: seed, starting state, inputs already held.
- `When`: one bridge call chain. No real waiting, no "after a while".
- `Then`: a value comparison, an event name, or a rendered difference. One line.
- `Covers`: the requirement IDs, so a missing AC is visible.

Bad: `Then: the game feels fast and responsive.`
Good: `Then: snapshot().player.x advances ≥ 220 px per 60 frames at top speed.`

## 3. Test types

| `Test` | Runs as | Good for |
| --- | --- | --- |
| `unit` | Node, pure core, no DOM | rules, scoring, collision, state machine, save format |
| `e2e` | Playwright + bridge | start screen, restart, input wiring, no console errors |
| `visual` | screenshot baseline | layout, readable text, stable HUD |
| `a11y` | role/label/contrast audit | buttons, focus, labels, contrast |
| `bot` | `autoplay(N)` | no NaN, no stall, progress happens, 4 seeds |
| `perf` | real frames | FPS floor, long-frame ratio, bundle budget |

Rules:

- `unit` and `bot` criteria must contain a bridge call in `Given`/`When`; `e2e` may
  use a real tap or click instead. The checker enforces both.
- Negative requirements (`S-xxx`) are tests too: no third-party requests, no ad nodes, no
  console errors, no focus trap. `Test: e2e`.
- Determinism: same seed ⇒ same state. Only assert a hash when the rule is stable, and
  then put the hash in the AC, not in prose.
- One criterion per behaviour. If `Then` needs "and" three times, split it.

## 4. Coverage rules the checker applies

- Every `P0` requirement has ≥ 1 AC. Otherwise `status: ready` fails.
- Every requirement (`P0`–`P2`) has ≥ 1 AC or an explicit `P2` note in §7. A `P1` without
  a test is a `P2` in disguise — demote it.
- Every `Covers` ID exists. ACs that cover nothing are removed, not kept "for later".
- Every `AC-xx` appears in `spec.de.md`, so the kids can confirm the checks too.

## 5. Handoff to `webgame-development`

1. `status: ready`, blockers `0`, `node scripts/check-spec.mjs` prints `PASS`.
2. The dev skill reads, in this order: `spec.md` §2 (handoff JSON), §3 (context), §4
   (loop), §5 (requirements), §6 (ACs).
3. It maps `resolution`/`framerate`/`input`/`ui_language`/`save`/`audio`/`levels`/`seed`
   into its own config and records anything it had to default in `docs/assumptions.md` —
   and reports it back, so a wrong assumption becomes a spec change, not a silent drift.
4. It uses its own defaults only where the spec is silent, and never replaces a `P0`
   requirement with something "nicer".
5. Its evidence run must include a test per AC. If an AC cannot be automated, it says so
   before building, not after.

Do not hand over: drafts, English text for kids, requirements with no AC and no reason,
`P0` lists longer than six, or a spec whose German mirror is missing IDs.

## 6. Change protocol

After `status: confirmed`, the spec is frozen until a change request:

1. New row in `open-questions.de.md`? No — change requests are not questions. Use the
   `OQ-xx` block with `**Wichtig:** ja` and the options, because the kids must agree.
2. On agreement: add or edit the requirement (new ID if behaviour changed), add the AC,
   bump `spec_version` (MINOR), add a changelog row, update the German mirror, set
   `status: ready` again until the kids re-confirm.
3. Never edit a requirement in place silently. The changelog is the only place where
   "what changed" is allowed to be short.

While a change is pending, the dev skill keeps the old behaviour. A half-implemented
change is worse than a delayed one, because the kids test the game, not the ticket.

## 7. Handoff checklist

- [ ] `spec.md` frontmatter complete, `status` honest
- [ ] handoff JSON validates, `resolution`/`ui_language` overrides have a reason
- [ ] `P0` ≤ 6, each with a bridge-based AC
- [ ] `snapshot_keys` listed if the ACs depend on state names
- [ ] every `EXPLICIT` row traces to a non-empty `Z.n`
- [ ] German mirror contains every ID and the German questions contain every `OQ-xx`
- [ ] `node scripts/check-spec.mjs docs/requirements` exits `0`
