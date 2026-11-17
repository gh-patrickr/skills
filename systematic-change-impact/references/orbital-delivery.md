# Systematic change impact profile — Orbital Delivery (`ag_sternendenker`)

Reference implementation of `systematic-change-impact` for **Orbital Delivery** (`gh-patrickr/ag_sternendenker`), an Android + JVM deterministic 120 Hz N-body space-navigation game.

## State map

| Store | Kind | Notes |
| --- | --- | --- |
| `android-app/src/main/assets/levels/level-001.json` … `level-018.json` | Committed derived corpus | 18 Solar System campaign missions with embedded `goldenSolution` parameters, `bonusBuoy` coordinates, `cargoClass`, and `hazards` |
| `scripts/okf.py` → `ARCHITECTURE.md`, `index.md` | Committed derived documentation | 132 generated OKF v0.1 files across 66 directories; never hand-edit |
| `build/recordings/orbital-playthrough-*.mp4` | Derived verification artefact | Headless 1920×1200 30fps Mesa EGL/GLES3 + Android Skia Canvas + 44.1 kHz stereo PCM playthrough video |

## Writer and supported paths

- **Campaign JSON writer**: `:cli-generator:generateCampaignLevels` (`CampaignGeneratorMain.kt` → `LevelGenerator.generateCampaign()`).
  - Never hand-edit `goldenSolution`, `capsuleLaunch`, or `bonusBuoy` coordinates in `level-*.json`.
  - When invoked via Gradle (`./gradlew :cli-generator:generateCampaignLevels`), the subproject working directory is `cli-generator/`; `CampaignGeneratorMain.kt` resolves `../android-app/src/main/assets/levels` and writes each verified level JSON immediately upon completion. Pass `--args="--output <abs-path> --levels=7,8"` for fast single-level inner-loop iteration before running the full `:cli-generator:test` gate.
- **Gradle in sandboxed Linux VMs**: Always pass `ANDROID_HOME=$HOME/android-sdk` and `--no-daemon --offline` (or use `scripts/record_playthrough.sh` which builds the local proxy truststore automatically).

## Hard-earned domain rules (N-body solver & campaign generation)

1. **Mid-course heliocentric gravity assists (`LevelSolverEngine.kt`)**:
   - Bound candidate sampling along the unaided trajectory to `0 .. closestApproachTick` (not the full post-flyby simulation horizon) so the solver places gravity assists *before* target arrival.
   - Clamp heliocentric candidate radii to `minPathFraction = 0.18, maxPathFraction = 0.58` so player-placed bodies deflect the capsule mid-course rather than spawning on top of the destination planet and pulling the target planet itself out of orbit.
2. **Back-rotating orbiting player planets (`bodiesFromParams`)**:
   - When `level.placedBodiesOrbit` is `true` (`CIRCULAR_ORBIT` around the Sun), a planet needed at intercept point $\vec{p}_{\text{int}}$ at tick $k$ ($t = k \cdot \Delta t$) must be spawned at $t = 0$ back-rotated by $\Delta\theta = -\omega(r) \cdot t$ around the central star so it arrives at $\vec{p}_{\text{int}}$ simultaneously with the capsule.
3. **Outer-planet transfer detuning (`LevelGenerator.kt`, `L11–L18`)**:
   - On near-Hohmann outer-planet transfers (`Jupiter`, `Saturn`, `Uranus`, `Neptune`), detuning launch speed (`dDv < 0`) drops aphelion inside the target planet's orbit so the capsule never reaches the target's heliocentric radius.
   - Prioritize fine lateral angular detunes (`±0.0025 * k rad`) before speed detunes so the unaided trajectory still crosses the target orbital radius at the arrival epoch, where a mid-course gravity assist bends it cleanly into the docking/orbit zone.
4. **Downstream 3★ `BonusBuoy` divergence**:
   - Place the 3★ `BonusBuoy` by searching `0.55 .. 0.98` of `goldenRun.trajectory` for the tick that maximizes minimum Euclidean clearance from the unaided trajectory, then verify `!unaided.bonusBuoyCollected` so the 3rd star strictly requires the gravity-assist deflection.
5. **Headless 1920×1200 GLES 3.0 + Stereo Audio recording (`scripts/record_playthrough.sh`)**:
   - Uses `scripts/gles_offscreen_recorder.c` (`eglCreatePbufferSurface` on Mesa `llvmpipe`) + Robolectric `@GraphicsMode(GraphicsMode.Mode.NATIVE)` + `ProceduralAudioSynthesizer` (`44100 Hz` stereo `f32le`) muxed via `ffmpeg` and uploaded to Google Drive (`--upload-gdrive` via `gdrive mutate update/upload`).
   - Outer-planet missions at `5x` playback speed require `maxFlightFrames >= 650` (`~21.6 s` real time) to reach target rendezvous before recording ends.
6. **Visual planet sizing vs. N-body mass & natural satellites (`SolarSystem.kt`, `MotionStrategy.kt`)**:
   - Never modify `SolarSystem.PLANETS` or solar masses for visual legibility (`SolarSystemStabilityTest` enforces exact IAU mass ratios and 1,000-year symplectic Yoshida stability); scale `BodyVisual.minScreenRadiusDp` and `SceneBuilder` visual world-to-screen clamping instead.
   - Natural planetary moons (`parentIndex > 0 && !isPlayerPlaced`, e.g. `"moon"` around `"earth"`) follow analytic `KeplerRailMotionStrategy.placeOnRails` around their N-body parent planet and are skipped in planet-planet `computeAccelerations` (avoiding double-pulling the Earth-Moon barycenter mass) while acting normally on the capsule in `PhysicsKernel.bodyAcceleration`.
7. **Planning preview, camera continuity & `RESET` semantics (`GameController.kt`)**:
   - `previewTicksFor` covers `maxSimulationTicks` so full trajectory hit/miss and closest-approach rendezvous state are visible before `START`.
   - Keep camera center and zoom (`pxPerUnit`) unchanged when transitioning from `PLANNING` into `RUNNING` (`startSimulation` / `stepDisplayFrame`).
   - Explicit `RESET` (`clearPlacements = true`) clears player-placed bodies and resets `budgetSpent` to `0`; tapping the world after a run (`clearPlacements = false`) rewinds to $t = 0$ while preserving placements for adjustment.
8. **Static-mode sanctity, predictive intercept parity & goal immunity**:
   - Clamp target and wormhole velocities/accelerations to zero whenever `motionStrategy == STATIC` so introductory static missions never drift off their $t = 0$ markers after `START`.
   - Whenever targets or portals move in dynamic modes, render their synchronized orbital path and closest-approach intercept marker during `PLANNING`, and anchor targets to primary celestial bodies (or exclude player-placed micro-masses from target acceleration) so steering planets never yank `ZIEL` away from the shot.

## Verification gate recipe

```bash
# 1. Regenerate campaign levels whenever physics, solver, or mission blueprints change
ANDROID_HOME=$HOME/android-sdk ./gradlew :cli-generator:generateCampaignLevels --no-daemon --offline

# 2. Layer 1 & 2: 120 Hz physics invariants + 100% campaign bot (1/2/3 stars, jitterHitRate >= 0.80, anti-frustration)
ANDROID_HOME=$HOME/android-sdk ./gradlew :core-engine:test :cli-generator:test --no-daemon --offline

# 3. Layer 3 & 4: Robolectric UI, editor solver, audio DSP & Android Lint
ANDROID_HOME=$HOME/android-sdk ./gradlew :android-app:testDebugUnitTest :android-app:lintDebug --no-daemon --offline

# 4. OKF documentation gate
python3 scripts/okf.py --write && python3 scripts/okf.py --check && python3 tests/unit/test_okf_docs.py

# 5. Playthrough video + stereo audio capture & Google Drive update
ANDROID_HOME=$HOME/android-sdk ./scripts/record_playthrough.sh --levels 1,2,13 --upload-gdrive
```
