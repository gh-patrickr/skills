# Troubleshooting

Every entry is a real failure mode of this pipeline, with the command that fixes it.
Run `node tools/wg.mjs doctor --json` first; it covers half of them.

## Environment and servers

| Symptom | Cause | Fix |
| --- | --- | --- |
| `EACCES: permission denied 127.0.0.1:<port>` | a sandbox/port restriction, or a flag parsed as port `1` | use `--port=4173` (inline value) and a port > 1024 |
| `EADDRINUSE` / preview exits immediately | another preview or dev server owns the port | `node tools/wg.mjs dev:status --all`; stop only your own: `dev:stop --thread`; `lsof -nP -iTCP:4173 -sTCP:LISTEN` |
| `dev port: 5173 in use` fails the run | older tooling treated a busy port as fatal | update the tooling (`tools/wg.mjs`); `doctor` now reports it as info and `verify` allocates a free port — **never** stop the other thread's server |
| e2e fails against the wrong code, or the server "dies" mid-test | tests attached to a dev server another thread just restarted | run `node tools/wg.mjs verify`, not `npm run test:e2e` against a hand-started preview; verify sets `WG_REUSE_SERVER=0` and its own port |
| two runs overwrite each other's Playwright report | shared `artifacts/playwright` | verify writes `artifacts/<run>/playwright/`; for manual runs set `WG_ARTIFACTS_DIR=artifacts/playwright-<thread>` |
| `visual:update` hangs or a baseline looks half-written | another thread holds the baseline lock | wait for `visual-baselines` lock to clear; `node tools/wg.mjs dev:status --all` shows the busy servers |
| `Executable doesn't exist …/ms-playwright/…/chrome` | `channel: 'chrome'` but Chrome is not installed | install Chrome, or `WG_CHANNEL=chromium npx playwright install chromium` |
| `Executable doesn't exist …/ffmpeg-…` | video recording enabled without ffmpeg | set `WG_VIDEO=1` only after `npx playwright install ffmpeg` (off by default) |
| `npm` fails writing `~/.npm/_logs` | sandboxed home directory | `export npm_config_cache=/tmp/npm-cache` |
| `vite config uses features unsupported by configLoader: 'native'` | extensionless imports in `vite.config.ts` | import plugins with `.ts` extensions |
| `Preview` serves an old build | `dist/` or `dist-e2e/` is stale | `rm -rf dist dist-e2e && node tools/wg.mjs verify` |

## Build and types

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Deterministic core violation …` | `src/game` uses a clock, `Math.random` or DOM | move the effect to an adapter; see `references/architecture.md` |
| `core must not import adapters` | `src/game` imports render/ui/persist/input | invert the dependency: pass data in |
| `TS6133: declared but never read` | unused import after a refactor | remove it; TS strict is intentional |
| `TS18048: possibly undefined` | `noUncheckedIndexedAccess` | guard the index or use a `for…of` loop |
| `invalid game config: …` at boot | a balance number is out of range | fix `src/game/config.ts`; validation lists every issue |
| `SSR build produced no entry` | Vite output changed, `.wg/sim` empty | check the `wg playtest` log; run the SSR build manually |

## Tests

| Symptom | Cause | Fix |
| --- | --- | --- |
| `A snapshot doesn't exist … writing actual` | first run, no baseline | `node tools/wg.mjs verify --update=missing` |
| visual diff on every run | moving scene, unseeded randomness, or another OS | seed + `step()`, screenshot canvas only, platform baselines |
| `strict mode violation: … resolved to 2 elements` | substring role match (`Resume` vs `Resume game`) | `{ exact: true }` or a `data-testid` |
| `page-has-heading-one` | all headings hidden with a screen | keep a visually hidden `<h1>`; don't hide the only heading |
| coverage below threshold | new core branch untested | add a targeted unit test (often a custom `GameConfig`), do not lower the floor |
| test passes locally, fails in CI | browser channel, fonts (visual), missing env | align `WG_CHANNEL`, commit CI-platform baselines, check env |
| e2e times out after `waitForTimeout` | waiting on wall-clock instead of state | `expect.poll` on `__WG__.snapshot()` |
| `__WG__` is undefined | production build (no bridge) or wrong URL | tests must run against the `e2e` build served by `wg preview` |

## Runtime symptoms

| Symptom | Cause | Fix |
| --- | --- | --- |
| Canvas blank in a test | manual mode: nothing runs until `step()`/`start()` | call `__WG__.start()` then `step()`; check `errors()` |
| Canvas blank in the real page | renderer threw before first draw | open DevTools; the e2e fixture would have failed on the console error |
| Ship drifts while idle | friction not applied or non-zero initial velocity | `player.friction` and `vx/vy` reset in `start()` |
| Score/lives HUD stale | UI synced only on events | call `ui.sync(snapshot)` every tick, compare before writing |
| Save lost after reload | quota/private mode, or persisted only on tick that never ran | persist on `game-over` **and** on state change; store falls back to memory |
| No audio | context not unlocked, or muted in save | click first; `M`; check `SaveData.muted` |
| FPS ~30 | tab hidden/occluded, or software rendering | measure headed, foreground; check `longFrameRatio` |
| FPS dips at start | first paint / shader compile | the perf script drops the first 10 frames; compare medians |
| Game speeds up after tab switch | unclamped delta | the loop clamps to 250 ms; never call `update` with raw rAF delta |

## Automation and install

| Symptom | Cause | Fix |
| --- | --- | --- |
| pre-commit does nothing | hook not installed / not executable | `node tools/wg.mjs hooks:install` |
| `wg verify` skipped a step | `--fast`, or a failure without `--keep-going` | check `summary.md`; use `--keep-going` to see all failures |
| `doctor` exit 2 | Node/deps/browser/port missing | each line prints its fix command |
| skill not listed in another workspace | installed in the project, not the user root | `scripts/install-shared.sh` (writes `~/.dsh/skills`) |
| skill edited but not picked up | watcher delay or wrong root | confirm `~/.dsh/skills/webgame-development/SKILL.md`; restart the session if needed |

## Diagnostics that are worth memorising

```bash
node tools/wg.mjs doctor --json                 # environment as JSON
node tools/wg.mjs dev --detach --thread && node tools/wg.mjs dev:status --all
node tools/wg.mjs verify --fast                  # own ports, no shared server touched
node tools/wg.mjs shot --seed 42 --steps 180    # visual evidence
cat artifacts/last-run.json                     # newest summary path
cat artifacts/<run>/09-perf-budget.log           # raw step output
npx playwright show-trace artifacts/playwright/test-results/<test>/trace.zip
```

When reporting a failure, include: the run id, the failing step, the tail of its
log, the seed, and (for visual issues) the actual PNG path. That is usually enough
to fix it without reproducing.
