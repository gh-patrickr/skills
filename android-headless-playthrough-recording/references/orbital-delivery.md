# Orbital Delivery — Playthrough Recording & Audio Reference

Project root: `<workspace>/ag_sternendenker`

## Key Files

- **One-Command Recorder & Google Drive Uploader**: `scripts/record_playthrough.sh`
- **Native Mesa EGL + OpenGL ES 3.0 Offscreen Renderer (JNI)**: `scripts/gles_offscreen_recorder.c`
- **Headless Playthrough & Touch-Overlay Test**: `android-app/src/test/kotlin/de/sternendenker/orbital/app/PlaythroughVideoRecorderTest.kt`
- **Gravity-Modulated Space Music Synthesizer**: `android-app/src/main/kotlin/de/sternendenker/orbital/app/audio/ProceduralAudioSynthesizer.kt`
- **Audio Signal & Gravity Telemetry Unit Tests**: `android-app/src/test/kotlin/de/sternendenker/orbital/app/AudioSynthSignalTest.kt`
- **Playtest Regression Suites (Core & UI)**: `core-engine/src/test/kotlin/de/sternendenker/orbital/core/PlaytestBugReportCoreRegressionTest.kt`, `android-app/src/test/kotlin/de/sternendenker/orbital/app/PlaytestBugReportUiRegressionTest.kt`
- **OpenGL ES 3.0 Shaders**: `android-app/src/main/kotlin/de/sternendenker/orbital/app/graphics/CosmicNeonShaders.kt`

## Commands

```bash
# Record Levels 1, 2, and 13 at 1920x1200 (30 fps H.264 + 44.1 kHz stereo AAC) and update Google Drive in place:
./scripts/record_playthrough.sh --levels 1,2,13 --upload-gdrive

# Regenerate all 100 campaign levels sequentially BEFORE running verification gates:
./gradlew :cli-generator:generateCampaignLevels --no-daemon && \
  ./gradlew :core-engine:test :cli-generator:test :android-app:testDebugUnitTest :android-app:lintDebug --no-daemon
```
