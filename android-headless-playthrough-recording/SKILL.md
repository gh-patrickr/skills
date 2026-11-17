---
name: android-headless-playthrough-recording
description: Use when recording Android gameplay or UI videos in a headless/KVM-less cloud VM, sharing mobile-ready MP4 playthroughs to Google Drive, debugging Gradle/Robolectric TLS proxy failures, fixing OpenGL ES alpha-halo artifacts, or sonifying physics telemetry into procedural audio.
---

# Android Headless Playthrough Recording & Physics Sonification

**Applies to:** any Android app or game (especially OpenGL ES 3.0 + Custom `View`/`Canvas` HUD apps) where the user wants screen recordings for remote/mobile review, or when running Gradle + Robolectric + native GLES in a container/cloud VM without `/dev/kvm` or a physical display.

Project-specific paths, Drive IDs, and commands for **Orbital Delivery** live in [`references/orbital-delivery.md`](references/orbital-delivery.md).

---

## 1. Headless OpenGL ES 3.0 + Android Canvas Video Pipeline (No Emulator / No `/dev/kvm`)

Cloud VMs typically lack `/dev/kvm`, making full Android system-image emulators either unavailable or prohibitively slow. Instead of booting an AVD, record native-resolution (`1920×1200` or target viewport) H.264 + AAC `.mp4` playthroughs directly inside a Robolectric test:

1. **Offscreen OpenGL ES 3.0 World Renderer (Mesa Surfaceless EGL via JNI)**:
   - Compile a small C JNI bridge against system `libEGL` and `libGLESv2`:
     ```bash
     JAVA_BIN="$(readlink -f "$(command -v javac)")"
     JAVA_HOME_DIR="$(dirname "$(dirname "$JAVA_BIN")")"
     gcc -O2 -shared -fPIC \
       -I"$JAVA_HOME_DIR/include" -I"$JAVA_HOME_DIR/include/linux" \
       scripts/gles_offscreen_recorder.c -o /tmp/libgles_recorder.so -lEGL -lGLESv2
     ```
   - Initialize Mesa's surfaceless platform display (`eglGetPlatformDisplay(0x31DD /* EGL_PLATFORM_SURFACELESS_MESA */, EGL_DEFAULT_DISPLAY, NULL)`) with an `EGL_PBUFFER_BIT` surface at the target resolution and an `EGL_CONTEXT_CLIENT_VERSION, 3` context.
   - Compile and run the exact production `#version 300 es` shaders, read back RGBA pixels with `glReadPixels`, and flip rows vertically (OpenGL origin is bottom-left; video/Bitmap origin is top-left).

2. **Android UI / HUD Layer (Robolectric Native Skia `Canvas`)**:
   - Annotate the test with `@RunWith(RobolectricTestRunner::class)`, `@Config(sdk = [34], qualifiers = "w1920dp-h1200dp-land-mdpi")`, and `@GraphicsMode(GraphicsMode.Mode.NATIVE)`.
   - Measure and layout the real Android `View` hierarchy (`View.MeasureSpec.EXACTLY`), render it into an `ARGB_8888` `Bitmap` via `Canvas(hudBitmap)`, and alpha-blend the HUD pixels over the GLES framebuffer in C.

3. **FFmpeg H.264 + Stereo AAC Muxing for Mobile Streaming**:
   - Pipe raw RGBA frames to `ffmpeg -f rawvideo -pix_fmt rgba -s 1920x1200 -r 30 -i - -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p` and mux with `44100 Hz` stereo float PCM (`-f f32le -ar 44100 -ac 2 -c:a aac -b:a 160k -movflags +faststart`) so the resulting `.mp4` streams immediately in mobile browsers and the Google Drive phone app.

---

## 2. Cloud VM Traps & Exact Fixes (Gradle, Robolectric, Proxy TLS, `gdrive`)

### Trap A: `SSLHandshakeException: PKIX path building failed` when Robolectric downloads `android-all-instrumented`
- **Root cause**:
  1. In sandboxed VMs (`exebox` / `agy-plugin-proxy`), every command invocation gets a new ephemeral proxy port and appends the proxy CA certificate to the **end** of `/etc/ssl/certs/ca-certificates.crt`.
  2. `keytool -importcert -file /etc/ssl/certs/ca-certificates.crt` only imports the **first** certificate in a multi-cert PEM bundle, silently ignoring the proxy CA at the bottom.
  3. Gradle's forked `Test` worker JVM does not automatically inherit `GRADLE_OPTS` trustStore/proxy properties, and a lingering Gradle daemon caches the dead proxy port from an earlier command.
- **Fix**:
  1. In `build.gradle.kts`, forward trustStore and proxy system properties into forked `Test` workers:
     ```kotlin
     tasks.withType<Test>().configureEach {
         for (prop in listOf(
             "javax.net.ssl.trustStore", "javax.net.ssl.trustStorePassword",
             "http.proxyHost", "http.proxyPort", "https.proxyHost", "https.proxyPort"
         )) {
             System.getProperty(prop)?.let { systemProperty(prop, it) }
         }
     }
     ```
  2. Before invoking `./gradlew ... --no-daemon`, split `/etc/ssl/certs/ca-certificates.crt` so **every** certificate is imported into `/tmp/cacerts`:
     ```bash
     rm -f /tmp/cacerts /tmp/cert.*.pem
     awk 'BEGIN {c=0;} /BEGIN CERT/{c++} { print > "/tmp/cert." c ".pem"}' /etc/ssl/certs/ca-certificates.crt
     for f in /tmp/cert.*.pem; do
       keytool -importcert -noprompt -keystore /tmp/cacerts -storepass changeit -file "$f" -alias "cert_$(basename "$f")" >/dev/null 2>&1 || true
     done
     rm -f /tmp/cert.*.pem
     PROXY_HOST=$(echo "$HTTP_PROXY" | sed -E 's|https?://([^:/]+):([0-9]+).*|\1|')
     PROXY_PORT=$(echo "$HTTP_PROXY" | sed -E 's|https?://([^:/]+):([0-9]+).*|\2|')
     export GRADLE_OPTS="-Djavax.net.ssl.trustStore=/tmp/cacerts -Djavax.net.ssl.trustStorePassword=changeit -Dhttp.proxyHost=$PROXY_HOST -Dhttp.proxyPort=$PROXY_PORT -Dhttps.proxyHost=$PROXY_HOST -Dhttps.proxyPort=$PROXY_PORT"
     ```

### Trap B: `gdrive` CLI fails on first run with `chmod: Operation not permitted` on FUSE mount
- **Root cause**: `gdrive` downloads its binary to `~/.gemini/jetski/plugin_data/gdrive/bin/.gdrive.tmp.<pid>` and calls `chmod`, which FUSE rejects even though files on the mount already have `0755` permissions.
- **Fix**: Rename `.gdrive.tmp.*` to the expected `gdrive-<version>` filename in the same directory.

### Trap C: Unnecessary `@RunWith(RobolectricTestRunner::class)` on logic/controller tests
- **Rule**: Keep UI controllers (`TouchUiController`, `StarMapController`, `InAppLevelEditorController`), camera math (`SmartFramingCamera`), and geometry builders (`TrajectoryGeometryBuilder`) free of `android.view.MotionEvent` and `android.graphics.Canvas`. Pass plain coordinates (`Float`, `Vec2`) into controller methods so 95 %+ of UI/editor/star-map regression tests run as pure JVM tests (`kotlin.test.Test`) in milliseconds without triggering Robolectric's `MavenArtifactFetcher` download at all. Reserve `@RunWith(RobolectricTestRunner::class)` strictly for tests that rasterize an Android `Bitmap`/`Canvas` or record video frames.

---

## 3. Visual & Physics Fidelity Rules for Recorded Playthroughs

1. **Never silently change simulation playback speed (`PlaybackSpeed`) mid-flight**:
   - Switching time-warp (e.g. `5x` → `10x`) mid-flight without a visible button tap makes the probe and planets suddenly jump in screen speed. If that frame coincides with passing a waypoint or bonus buoy, it looks like an unphysical speed boost caused by that object. Keep playback speed constant throughout the flight, or explicitly animate a tap on the speed button first.
2. **Label every non-obvious ring or marker on the HUD**:
   - Unlabeled circles on a trajectory (such as optional bonus satellites) look like mysterious physics triggers. Label them clearly (e.g. `★ Bonus-Satellit`) and draw a visible touch-ripple + caption for every scripted tap/drag.
3. **OpenGL ES 3.0 Straight vs. Premultiplied Alpha (`GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA`)**:
   - Under standard straight-alpha blending (`glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`), **never** pre-multiply RGB by alpha inside the fragment shader (`vec4(rgb * a, a)`). Hardware blending multiplies by `a` a second time (`rgb * a²`) while attenuating the background by `1 - a`, producing a dark rectangular bounding-box halo around glowing sprites over non-black backgrounds.
   - **Fix**: Output straight alpha (`outRgb = premulRgb / max(outAlpha, 1e-4)`) or use `glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA)`.
4. **Reset auto-selected playback speed on level transition & bound outer-planet flight horizons**:
   - If `autoSelectSpeed` steps up to `5x` or `10x` for long-period outer-system transfers, reset `speed = PlaybackSpeed.NORMAL` and `speedManuallyChosen = false` inside `loadLevel(...)` so subsequent short missions do not inherit high time-warp. Budget `maxFlightFrames >= 650` (`~21.6 s` at `30 fps`) so multi-year outer-planet transfers complete before recording stops.
5. **Prevent HUD bleed-through behind semi-transparent modal/menu overlays**:
   - When a full-screen menu overlay `View` (`alpha < 255`) is visible, explicitly set sibling HUD views to `View.INVISIBLE` and clear the overlay canvas (`PorterDuff.Mode.SRC`) before drawing so underlying HUD telemetry cards and gauges never bleed through.

---

## 4. Real-Time Procedural Space Music & Physics Telemetry Sonification

When synthesizing real-time game audio (`AudioTrack` / PCM buffer) driven by physical forces:

1. **Eliminate 60 Hz buffer-boundary zipper noise and microtonal dissonance**:
   - Never assign un-quantized log-mass frequencies to simultaneous oscillators (causes harsh beating) or step frequency/gain once per 16.6 ms display frame without per-sample smoothing.
   - Smooth all synthesis targets (`freqHz`, `strength`, `tangentialAssist`, `radialPull`, `pan`) **per audio sample** using a one-pole filter (`s += alpha * (target - s)`, $\tau \approx 25\text{ ms}$), and voice chords using harmonic ratios (sub-octave `0.5x`, root `1.0x`, fifth `1.5x`, morphing third/tenth `2.4x..2.63x`, ninth `2.25x`, and shimmer `4.0x..5.0x`) through a 2-pole resonant low-pass filter and stereo ping-pong delay.
2. **Gate velocity modulation on the active simulation phase**:
   - During menus or static planning (`phase != RUNNING`), pass `Vec2.ZERO` for probe velocity so the synthesizer plays a calm ambient pad; activate full Doppler and acceleration modulation only when the probe is in flight.
3. **Balance multi-scale N-body fields (Star vs. Local Planets)**:
   - In heliocentric levels where the central star is $10^3\text{–}10^6\times$ more massive than planets, weight non-star bodies higher (e.g. `0.22x` star, `3.8x` planets) in the audio telemetry vector so close planetary gravity assists sing clearly alongside the background solar field.
4. **Map the 3 orthogonal components of gravitational acceleration $\vec{a}_{\text{grav}}$ to distinct musical dimensions**:
   - **Tangential ($\vec{a}_{\text{grav}} \cdot \hat{v}$, speeding up vs. slowing down)**:
     - *Speeding up ($> 0$)*: Brighten chord intervals into **Lydian / Major 9th**, glide pitch upward, and step a crystalline bell arpeggiator **upward** at a faster rate.
     - *Slowing down ($< 0$)*: Morph chord intervals into **Minor / Suspended**, bend pitch downward, warm the low-pass filter, and step the arpeggiator **downward** in a slower cadence.
   - **Radial ($\vec{a}_{\text{grav}} \cdot \hat{u}_{\text{out}}$, pulled inward vs. pulled outward)**:
     - *Inward toward system center ($< 0$)*: Boost grounded sub-bass (`0.5x`, `1.0x` with 2nd-harmonic warmth) and centered low-mid resonance.
     - *Outward away from center ($> 0$, outer planet or repulsor)*: Open airy high-register shimmer partials (`4x..5x`), raise the arpeggio register, and widen stereo chorus detuning.
   - **Magnitude ($\|\vec{a}_{\text{grav}}\|$, gravity strength)**:
     - Use log-compressed strength ($\tanh(0.55 \ln(1 + 2.4 \|\vec{a}\| / a_{\text{ref}}))$) to drive master dynamic swell, filter cutoff brilliance, and pulse rate, and verify all three axes with pure-JVM signal tests (RMS, zero-crossing Hz, and derivative spectral brightness).
5. **Widen telemetry smoothing under high time-warp (`10x–50x`)**:
   - Scale the per-sample telemetry envelope time constant with the active playback speed ($\tau_{\text{warp}} = \tau_0 \cdot (1 + 0.55 \ln(\text{warp}))$, up to $\sim 80\text{ ms}$ at `50x`) so compressed orbital flybys produce smooth musical swells instead of abrupt pitch/filter whips.
