# Agent contract — webgame

You are working in a deterministic webgame. Follow this contract on every task.

## Non-negotiables

1. `src/game/**` stays pure: no `window`, `document`, `localStorage`, `Date.now`,
   `performance.now`, `Math.random`. Use `nextRandom` from `src/game/rng.ts` and
   the injected `dtMs`.
2. Never weaken a test to make it pass. If a visual baseline changed on purpose,
   run `npm run visual:update` and say so in the summary.
3. `npm run verify` must exit `0` before you report completion. Quote the run id
   and the key numbers from `artifacts/<run>/summary.md` (score, fps, budget).
4. Do not add dependencies for something the platform already does. Ask before
   adding a game engine or a UI framework.

## The loop that works

```bash
node tools/wg.mjs doctor          # is the environment usable?
node tools/wg.mjs verify --fast   # fast signal while iterating
node tools/wg.mjs verify          # final evidence, includes bots + perf
```

## Servers belong to threads, not to the checkout

- Need a dev server? Start your own: `node tools/wg.mjs dev --detach --thread`.
  It takes a free port above the main one and writes `.wg/threads/<id>.json`.
- **Never** stop, restart or reuse a server you did not start. The main server
  (`.wg/dev.json`, port 5173) is shared; restart it once, at the end, with
  `node tools/wg.mjs dev:restart`.
- `verify` never needs a dev server. It allocates its own free ports, its own
  build dir (`dist-e2e-<thread>/`) and its own `artifacts/<run>/playwright/`.

Bugs reproduce with `?seed=N`; use `node tools/wg.mjs shot --seed N --steps 180`
to attach a screenshot to a bug report.

## Where to change what

| Change | Location |
| --- | --- |
| balance / difficulty | `src/game/config.ts` (+ `tests/unit/game.test.ts`) |
| new mechanic | `src/game/` system + unit test, then bridge exposure only if tests need it |
| visuals | `src/render/renderer.ts`, then `npm run visual:update` |
| menus / HUD | `src/ui/ui.ts` + `index.html`; run the a11y test |
| save format | `src/persist/save.ts` with a migration + unit test |
| automation | `tools/wg.mjs`, `tools/lib/`, `tools/e2e/` |

## Testing rules

- Prefer `window.__WG__.step(n)` over `page.waitForTimeout` for game logic.
- Use `?live=1` only when the test is about the real animation loop or FPS.
- Every e2e test fails on console errors automatically (see `tools/e2e/fixtures.ts`).
- Keep unit tests on the pure core; if a test needs a browser, it belongs in `tools/e2e/`.
- Never hard-code a port or `localhost:5173` in a spec: take the URL from
  `WG_E2E_PORT` (the Playwright config already does) so a spec cannot test
  another thread's server.

## Definition of done

- [ ] `node tools/wg.mjs verify` exits 0
- [ ] new behaviour has a test that would fail without it
- [ ] `summary.md` exists with a PASS and the numbers changed are explained
- [ ] no new `any`, no new console output in `src/`
- [ ] no dev server restarted mid-run; at most one `dev:restart` at the end
