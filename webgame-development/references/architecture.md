# Architecture

The starter is one idea enforced by tooling: **the game is a pure state machine,
and everything platform-shaped is an adapter around it.**

```
input.ts ──Intent──▶ game.update(dt) ──▶ Snapshot ──▶ renderer.draw()
   ▲                     │                  │
   └── test bridge ◀─────┴── event log ◀────┘
loop.ts (the only clock)            save.ts (injected storage)
```

## The fixed-timestep loop

`src/loop.ts` accumulates real frame time and calls `step(1000/60)` in fixed
increments. Three rules make it safe:

- **Clamp the frame delta** (`MAX_FRAME_MS = 250`): a background tab must not fast-
  forward the simulation or produce a huge collision step.
- **Cap catch-up steps** (`MAX_STEPS_PER_FRAME = 8`) and drop the remaining
  backlog: a slow frame may not spiral into an ever-growing queue.
- **Render after stepping**, never inside `update`. Rendering must not affect
  state, or determinism dies the first time a frame drops.

`update(intent, dtMs)` clamps `dtMs` to 50 ms itself. Never call `update` with an
unclamped delta from an event handler.

Do not add interpolation to the *simulation*. If you want smooth rendering at
144 Hz, interpolate in the renderer using the accumulator alpha the loop passes
to `render(alpha)`; the state stays at 60 Hz.

## Phases are the state machine

`Phase = 'menu' | 'playing' | 'paused' | 'gameover'` lives in `GameState`, and
`update` early-returns for anything but `playing`. Consequences:

- Pause is free and cannot drift (no timers to cancel).
- `end()`, `pause()`, `resume()` are explicit transitions that also push events.
- The UI is a pure projection: `ui.sync(snapshot)` shows/hides screens from
  `snapshot.phase`. The UI never owns game state.

When you add a phase (e.g. `shop`), add it to the union, handle it in `update`,
add a branch in `ui.sync`, and add a lifecycle unit test. TypeScript will point at
every exhaustive switch you forgot.

## State, snapshots, hashes

`GameState` is mutable internally but exposed as `Readonly<GameState>`. The
public read surface is `snapshot()`: a JSON-safe copy without methods or
particles. `snapshot().hash` is FNV-1a over gameplay-relevant fields.

- Tests assert hashes, not pixels, for logic.
- The bridge serialises snapshots, so a bug report can include one.
- Save files and replays may store `{ seed, tick, inputs }` and rebuild state.

Never put rendering-only data (particles, shake, popups) in `GameState`; it would
break hash equality without changing gameplay.

## Seeded randomness

`nextRandom(state)` returns `{ value, state }`. The generator state lives in
`GameState.rngState`, which means:

- the run is reproducible from `{ seed, tick }`
- saving mid-run can restore the generator
- two bots with the same seed produce identical runs, so balance diffs are real

Pattern for a new random choice:

```ts
const roll = nextFloat(state.rngState, 0, 1);
state.rngState = roll.state;
if (roll.value < 0.2) spawnBoss(state);
```

Do not re-seed per frame or derive seeds from `tick * constant`; you will get
correlated patterns that look like bugs.

## Config is data, validated at boot

All balance numbers live in `src/game/config.ts` (`GameConfig`). `createGame`
calls `validateConfig` and throws a readable list of problems. This makes a
balance change a data change, diffable in review, and testable without starting
the game.

Add a field to `GameConfig`, validate it, add it to `defaultConfig`, and add one
assertion in `tests/unit/config.test.ts`. Do not read `import.meta.env` in the
core.

## Input is an abstraction, not a key map

`Intent = { left, right, up, down }` is what the simulation knows. `src/input.ts`
maps keyboard, gamepad and pointer into it; the test bridge sets the same flags
via `setInput`. That is why a keyboard test and a bot test exercise the same code
path.

If you add an action (dash, fire), add it to `Intent`, map it in `input.ts`, wire
the bridge, and update the bot policy if bots should use it.

## Saves are a versioned contract

`src/persist/save.ts` defines `SaveData` with an explicit `version`, a `migrate()`
that accepts every historical shape, and a `SaveStore` that receives a
`SaveStorage` implementation. `main.ts` passes `localStorage`; tests pass a fake.

Rules:

- Bump `version` on any shape change and add a migration + unit test.
- Never throw on corrupt/absent data — degrade to `defaultSave()`.
- Persist at meaningful boundaries (run start, game over), not every frame.

## The bridge is test-only infrastructure

`src/bridge.ts` installs `window.__WG__` when `__WG_E2E__` is defined by the
`e2e` build mode (or `?bridge=1`). It drives the *same* `tick` as the real loop,
so tests cannot pass through a parallel code path.

Production builds strip it (`__WG_E2E__` is `false`); the build is 20 KB of JS,
so there is nothing to gain from shipping test hooks.

`autoplay()` is a small, shared policy (`src/game/autopilot.ts`) used by demos,
screenshots and the headless playtest. Keep it deterministic and dependency-free.

## Error handling

- `main.ts` records `window.onerror` and `unhandledrejection` into the bridge's
  `errors()`; the e2e fixture fails a test on any console error.
- Rendering adapters may fail soft (missing `AudioContext`), but the game core
  must never swallow an invalid state transition silently — throw with context.
- A WebGL context loss needs an explicit listener that recreates resources; do not
  pretend it cannot happen.

## Module boundaries

| Layer | May import | Must not touch |
| --- | --- | --- |
| `src/game/**` | game modules, rng, types | DOM, clock, storage, render |
| `src/render/**` | game types, rng | game state mutation |
| `src/persist/**` | types | game rules |
| `src/ui/**` | snapshot types | game state mutation |
| `src/main.ts` | everything | game rules |

The boundaries are enforced by `wg lint` (`tools/lib/rules.mjs`) and by the Vite
`wg:game-bridge` transform. If you fight the rule, the design is wrong, not the
linter.

## Scaling the codebase

- Split systems by *effect* (`spawn`, `movement`, `collision`, `scoring`) and
  call them from `update` in a fixed order.
- Keep one `update` pipeline; avoid systems subscribing to events to mutate state
  (order becomes implicit).
- If entity count grows past a few thousand, move to typed arrays/struct-of-arrays
  and a spatial grid; keep the snapshot boundary and tests unchanged.

## What to copy into a new project

Copy `src/game`, `src/render`, `src/persist`, `src/ui`, `src/input.ts`, `src/loop.ts`,
`src/bridge.ts`, `src/main.ts`, `tools/`, `tests/`, `.wg.json`, and the CI file.
Replace `Aurora Drift` naming and the config; keep the contracts.
