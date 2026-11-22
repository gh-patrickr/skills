---
name: webgame-development
description: Use when creating, changing, testing, shipping or debugging a browser game in any workspace — "make a web game", "add a level / boss / power-up", "the canvas is blank", "tests are flaky", "hit 60 fps", "assets are too big", "set up CI". Ships a deterministic TypeScript + Vite + Canvas 2D starter, a one-command evidence pipeline (typecheck → unit + coverage → build → Playwright UI / visual / a11y → headless bots → FPS budget), a seeded test bridge, and an error→fix playbook. Works for greenfield games and for adding the automation layer to an existing one.
---

# Webgame development

**Applies to:** browser games — Canvas 2D, WebGL/WebGPU, or an engine (Phaser, PixiJS,
Three.js, Babylon). If the workspace is not a web game, do not load this skill.

## The contract

A change is done only when all of these are true:

1. `node tools/wg.mjs verify` exits `0` on this checkout.
2. `artifacts/<run>/summary.md` exists, is **PASS**, and you quote its run id plus the
   numbers that matter (test counts, coverage, bundle KB, FPS).
3. No test was weakened, skipped or made time-dependent to get there. If a visual
   baseline changed on purpose, you ran `node tools/wg.mjs verify --update=all` and said so.

A green build is **not** evidence. A screenshot someone eyeballed is **not** evidence.
Only the verification run is.

Never: open a browser and click manually to "check it works", ask the human to test,
add `waitForTimeout` to fix a flaky test, or put gameplay logic in a React/Vue component.

Servers are per thread, never shared: give each thread its own dev server on its own
free port, run its tests against its own preview server, and restart the **main**
server at most once — when the work is finished (§2.1).

## 0. Decide the shape (30 seconds, no questions)

| Situation | Do this |
| --- | --- |
| No project yet | `scripts/scaffold.sh --name "My Game" --dest .` then §1 |
| Has `package.json` + `src/`, no automation | Run `scripts/scaffold.sh --into . --adopt` to add `tools/`, `tests/`, `.wg.json`, CI — keep existing `src/` |
| Has automation (`tools/wg.mjs`) | §1 directly; read `AGENTS.md` in the project root |
| Fixing one bug in gameplay | Keep the layout; reproduce with `?seed=N`, add a unit test, run `verify --fast` |
| 3D or heavy 2D (thousands of sprites) | Read `references/engines.md` before writing the renderer |

Default every product question the human did not answer and record it in
`docs/assumptions.md`: 2D Canvas, TypeScript strict, Vite, 960×600 logical world,
keyboard + pointer, 60 Hz fixed timestep, localStorage saves, English UI.
**Do not block on questions you can default.**

## 1. Scaffold, then verify immediately

```bash
scripts/scaffold.sh --name "My Game" --dest my-game
cd my-game && npm install
node tools/wg.mjs verify
```

The first run creates `artifacts/<run>/` with `summary.md`, per-step logs,
`playtest.json`, `perf.json`, Playwright traces on failure and screenshots.
Read `summary.md` before changing code: it tells you the environment is real.

`node tools/wg.mjs doctor` is the fast preflight. Exit `2` means something in the
environment is missing; the output ends with the exact command that fixes it.

## 2. The loop that stays fast

```bash
npx vitest run tests/unit/game.test.ts                                    # single unit spec (~1 s)
npx playwright test -c tools/playwright.config.ts tools/e2e/assets.spec.ts # single e2e spec  (~5 s)
node tools/wg.mjs verify --fast                                           # types + lint + unit + e2e smoke (~20 s)
node tools/wg.mjs verify                                                  # final full evidence gate (once at end)
```

Prefer targeted single-file runs while iterating, `verify --fast` at milestones, and
full `verify` **once** at the end of every prompt. **Never use full `wg verify` as an
inner edit-debug loop:** on software-WebGL 2-vCPU runners (`SwiftShader` / `llvmpipe`),
running 40+ WebGL Playwright specs takes several minutes per run, whereas running the
affected spec directly takes seconds. Each `verify` run gets its own `artifacts/<run>/`.

### 2.1 One server per thread — never restart a shared one

Parallel agent threads on one checkout used to fight over port 5173/4173 and over
`.wg/dev.json`: one thread restarted the server another thread's browser was using,
and the test suite failed with a "dying" server instead of a real bug. The tooling
now makes that impossible — **keep it that way**:

```bash
export WG_THREAD=my-thread                     # names this thread's build dirs
node tools/wg.mjs dev --detach --thread        # own server, own free port, own state
node tools/wg.mjs verify --fast                # own ports, own preview, own build dir
node tools/wg.mjs dev:status --all             # every known server + alive flag
node tools/wg.mjs dev:stop --thread            # stop only this thread's server
```

Rules:

1. **Never** `dev:stop` / `dev:restart` / kill a server you did not start. Another
   thread's Playwright run is attached to it.
2. `verify` never reads, reuses or restarts a dev server. It allocates free ports
   (preview, perf, shot), writes `dist-e2e-<thread>/`, `dist-<thread>/` and
   `artifacts/<run>/playwright/`, and sets `WG_REUSE_SERVER=0` so it always boots
   its own preview. A busy 5173/4173 is informational in `doctor`, not a failure.
3. `dev --detach --thread` starts at `devPort + 1`, so a thread never takes the main
   port; `--port N` stays strict and errors instead of killing the owner.
4. The shared main server is for humans only (`.wg/dev.json`, port 5173). Restart it
   **once**, after the work is done, `verify` is green, and `main` is pushed to
   `origin/main`: `node tools/wg.mjs dev:restart`. Never leave the user on a thread
   port (`5174+`) or an unmerged side branch.
5. Every dev and preview server binds `0.0.0.0` (all interfaces, so phones/tablets on
   the LAN and remote preview proxies can connect) **unless** `--local` or
   `--localhost` explicitly restricts binding to `127.0.0.1`.
6. Visual baselines are the one genuinely shared file set: `visual:update` takes a
   lock. Run it in one thread at a time and say so in the summary.
7. When two threads really must verify at the same time, give each a distinct
   `WG_THREAD`; ports, state files, build dirs and Playwright artifacts then stay
   separate even though the checkout is shared.

## 3. Test gameplay without waiting

The e2e build exposes a deterministic bridge, so UI tests never wait on wall-clock
time:

```ts
await page.goto('/?seed=42');
await page.waitForFunction(() => window.__WG__?.ready === true);
await page.getByRole('button', { name: 'Start run' }).click();

const after = await page.evaluate(() => window.__WG__!.step(600)); // 10 s of game, instantly
expect(after.tick).toBe(600);
expect(after.hash).toBe('…');           // same seed + inputs = same hash
```

Bridge surface (see `src/bridge.ts`): `snapshot()`, `step(frames)`, `start(seed)`,
`restart(seed)`, `pause()`, `resume()`, `endRun()`, `setInput(patch)`, `clearInput()`,
`autoplay(frames)`, `events()`, `errors()`, `fps()`, `setReducedMotion(bool)`.

Use `?live=1` for tests about the real `requestAnimationFrame` loop (FPS, visibility
pause, and verifying that new 3D models/shaders survive adaptive quality scaling in
real-time play). Everything else steps the simulation.

## 4. Keep the core pure

`src/game/**` may not use `window`, `document`, `localStorage`, `Date.now`,
`performance.now` or `Math.random`. Use `nextRandom` and the injected `dtMs`.

Why: the same core runs in Chrome, in Node for the bot playtest, and in replays.
Enforced twice — the `wg:game-bridge` Vite plugin fails the build, and
`wg lint` fails the run. Escape hatch for a genuinely platform-bound file:
a `wg-allow-platform` comment.

Adapters own the edges: `src/loop.ts` (clock/rAF), `src/input.ts`, `src/render/`,
`src/persist/`, `src/ui/`, `src/main.ts`.

### 4.1 Simulation, hitbox & replay pitfalls learned in production

- **1:1 visual-to-hitbox parity for crowds/formations:** When rendering a squad or multi-entity formation inside `±halfWidth` where each visual member has body radius `R`, inset member center positions to `±(halfWidth - R)` so the outermost rendered bodies sit at exact `±halfWidth`. Debug wireframe overlays (`?debug=1`) must call the exact simulation width helper (e.g. `getSquadHalfWidthMilli()`), never a separate visual estimate.
- **Simultaneous multi-gate collision & PEMDAS precedence:** When a wide player AABB overlaps multiple gates/modifiers on the same tick, trigger **all** overlapped gates independently (both positive and negative, without neutralizing sibling gates in the row) and sort simultaneous modifiers by standard math order of operations (**PEMDAS**: `MUL` → `DIV` → `ADD` → `SUB`, so `85 × 2 + 25 = 195`). Ensure bot AI filters positive vs. negative gates and steers away from leftover active negative gates on subsequent ticks.
- **One-click 30-second deterministic bug report (`ReplayRingBuffer`):** Store a periodic `anchorSnapshot` every `300` ticks (5 s) plus RLE-compressed `InputFrame`s covering the last `1,800` ticks (30 s at 60 Hz). Expose a one-click `🐞` button on HUD/Pause/Results and `window.__WG__.exportBugReport()` / `importBugReport(raw)` so any player bug report deterministically replays the exact last 30 seconds.
- **macOS Playwright browser & `ffmpeg` video capture:** Include `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` in `systemBrowserPath`. Before recording Playwright `.mp4`/`.webm` gameplay videos on macOS, symlink `$(command -v ffmpeg)` to `~/Library/Caches/ms-playwright/ffmpeg-1013/ffmpeg-mac` (or `~/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux` on Linux) if Playwright's bundled `ffmpeg` is missing.
- **Frozen-clock interactive feel & visual playtesting:** Fast-forward `step(N)` checks determinism, *not* pacing, shot-budget feel, HUD/toast/warning-banner occlusion, or down-road label overlap. When tuning levels or UI/3D visuals, play in real-time 60 Hz bursts paused via a virtual `performance.now()` hook (`window.__SIM_FROZEN__`) at `deviceScaleFactor: 2` and inspect captured frames multimodally (see `references/testing.md`).
- **3-tier capability-curve calibration & obstacle-gated modules:** Compose stages from reusable encounter modules that tie high-value bonuses behind obstacles or shot-budget trade-offs (destructible blockers, shoot-to-unlock/rush gates vs. opposite-lane waves), and calibrate every stage so `RandomBot` fails, an honest continuous-firing `HumanBaselineBot` clears in a tight `1★` survival band (e.g. `8%–22%` HP), and `OptimalBot` clears at `2★–3★` (see `references/testing.md`).
- **3D `InstancedMesh` color/depth & projected-label traps:** Avoid multiplying saturated `.glb` `vertexColors` by conflicting `instanceColor` tints, disable `depthWrite` + Y-stagger coplanar shockwave rings, and run 2D AABB repulsion on projected DOM world labels (see `references/engines.md`).
- **Live `?live=1` 3D hero-model guarantee, quality hysteresis & deterministic HUD timers:** Manual `window.__WG__.step(n)` skips `requestAnimationFrame` frame-time reporting and software-WebGL defaults, hiding bugs that replace 3D models in real play. Always test new `.glb` models in `?live=1` immediately; keep human player hero models active across all quality tiers (`!lowDetail || playerSlot !== null`); feed adaptive quality controllers only during active gameplay after a post-start shader-warmup window using a multi-frame rolling median (never a single-frame `deltaMs` cliff); and advance HUD toasts/flashes from simulation `dtMs` (`ui.tick(dtMs)`) instead of wall-clock `setTimeout` so visual baselines never flake.
- **Vite preview loopback stability (`keepAliveTimeout` + `identity` encoding + `loadWithRetry`):** Node's 5 s default `keepAliveTimeout` and Vite preview's `@polka/compression` chunked gzip on loopback can abort 1 in ~40 `.glb`/`.webp`/`.js` fetches (`net::ERR_ABORTED`) across sequential Playwright specs. Set `httpServer.keepAliveTimeout = 65_000` and `req.headers['accept-encoding'] = 'identity'` in `configurePreviewServer` (`dev-health.ts`) and wrap `.glb`/texture fetches in a short retry helper (`loadWithRetry`).

## 5. Automations this skill installs

| Command | What it automates |
| --- | --- |
| `wg verify` | doctor → lint → unit+coverage → build e2e → build prod → gzip budget → Playwright (UI, visual, a11y) → bots → FPS |
| `wg verify --fast` | the same minus bots/perf, e2e limited to `[smoke]` |
| `wg dev --detach` | background **main** Vite server on `0.0.0.0` (or `127.0.0.1` with `--local` / `--localhost`); URL + pid + host in `.wg/dev.json` |
| `wg dev --detach --thread` | per-thread server on its own free port (`0.0.0.0` by default); state in `.wg/threads/<id>.json` |
| `wg dev:status [--all]`, `dev:stop --thread`, `dev:restart` | inspect, stop or restart exactly one server; `--all` never touches the main server |
| `wg playtest` | 4 bots × 60 s of pure-core simulation in <1 s; fails on NaN, stall, zero progress |
| `wg perf` | 240 real frames in Chrome; median FPS floor + long-frame ratio |
| `wg assets` | magic bytes, dimensions, 4 MB budget, duplicate hashes, manifest |
| `wg shot --scene gameplay --seed 7` | screenshots as bug-report evidence |
| `wg watch` | debounced lint + unit loop |
| `wg hooks:install` | pre-commit fast gate |
| `.github/workflows/webgame.yml` | CI with cached deps, Chromium, uploaded artifacts |

Everything is Node built-ins plus Vite/Vitest/Playwright. No service, no account.

## 6. When it fails

Read `references/troubleshooting.md` first — it maps the common failures (busy port,
missing Chrome, snapshot diff, coverage threshold, storefront caching) to the exact
command. Then:

```bash
node tools/wg.mjs doctor --json
node tools/wg.mjs shot --seed 42 --steps 180
```

Attach the screenshot path and the failing step log to your fix, not a description
of a screenshot.

## 7. Reference map

| File | Read it for |
| --- | --- |
| `references/architecture.md` | fixed timestep, state machine, config, bridge, save versioning, input, procedural physics/N-body level calibration |
| `references/testing.md` | test pyramid, seeds, bridge rules, visual baselines, a11y, flake policy |
| `references/performance.md` | budgets, canvas/WebGL drawing, GC pressure, profiling, mobile |
| `references/assets-audio.md` | formats, atlases, compression, WebAudio unlock, manifests |
| `references/release.md` | static hosting, caching, PWA/offline, error reporting, launch checklist |
| `references/engines.md` | staying on Canvas vs PixiJS/Phaser/Three/Babylon; migration seams |
| `references/troubleshooting.md` | error → cause → fix table |

## 8. Definition of done

- [ ] `node tools/wg.mjs verify` exits 0, full mode
- [ ] new behaviour has a test that fails without it (unit for rules, e2e for flow)
- [ ] determinism hold: same seed ⇒ same `.hash`; no clock/random/DOM in `src/game`
- [ ] bundle and FPS budgets still pass; no new `any`; no console noise in `src/`
- [ ] `summary.md` quoted in the final message with the run id
- [ ] no dev server was restarted mid-run; at most one `dev:restart` at the end
