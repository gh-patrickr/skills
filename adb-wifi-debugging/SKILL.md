---
name: adb-wifi-debugging
description: Connect to and debug/playtest Android or Amazon Fire tablets over Wi-Fi ADB (wireless debugging) from macOS, Linux, or a VM — finding IP/port, pinning a fixed port, installing APKs, launching apps, screenshots, input injection (tap/swipe/pinch), logcat crash triage, frame-time (gfxinfo), and memory checks. Use whenever the user mentions ADB, wireless debugging, a tablet/phone test device, on-device playtests, or a Fire HD tablet.
---

# ADB over Wi-Fi: Debugging & Playtesting Android / Fire Tablets

If running inside a VM or NATed network, **mDNS discovery (`adb mdns services`) often does not work** across subnets even when the device IP is reachable through the gateway. Connect explicitly by IP and port instead.

## 1. Find the connection

1. **Check the project first**: look for a gitignored `device.properties` (or local env config) in the repo root with `DEVICE_IP` / `ADB_PORT` (or `TABLET_IP` / `TABLET_ADB_PORT`).
2. `adb connect <DEVICE_IP>:5555` first. If you get "Connection refused", the device is reachable but nothing is listening on that port. Android 11+ Wireless Debugging picks a **random port (30000-49999)** every time it is toggled or the device reboots or sleeps for a long time.
3. Port scanning is unreliable (it may find nothing even when the port is open). **Ask the user** for the IP:port shown under *Settings > Device Options > Developer Options > Wireless debugging*.
   On Fire tablets, Developer Options are unlocked by tapping the serial number 7 times.
4. `ping <DEVICE_IP>` checks reachability. RTT can be 10-1000 ms on Wi-Fi with power saving.
5. **First-time TLS pairing from a new host/VM (`SSLV3_ALERT_CERTIFICATE_UNKNOWN`)**: if `adb connect <DEVICE_IP>:<PORT>` fails generically even though the TCP port is open, inspect `${TMPDIR:-/tmp}/adb.$(id -u).log`. `SSLV3_ALERT_CERTIFICATE_UNKNOWN` means this machine's `~/.android/adbkey` is unpaired (or you targeted the pairing port). Android 11+ Wireless Debugging uses **two separate ephemeral ports**:
   - **Pairing port** (active *only* while *"Pair device with pairing code"* is open): run `adb pair <DEVICE_IP>:<PAIRING_PORT> <6_DIGIT_CODE>` — always pass `<6_DIGIT_CODE>` as a CLI argument, never omit it (omitting it hangs waiting on stdin).
   - **Connect port** (shown on the main *Wireless debugging* screen under *"IP address & Port"*): run `adb connect <DEVICE_IP>:<CONNECT_PORT>` *after* pairing succeeds (`adb connect` against the pairing port always fails).

## 2. Pin a fixed port (do this once per reboot)

```bash
adb connect <DEVICE_IP>:<RANDOM_PORT>
adb -s <DEVICE_IP>:<RANDOM_PORT> tcpip 5555   # adbd restarts and also listens on 5555 until reboot
sleep 4; adb disconnect <DEVICE_IP>:<RANDOM_PORT>; adb connect <DEVICE_IP>:5555
adb devices -l                                 # must show "device", not "offline"/"unauthorized"
```
Save the IP and port only in a **gitignored** local file (e.g. `device.properties` with `DEVICE_IP=<DEVICE_IP>` and `ADB_PORT=5555`), never in committed repository files, and use a helper script (e.g. `scripts/adb_connect.sh`) that reads it. With multiple entries, always pass `-s <DEVICE_IP>:<PORT>`.

## 3. Everyday commands (always `-s $SERIAL`)

```bash
S="<DEVICE_IP>:5555"
adb -s "$S" shell getprop ro.product.model; adb -s "$S" shell wm size; adb -s "$S" shell wm density
adb -s "$S" install -r -d path/to/app-debug.apk           # -r replace, -d allow downgrade
adb -s "$S" shell am force-stop PKG
adb -s "$S" shell am start -W -n PKG/.MainActivity         # -W waits and prints TotalTime
adb -s "$S" shell monkey -p PKG -c android.intent.category.LAUNCHER 1   # launch without knowing the activity
adb -s "$S" shell pidof PKG
```

**Signature mismatch (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) across host/VM builds:** when a VM's `~/.android/debug.keystore` differs from the machine that installed the APK, `install -r` fails and `uninstall -k` still rejects the new certificate. **Never** run a bare `adb uninstall PKG` before checking for user save files/profiles — on debuggable builds, back up app data to `/tmp` (never into the git repo) via `run-as`, reinstall, initialize once, and restore:
```bash
adb -s "$S" exec-out run-as PKG tar -cf - files shared_prefs databases 2>/dev/null > /tmp/pkg_data.tar
adb -s "$S" uninstall PKG && adb -s "$S" install path/to/app-debug.apk
adb -s "$S" shell monkey -p PKG -c android.intent.category.LAUNCHER 1
adb -s "$S" shell am force-stop PKG
cat /tmp/pkg_data.tar | adb -s "$S" shell run-as PKG tar -xf -
```
If `run-as` reports the installed build is not debuggable, ask the user or trigger the app's own export before uninstalling.

**Keep the screen awake.** If the device locks, input and screenshots fail or show the lock screen:
```bash
adb -s "$S" shell input keyevent KEYCODE_WAKEUP
adb -s "$S" shell svc power stayon true                    # stay on while charging
adb -s "$S" shell settings put global stay_on_while_plugged_in 7   # fallback when svc power is restricted
adb -s "$S" shell settings put system screen_off_timeout 1800000
adb -s "$S" shell "dumpsys power | grep -E 'mWakefulness|Display Power'; dumpsys window | grep -E 'mCurrentFocus|isStatusBarKeyguard'"
```
If a PIN/password lock screen is active, Android/Fire OS ignores `system screen_off_timeout` and turns the display off again in ~10 s, `wm dismiss-keyguard` / swipe only reveals the PIN pad, and `am start` launches *underneath* the lock screen. Ask the user once to unlock with their PIN and wait — do not try to bypass it or inject blind taps. When `Display Power: state=OFF`, `screencap -p` exits `0` with an **all-black PNG** (distinct from `FLAG_SECURE`, which returns `rc=1` or an empty file).

## 4. Screenshots: look at the app

```bash
adb -s "$S" exec-out screencap -p > /path/to/scratch/shot.png
```
Then view the PNG with the file viewer tool. A landscape app on a 1200x1920 portrait-native panel gives 1920x1200 shots. Take screenshots after every meaningful interaction to verify the UI state. Don't guess.

## 5. Input injection (playtesting)

```bash
adb -s "$S" shell input tap X Y
adb -s "$S" shell input swipe X1 Y1 X2 Y2 300              # drag (300 ms); same point + long duration = long-press
adb -s "$S" shell input keyevent KEYCODE_BACK
adb -s "$S" shell input text "hello"
```
- Coordinates are **screen pixels in the current orientation** (e.g. landscape 1920x1200).
- `input` has no multi-touch. For pinch zoom, either add a debug zoom control or intent to the app, or use `sendevent` (device-specific, painful). Prefer app-side debug hooks:
  `adb shell am broadcast -a PKG.DEBUG_ACTION --es cmd zoom_in` received by a debug-only BroadcastReceiver.
- To find button positions, use `adb -s "$S" shell uiautomator dump /sdcard/ui.xml && adb -s "$S" pull /sdcard/ui.xml`.
  This only works for real Views, not for buttons drawn on a Canvas/GL surface. For those, read the layout code or the screenshot.
- **Debugging "cannot click button" on Canvas / OpenGL overlays:**
  - **Inset view bounds vs. panel size**: check `adb -s "$S" shell dumpsys activity top | grep -E "SurfaceView|Overlay"` — status/navigation bars shrink the view (e.g. `0,0-1920,1092` on a `1920x1200` panel), shifting world-to-screen Y math when full panel height is assumed.
  - **Drag-ring / gesture handle stealing `ACTION_DOWN`**: if action buttons (`DEL`, `Spin`, etc.) sit at radius `R` on a configuration ring, check discrete button hitboxes *before* radial drag bands (`abs(dist - R) <= band`) or center-move handlers; entering a drag mode on `ACTION_DOWN` suppresses `onTap`.
  - **World-space vs. screen-pixel hitboxes under zoom**: never compare `worldPt.distanceTo(btnWorld) <= hitboxPx` raw — convert via `hitboxPx / camera.zoom` (or hit-test in screen pixels) so zoomed-out targets stay >= 48-64 dp.
  - **Edge clipping, type-order priority & silent guards**: flip or clamp floating context buttons near viewport borders so `center + offset` stays on-screen, choose `minByOrNull { distance }` across *all* entity types instead of type-ordered `when` branches, and never render an active button whose handler silently returns `false` on pre-placed entities and falls through to empty-space tap handling.

## 6. Logs & crash triage

```bash
adb -s "$S" logcat -c                                      # clear before a test run
adb -s "$S" logcat -d -v time | grep -E "AndroidRuntime|FATAL|ANR|PKG" | tail -80
adb -s "$S" logcat -d -b crash                             # crash buffer only
adb -s "$S" logcat -d --pid=$(adb -s "$S" shell pidof PKG) | tail -200
```
Run long logcat streams as background tasks, never in the foreground with no end.
Search for `FATAL EXCEPTION`, `ANR in`, `GLThread`, `OpenGLRenderer`, `E/` lines from your tag.

## 7. Performance & memory gatekeeping

```bash
adb -s "$S" shell dumpsys gfxinfo PKG reset                # reset, then play for ~10-20 s
adb -s "$S" shell dumpsys gfxinfo PKG | grep -E "Total frames|Janky|50th|90th|95th|99th"
adb -s "$S" shell dumpsys meminfo PKG | grep -E "TOTAL|Java Heap|Native Heap|Graphics"
```
`gfxinfo` covers only the UI thread or RenderThread (Canvas Views). A `GLSurfaceView` renders on its own `GLThread`, so also log your own frame times (e.g. a `Choreographer`-based FPS logger to logcat).

## 8. Instrumented tests on device

```bash
ANDROID_SERIAL="$S" ./gradlew :app:connectedDebugAndroidTest
```
- Results are written to `app/build/outputs/androidTest-results/connected/**/TEST-*.xml`.
- **AGP uninstalls the app (and the test APK) after `connected*AndroidTest`.** Run `adb install -r` again before a manual playtest.
- Offscreen GL tests (EGL pbuffer) and pure logic tests don't take over the screen, so they're safe while someone uses the device. Tests that launch an Activity do take over the screen.

## Before taking over the device: check whether someone is using it
```bash
adb -s "$S" shell am get-current-user                      # tablets are often multi-user (secondary profiles)
adb -s "$S" shell pm list users
adb -s "$S" shell dumpsys activity activities | grep mResumedActivity   # what's in the foreground
```
If another app is in the foreground (e.g. active media playback in another user profile),
**don't interrupt it** with installs, launches or input. Tell the user and wait or ask.
- Install or launch for the active user: `adb install --user CURRENT -r app.apk`, `am start --user current ...`.
  A package installed for user 0 is not automatically available in a secondary user profile.
- `screencap` returns rc=1 or an empty file while a `FLAG_SECURE`/DRM window is visible (video players). That's not an ADB problem.

## Gotchas
- `offline` after `adb tcpip`: wait 3-5 s and reconnect; disconnect the stale random-port entry.
- `unauthorized`: the user must accept the RSA prompt on the device (check "Always allow").
- A device reboot resets `tcpip 5555`. Go back to step 1.2.
- macOS has no `timeout` command. Use background tasks or `perl -e 'alarm N; exec @ARGV' cmd`.
- Fire OS has no Google Play services. Don't rely on them in apps.

## 9. Sideloaded Always-On Audio & Kiosk Apps (Fire OS / Android 11+)

- **Fire OS `RECORD_AUDIO` revocation & launcher lock:** Fire OS revokes `RECORD_AUDIO` from sideloaded (non-Amazon-Appstore) APKs on reboot or Wi-Fi drops, and blocks replacing `com.amazon.firelauncher` as the default Home app. Standard kiosk/satellite pattern: pair a narrow `AccessibilityService` (to re-foreground the app and accept own-app mic/update prompts) with `appops` and keyguard suppression:
  ```bash
  adb -s "$S" shell appops set PKG REQUEST_INSTALL_PACKAGES allow
  adb -s "$S" shell settings put secure enabled_accessibility_services PKG/PKG.HomeGuard
  adb -s "$S" shell settings put secure accessibility_enabled 1
  adb -s "$S" shell locksettings set-disabled true
  ```
  *Gotcha:* `am force-stop PKG` clears its `enabled_accessibility_services` entry — re-run both `settings put secure` lines after force-stopping.
- **Android 11+ (API 30+) background microphone block:** A `ForegroundService` started from `RECEIVE_BOOT_COMPLETED` cannot capture audio until an `Activity` has entered the foreground once and promoted the service with `FOREGROUND_SERVICE_TYPE_MICROPHONE`. Check `rec.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING` plus a read-stall watchdog (`~3 s`) rather than blocking forever on `AudioRecord.read()`.
- **Bundled Go / native child daemons inside APKs:** Plain `GOOS=linux` Go binaries crash under Android's seccomp filter (`pidfd_open` probe). Cross-compile with `GOOS=android` + Android NDK `clang`, package as `lib/<abi>/lib<name>.so` so Android extracts the binary executable, and verify `LocalSocket.getPeerCredentials().getUid() == Process.myUid()` on abstract `LocalServerSocket` IPC.
