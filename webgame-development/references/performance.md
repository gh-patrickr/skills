# Performance

Performance is a budget in `.wg.json`, enforced by the pipeline:

```json
"budgets": { "jsGzipKb": 250, "cssGzipKb": 40, "totalGzipKb": 350,
             "fpsMin": 50, "longFrameRatioMax": 0.05 }
```

- **Bundle** — `wg verify` gzips every emitted file (level 9) and fails above the
  budgets. The starter ships ~8 KB JS + 1.4 KB CSS gzipped.
- **FPS** — `wg perf` samples 240 real `requestAnimationFrame` deltas in Chrome.
  Sustained FPS is `1000 / median` (a single GC pause must not fail a smooth run);
  `longFrameRatio` counts frames > 25 ms and `stalls` counts > 50 ms. Both appear
  in `perf.json`.

Do not "fix" a perf failure by lowering the floor. Find the frame that is slow.

## Frame budget

At 60 fps the whole frame (input + update + render + browser compositing) has
16.7 ms. A practical split for a 2D game:

| Work | Budget |
| --- | --- |
| simulation update | ≤ 2 ms |
| draw calls / canvas ops | ≤ 6 ms |
| layout/style (DOM HUD) | ≤ 1 ms |
| headroom (GC, browser) | the rest |

Measure before optimising: `wg perf` gives the aggregate; Chrome DevTools
Performance panel gives the hot function. Add `performance.mark`/`measure` around a
suspect system, then remove it.

## Common 2D costs, in order of impact

1. **Per-frame allocation.** `snapshot()` maps orbs; `filter/map/sort` per frame;
   `new Vec2()` in a loop. Allocate once, mutate in place, or pool. The starter's
   renderer reuses arrays and caps particles at 420.
2. **`shadowBlur` / filters per sprite.** Very expensive on Canvas 2D. The starter
   uses it on a handful of entities; do not add it to hundreds.
3. **Gradients created per frame.** `createLinearGradient` per draw is wasteful.
   Cache them, or make them once per resize.
4. **Full-canvas `clearRect` + repaint of static layers.** Pre-render static
   background to an offscreen canvas and `drawImage` it.
5. **DPR without a cap.** `devicePixelRatio` 3 triples pixels. Cap at 2 (the
   starter does) or scale the backing store with a quality setting.
6. **Text in the game loop.** Canvas `fillText` with layout each frame is slow;
   keep HUD text in DOM (cheap to change only when values change).

## Canvas vs WebGL

- Canvas 2D is fine to a few hundred sprites, lots of text, and UI-heavy games.
  It is simpler to test, snapshot and debug.
- Move to WebGL/PixiJS when draw calls dominate: thousands of sprites, shaders,
  heavy blending, particle systems. Read `references/engines.md`.
- WebGPU is viable on modern browsers but raises the test matrix; only take it if
  the visual design requires it.

## The simulation

- The update cost is per fixed step, not per rendered frame. On a 144 Hz display
  you still simulate 60 steps/s; do not tie logic to rAF count.
- Avoid `Array.prototype.splice` in the hot loop for large arrays (O(n)); swap-
  remove or filter once per step. The starter splices a handful of orbs per frame,
  which is fine at that scale.
- Collision: brute force is fine below ~200 entities; above that use a uniform
  grid or spatial hash. Keep the grid out of `GameState` (rebuild per step) so
  snapshots stay simple.
- **Pure-functional (`stepTick(prev) -> next`) V8 hot loops**: when snapshots are
  deeply immutable for replays/time-travel and hashed per tick:
  1. **Monomorphic object literals over `{ ...entity }` spreads** — `{ ...e, x }` in a
     per-tick loop hits V8 `CloneObjectIC`, and omitting optional fields on spawn then
     adding them later (`slowTicks`, `lastGateId`) transitions V8 Hidden Classes (Maps).
     Write explicit literals with all keys in identical order (`optionalField: undefined`).
  2. **Module-level `Int32Array` scratch buffers inside synchronous `stepTick`** —
     unpack active target `x`, `y`/`z`, `radius`, `hp` into reusable typed arrays
     (grown only if `count > capacity`), apply projectile/AoE hits in those flat arrays
     without mutating `prev`, and materialize survivor objects once at the end of the tick.
  3. **1D axis range pre-check** — compute `[minTargetZ, maxTargetZ]` (including radius,
     updated on knockback) once per tick so projectiles outside the active target band
     skip the inner loop in `O(1)`.
- Cap catch-up steps (the loop does) so a slow device degrades to slow motion
  instead of a freeze.

## Memory and GC

- Watch `heapMb` in `perf.json` across a 10-minute run; a monotonic rise is a leak.
- Common leaks: event listeners added per run, `AudioContext` per sound, detached
  canvases, growing `events` arrays (the starter caps at 200 in core and 1 000 in
  the bridge).
- Particles and popups are the usual allocation hotspot — pool them.

## Audio

- `AudioContext` is created once and unlocked on the first user gesture. Creating
  one per sound leaks and hits browser limits (~6 per page on some engines).
- Use `gain` envelopes, not many simultaneous oscillators; stop nodes after they
  end.

## Mobile and low-end

- Test at 4× CPU throttling in DevTools; that is closer to a mid-range phone than
  your laptop.
- Respect `prefers-reduced-motion` and pause the loop when `document.hidden`.
- Keep the first screen interactive under 2 s on a throttled 4G profile: defer
  non-critical assets, avoid a blocking font, keep JS small.
- Touch: pointer events, ≥44 px targets, no hover-only affordances.

## Bundle strategy

- Measure gzip, not raw: `perf.json`/`bundle` step reports both.
- Code-split optional modes (editor, replay viewer) with dynamic `import()`.
- Avoid a UI framework for a canvas game unless it already exists; the DOM HUD in
  the starter is ~3 KB and avoids a reconciler in the frame loop.
- Tree-shake engines: `import { Sprite } from 'pixi.js'` not `import * as PIXI`.

## Failure playbook

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| FPS 30 exactly | browser throttling a hidden/occluded tab, or vsync at half rate | run headed or foreground; check `visibilitychange` |
| Long frames at start only | first paint/shader compile | warm up (perf drops the first 10 frames) |
| Sawtooth heap | per-frame allocations | pool, reuse, profile |
| Bundle over budget | accidental dependency | `npx vite-bundle-visualizer`, remove, split |
| Update > 2 ms | O(n²) collision or splice storm | grid, swap-remove |
| Pure `stepTick` fast locally, slow on CI | `{ ...entity }` spreads, polymorphic hidden classes, or parallel Vitest subprocess starvation on 2-vCPU x64 | monomorphic literals + `Int32Array` scratch buffers + axis bounds pre-check; `fileParallelism: false` |
| Perf fine locally, bad in CI | software rendering in headless CI | compare medians, keep floors realistic |
