# Engines: stay on Canvas or move

The starter is deliberately engine-free: Canvas 2D, ~20 KB of JS, no framework in
the frame loop. That is the right default for arcade games, puzzle games, prototypes
and anything where the DOM can carry the UI. Move only when a concrete limit is hit.

## Decision matrix

| Situation | Choose | Why |
| --- | --- | --- |
| ≤ ~300 sprites, text/UI heavy, 2D | **Canvas 2D** (starter) | smallest bundle, easiest tests, deterministic rendering |
| Thousands of sprites, shaders, particle-heavy 2D | **PixiJS** | WebGL batch renderer, sprite/atlas focus, keep your core |
| Scenes/physics/audio/tilemaps out of the box | **Phaser** | batteries included; accept its scene/loop model |
| 3D or 2.5D with a real camera | **Three.js** | de-facto standard, huge ecosystem |
| 3D with editor, physics, PBR pipeline | **Babylon.js** | fuller engine, larger bundle |
| Custom WebGL/WebGPU | **own renderer** | only with a rendering specialist and a real need |

Bundle sizes are version- and import-dependent; measure in your build, not from a
blog post. Rule of thumb: Pixi/Phaser add hundreds of KB raw; Three adds ~150 KB
(raw) for core; Babylon is larger.

## The seam

Whichever renderer you use, keep this contract:

```ts
// src/render/renderer.ts
export interface Renderer {
  resize(): void;
  update(dtMs: number): void;          // particles, tweens — never game rules
  handle(events: readonly GameEvent[]): void;
  draw(snapshot: Snapshot): void;
  setReducedMotion(value: boolean): void;
  dispose(): void;
}
```

`main.ts` only knows `Renderer`. Swapping Canvas for Pixi is a renderer rewrite, not
a game rewrite. The core, tests, bots and save format are untouched.

## Adopting PixiJS in this starter

1. `npm i pixi.js`
2. Implement `src/render/pixi-renderer.ts` against the interface above.
3. In `main.ts`, choose the renderer by query flag or build mode:
   `const renderer = usePixi ? createPixiRenderer(canvas) : createRenderer(canvas)`.
4. Keep the DPR cap, `prefers-reduced-motion`, and event-driven particles.
5. Re-run visual baselines (`--update=all`) and the perf budget; WebGL compile
   stalls show up as long frames on the first draw.

Pixi manages its own ticker; do **not** let it drive `game.update`. Pass the fixed
`dt` into `renderer.update` only for visual effects.

## Adopting Phaser

Phaser owns scenes, the loop and physics. If you adopt it, either:

- use Phaser as a *renderer + input* layer and keep the pure core authoritative
  (call `game.update` from a Phaser scene's `update`), or
- accept Phaser as the architecture and keep this skill's testing approach:
  seed any `Phaser.Math.RND`, snapshot state out of the scene, and expose a bridge.

Do not let two loops run (`Phaser`'s and `src/loop.ts`). Choose one owner.

## Three.js / 3D specifics

- Assets: glTF/GLB, Draco/meshopt compression; KTX2 for textures. Budget draw calls
  and triangles, not just bytes.
- Prefer instancing for repeated meshes; merge static geometry.
- Lighting: baked lightmaps or a single directional light; real-time shadows are
  expensive on mobile.
- Post-processing doubles fill cost; gate it behind a quality setting and skip it
  under reduced motion.
- Determinism: physics and procedural placement must not read `Math.random`; use
  `src/game` RNG and feed transforms from the snapshot.
- Testing: WebGL screenshots are GPU/driver-dependent; use a higher pixel tolerance
  or assert geometry/state and keep one coarse visual baseline.
- **`vertexColors × instanceColor` channel-zeroing trap:** Three.js multiplies
  `vertexColor * instanceColor` in the shader. Baking saturated cyan (`[0, 0.9, 1]`)
  or violet into a `.glb` that also receives per-instance warm tints (`setColorAt`)
  zeroes out RGB channels into muddy brown/black. Choose one per mesh:
  1. **Dynamically tinted props/drums:** author tintable `.glb` faces in neutral
     high-value alabaster (`[0.92, 0.95, 0.99]`) with dark gunmetal trim so
     `instanceColor` reads at full chroma.
  2. **Bespoke multi-tone units/bosses:** bake full multi-tone vertex palettes into
     each `.glb` and pass `0xffffff` `instanceColor` (`mat.color.setHex(0xffffff);
     mat.vertexColors = true`) except during temporary status tints (e.g. cryo flash).
- **Coplanar transparent shockwave / decal z-fighting:** instanced ground rings at the
  exact same `y` flicker when multiple events fire together. Set `depthWrite: false`,
  cap concurrent active rings, and stagger height (`baseY + slotIndex * 0.004`).
- **3D → 2D projected DOM world labels & HUD layering:** raw `vector.project(camera)`
  pills stack unreadably down-road under perspective foreshortening. Pool DOM nodes by
  entity key (never rebuild `innerHTML` every frame), order `z-index` by camera depth,
  run 2 passes of 2D screen-space AABB repulsion lifting farther pills above nearer
  ones, and verify toast stacks against boss warning cards and bottom HUD bars at
  `540×960 @ 2x DPR`.
- **Silhouette-first weapon & projectile readability:** give each weapon class its own
  instanced 3D projectile silhouette (darts, finned chevrons, tumbling flak octahedrons,
  ringed plasma cores) paired with inline `<svg aria-hidden="true" focusable="false">`
  HUD/world weapon symbols (`currentColor`, `≥ 3:1` contrast) instead of colour dots.
- **Standalone single-file 3D HTML:** base64-embedding compact procedural binary glTF
  2.0 `.glb` buffers and parsing via `GLTFLoader.parse(arrayBuffer)` ships zero-server
  `file://`-playable 3D builds under `1.5 MB` and `< 25` draw calls.

## When not to add an engine

- The game is mostly UI and text.
- The team is one agent and the timeline is days: an engine is another abstraction
  to learn and debug.
- The bundle budget is tight (mobile-first).
- You cannot test it deterministically yet — fix testing first; engines make
  flakiness worse, not better.

## Migration order

1. Freeze behaviour: capture seeds, hashes and bot scores.
2. Introduce the `Renderer` seam with the existing Canvas implementation.
3. Add the new renderer side by side behind a flag.
4. Compare screenshots and perf; keep both until parity.
5. Delete the old path, regenerate baselines, run `verify`.

Never migrate the game rules and the renderer in the same change.
