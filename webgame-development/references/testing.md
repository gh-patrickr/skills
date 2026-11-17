# Testing

The pipeline is designed so that "it works" is a claim backed by artifacts, not an
impression. Four layers, each answering a different question:

| Layer | Speed | Answers |
| --- | --- | --- |
| unit (`tests/unit`, Vitest) | ms | do the rules hold? is the run deterministic? |
| e2e (`tools/e2e`, Playwright) | seconds | can a player actually do it in a real browser? |
| visual + a11y | seconds | does it look right and work for everyone? |
| bots + perf (`wg playtest`, `wg perf`) | seconds | is it playable, stable and fast at scale? |

`node tools/wg.mjs verify` runs all four and writes `artifacts/<run>/summary.md`.

## Unit tests: the pure core

`vitest.config.ts` includes only `tests/unit/**`, environment `node`, coverage over
`src/game/**` and `src/persist/save.ts`. Thresholds: 85 % statements/lines/functions,
80 % branches. The shipped suite covers RNG, config validation, the state machine,
collisions, scoring, level ramp, save migrations and the autopilot.

Write tests against the public surface:

```ts
const game = createGame({ seed: 2, config: collectibleConfig() });
game.start();
for (let tick = 0; tick < 600; tick++) game.update(IDLE, DT);
expect(game.snapshot().score).toBeGreaterThan(0);
```

- Use a **custom `GameConfig`** to force a scenario instead of hoping a seed hits it
  (e.g. `starChance: 1`, big radii, short level cadence).
- Assert the **hash** for determinism, not individual floats.
- Assert **events** (`drainEvents()`) for "something happened" checks; they carry
  coordinates and values.
- If a branch is hard to reach, make the input a parameter rather than adding
  unnecessary production code.

Coverage is a floor, not a goal. A 95 % suite that only exercises happy paths is
worse than 85 % that includes the collision and migration edges.

## E2E: the seeded bridge

`tools/e2e/fixtures.ts` extends Playwright's `test` with an auto fixture that
collects `console.error` and `pageerror`; **any uncaught error fails the test**,
even if assertions pass.

Boot with a seed and drive the simulation:

```ts
await page.goto('/?seed=7');
await page.waitForFunction(() => window.__WG__?.ready === true);
await page.getByRole('button', { name: 'Start run' }).click();
const state = await page.evaluate(() => window.__WG__!.step(180));
```

Rules:

- **Never `waitForTimeout` to advance the game.** Use `step(frames)`. A fixed
  `waitForTimeout` is the #1 source of CI flakes.
- Use real input for input tests (`keyboard.down`, `click`) and the bridge only to
  advance time.
- Use `?live=1` exclusively for loop/FPS tests.
- Assert user-visible state (`getByTestId`) *and* model state (`snapshot()`) — HUD
  drift is a real bug class.
- Locators: roles and accessible names (`getByRole('button', { name: 'Start run' })`).
  Add `data-testid` only for values, not for interactive elements.
- `getByRole` with a substring matches multiple controls (`Resume` vs `Resume game`);
  use `{ exact: true }`.

Add a file `tools/e2e/<area>.spec.ts`; the config picks it up automatically.

## Visual regression

`tools/e2e/visual.spec.ts` screenshots the menu and a seeded gameplay field
(steps = 180, seed = 7). Baselines live in
`tools/e2e/visual.spec.ts-snapshots/` and include the platform suffix
(`-darwin`, `-linux`, …) because fonts and canvas antialiasing differ per OS.

```bash
node tools/wg.mjs verify --update=missing   # first run: create missing baselines
node tools/wg.mjs verify --update=all       # intentional visual change
```

Policy:

- Snapshot the **canvas** for gameplay (no HUD, no fonts if avoidable) and the
  **page** for menu/layout.
- Always seed and step a fixed number of frames; never screenshot a live loop.
- Keep `maxDiffPixelRatio` small (0.012 default). Raising it to hide a real diff is
  the visual equivalent of deleting a test.
- Review the actual PNG in `artifacts/playwright/...` before regenerating.
- Commit baselines per platform you support. CI on Linux has no `-darwin` file, so
  it generates its own; set `--update=missing` in CI until a Linux baseline is
  committed (the workflow does), then review the artifact and commit it.

## Accessibility

`a11y.spec.ts` runs axe-core on the menu and the in-game HUD, checks keyboard-only
start, and verifies reduced motion.

- Menus and HUD are **DOM**, not canvas text — that is what makes them readable by
  assistive tech.
- Keep one `<h1>` (visually hidden is fine), real `<button>`s, `aria-pressed` for
  toggles, `aria-live` for announcements.
- Focus order should follow the visual order. The HUD sits after the screens in the
  DOM so the first Tab reaches the primary action.
- Honour `prefers-reduced-motion`: disable shake and halve particles.
- Never encode critical info in colour alone; pair it with shape or text.

## Bots and balance

`wg playtest` compiles the pure core with Vite SSR and runs 4 bots for 60 simulated
seconds. It fails on: no stars collected, zero average score, NaN state, a tick
slower than 5 ms, instant death on every seed, or a replay hash mismatch.

- Change `playtest.seconds/bots/seed` in `.wg.json` for longer soaks.
- Bots are a smoke test for *playability*, not a difficulty model. Add targeted
  unit assertions for balance curves.
- Run it against a branch before/after a tuning change; the score deltas in
  `playtest.json` are the diff.

## Performance

`wg perf` measures the live loop in Chrome, not the test bridge. See
`references/performance.md` for what the numbers mean and how to fix a failure.

## Flake policy

A flaky test is a bug. Fix the synchronisation, not the retry count:

1. Replace wall-clock waits with `expect.poll` on bridge state.
2. Seed all randomness; freeze the scene for screenshots.
3. Assert on stable values (tick, phase, score), not raw pixels of moving objects.
4. Only then consider a retry — and only in CI, never to mask a local failure.

## Parallel threads and shared servers

Two agent threads on one checkout must never share a server. The rules:

- A test run owns its servers. `wg verify` allocates free preview/perf/shot ports,
  sets `WG_REUSE_SERVER=0`, and writes its own `dist-e2e-<thread>/`,
  `dist-<thread>/` and `artifacts/<run>/playwright/`. It never attaches to, or
  restarts, a dev server.
- A thread that wants a long-lived server starts its own:
  `WG_THREAD=my-thread node tools/wg.mjs dev --detach --thread`. State lives in
  `.wg/threads/<id>.json`, never in `.wg/dev.json`.
- The main server (`.wg/dev.json`, port 5173) belongs to the human. Stop or restart
  it only when the work is finished, with `dev:stop` / `dev:restart`.
- E2E tests must take their base URL from `WG_E2E_PORT` (the Playwright config
  already does). Hard-coding `localhost:5173` in a spec is a bug: it silently tests
  another thread's server.
- One shared resource remains: the visual baselines. `wg visual:update` locks them;
  run it in a single thread and record it in the summary.

## CI

`.github/workflows/webgame.yml` runs `npm ci`, installs Chromium, runs
`node tools/wg.mjs verify`, and uploads `artifacts/` on success or failure.
Set `WG_CHANNEL=chromium` in CI; locally the config uses installed Chrome
(`channel: 'chrome'`) so no browser download is needed.

A red CI job must be reproducible locally with the same command. If it is not,
the difference is usually the browser channel, the OS (visual baselines) or a
missing environment variable — fix that difference explicitly.
