# Aurora Drift — webgame starter

A deterministic Canvas 2D game with the automation already wired: one command
proves the game builds, plays, looks right and performs.

```bash
npm install
npm run dev        # main server on 0.0.0.0:5173 (reachable on the LAN)
npm run verify     # full evidence run → artifacts/<run>/summary.md

# loopback only (every server binds 0.0.0.0 unless --local or --localhost is given)
node tools/wg.mjs dev --local
node tools/wg.mjs dev --localhost

# parallel agents: one server per thread, own free port, own state
node tools/wg.mjs dev --detach --thread
node tools/wg.mjs dev:status --all
node tools/wg.mjs dev:stop --thread
```

## What "done" means

`npm run verify` must exit `0`. It runs:

| Step | Proves |
| --- | --- |
| doctor | toolchain, browser; busy ports are reported, never fatal |
| lint | strict TypeScript + core determinism/layering rules |
| unit | gameplay, RNG, config and save logic (coverage-gated) |
| build | production + e2e bundles compile |
| budget | gzipped JS/CSS stay under `.wg.json` budgets |
| e2e | real Chrome: menu, keyboard, pause, save, a11y, visual snapshots |
| playtest | bots play thousands of frames headlessly; no NaN, no stall |
| perf | 240 real frames; FPS floor and long-frame ratio |

Tests never touch the main dev server: `verify` picks free preview/perf/shot
ports and its own build directory, so several threads can run at once. Restart
the main server once, with `npm run dev` + `node tools/wg.mjs dev:restart`, when
the work is done.

Artifacts land in `artifacts/`, including screenshots, traces on failure,
`playtest.json`, `perf.json` and a Markdown summary.

## Layout

```
src/game/        pure deterministic core (no DOM, no clock, seeded RNG)
src/render/      Canvas 2D adapter (particles, shake, palette)
src/persist/     versioned save + migrations
src/ui/          DOM HUD and screens (accessible, keyboard-first)
src/input.ts     keyboard/gamepad/pointer → abstract Intent
src/bridge.ts    window.__WG__ deterministic test bridge + demo bot
src/loop.ts      fixed-timestep loop (only place that reads the clock)
tools/           wg CLI, Playwright tests, bots, perf, assets, Vite plugins
```

### The one rule

Gameplay changes go in `src/game/**`. That folder may not read the clock, use
`Math.random`, or touch the DOM — the Vite plugin and the lint step both fail
the build if it does. Everything time- or platform-shaped belongs in
`src/loop.ts`, `src/render/`, `src/input.ts` or `src/persist/`.

This is what makes the game testable: `update(intent, dt)` is a pure function
of state, and a seed reproduces an entire run.

## Adding content

1. Tune `src/game/config.ts` (validated at boot; bad values fail loudly).
2. Add a system in `src/game/` and a unit test in `tests/unit/`.
3. If it changes the look, refresh snapshots: `npm run visual:update`.
4. Run `npm run verify`. Read `artifacts/<run>/summary.md`.

## Testing without waiting

The e2e build (`vite build --mode e2e`) exposes `window.__WG__`:

```ts
__WG__.step(600);            // 10 simulated seconds, no wall clock
__WG__.snapshot();           // { phase, tick, score, player, orbs, hash }
__WG__.setInput({ right: true });
__WG__.autoplay(900);        // deterministic demo bot
__WG__.errors();
```

Live-loop behaviour is covered separately with `?live=1`.

## Deploy

`npm run build` emits a static `dist/` — deploy to any static host (Netlify,
Cloudflare Pages, S3, GitHub Pages). Set long cache headers for
`/assets/*` (hashed); `index.html` must stay uncached.
