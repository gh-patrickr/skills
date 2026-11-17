# Orbital Delivery — Playthrough Recording & Audio Reference

Project root: `/home/antigravity/gh-patrickr/ag_sternendenker`

## Key Files

- **One-Command Recorder & Google Drive Uploader**: `scripts/record_playthrough.sh`
- **Native Mesa EGL + OpenGL ES 3.0 Offscreen Renderer (JNI)**: `scripts/gles_offscreen_recorder.c`
- **Headless Playthrough & Touch-Overlay Test**: `android-app/src/test/kotlin/de/sternendenker/orbital/app/PlaythroughVideoRecorderTest.kt`
- **Gravity-Modulated Space Music Synthesizer**: `android-app/src/main/kotlin/de/sternendenker/orbital/app/audio/ProceduralAudioSynthesizer.kt`
- **Audio Signal & Gravity Telemetry Unit Tests**: `android-app/src/test/kotlin/de/sternendenker/orbital/app/AudioSynthSignalTest.kt`
- **OpenGL ES 3.0 Shaders**: `android-app/src/main/kotlin/de/sternendenker/orbital/app/graphics/CosmicNeonShaders.kt`

## Commands

```bash
# Record Levels 1, 2, and 13 at 1920x1200 (30 fps H.264 + 44.1 kHz stereo AAC) and update Google Drive in place:
./scripts/record_playthrough.sh --levels 1,2,13 --upload-gdrive

# Run all verification gates (core physics, 100-level campaign audit, unit/audio/UI tests, Android lint):
./gradlew :core-engine:test :cli-generator:test :android-app:testDebugUnitTest :android-app:lintDebug --no-daemon
```

## Google Drive Targets

- **Folder (`Orbital Delivery Playthroughs`)**: `1l5zBoZZr_jDA6mY76AIfH2NZdW44ux_d` (`https://drive.google.com/drive/folders/1l5zBoZZr_jDA6mY76AIfH2NZdW44ux_d`)
- **Playthrough Video (`orbital-playthrough-L1_2_13.mp4`)**: `1dCdDixg75EDQ-kekHt-lP6cTWuOxHRwN` (`https://drive.google.com/file/d/1dCdDixg75EDQ-kekHt-lP6cTWuOxHRwN/view`)
