---
name: macos-app-development
description: Use when creating, changing, building, testing, or packaging a native macOS app (SwiftUI, AppKit, menu-bar utility, or CoreAudio/hardware tool) — works with Command Line Tools alone (no Xcode.app required) or full Xcode, avoids the CLT XCTest trap, sets regular window activation, and packages TCC-entitled .app bundles.
---

# macOS app development

**Applies to:** native macOS desktop and utility apps (`macOS 14+`, SwiftUI / AppKit / CoreAudio).
Unlike iOS and watchOS (which require full `Xcode.app` + simulator runtimes), macOS ships
`MacOSX.sdk` inside **Command Line Tools** (`/Library/Developer/CommandLineTools`), so a complete
SwiftUI `.app` bundle can be compiled, unit-tested, packaged, and ad-hoc signed with `swift build`
alone.

## 0. Preflight: Command Line Tools vs. full Xcode

Check what the host actually has before choosing the build path:

```bash
xcode-select -p
swift --version
xcrun --sdk macosx --show-sdk-path
```

| Host toolchain | Build & package path | Test runner |
| --- | --- | --- |
| **Command Line Tools only** (`.../CommandLineTools`) | SwiftPM (`Package.swift`) + deterministic `.app` bundler script (`swift build -c release`) | Executable self-test target (`swift run CoreTests`) — **never** `swift test` (`XCTest` is absent) |
| **Full `Xcode.app`** (`.../Xcode.app/Contents/Developer`) | Either SwiftPM `.app` bundler (preferred for utilities/studios) or XcodeGen + `xcodebuild` when App Store archiving, `.xcassets`, or XCUITest is needed | `swift run CoreTests` + `xcodebuild test` |

Never stop and claim a native macOS app cannot be built just because `Xcode.app` is not installed.

## 1. Package layout that builds and tests without Xcode

Split pure logic/hardware framing from SwiftUI views so automated tests run everywhere:

```text
macos/
├── Package.swift                  # StudioCore (library), MyMacApp (executable), CoreTests (executable)
├── Resources/
│   ├── Info.plist                 # CFBundleIdentifier, LSMinimumSystemVersion, TCC usage keys
│   └── entitlements.plist         # e.g. com.apple.security.device.audio-input
├── Sources/
│   ├── MyCore/                    # Domain, protocol, DSP/IO — zero SwiftUI views
│   ├── MyMacApp/                  # @main App + AppDelegate + SwiftUI views
│   └── CoreTests/main.swift       # Deterministic assertions; exits 0 on pass, 1 on failure
└── scripts/
    └── build_app.sh               # Builds release binary -> dist/MyMacApp.app + codesign
```

### Avoid the CLT `XCTest` trap

On Command Line Tools–only Macs, `import XCTest` fails with `error: no such module 'XCTest'`
because CLT omits `XCTest.framework`. Keep an executable `CoreTests` target in `Package.swift`
that imports `MyCore`, runs deterministic checks, prints an `OK` summary, and exits `0` (wire
`swift run --package-path macos CoreTests` into `pytest` or CI so one test command runs all
suites).

## 2. Three mandatory runtime & concurrency rules

1. **Foreground window & Spacebar/menu focus (`NSApplication` activation policy):**
   A SwiftPM binary or hand-assembled `.app` launched from a terminal will not own a menu bar,
   appear in Cmd-Tab, or receive Spacebar/keyboard shortcuts unless `NSApplicationDelegate`
   promotes it on launch:

   ```swift
   final class AppDelegate: NSObject, NSApplicationDelegate {
       func applicationDidFinishLaunching(_ notification: Notification) {
           NSApplication.shared.setActivationPolicy(.regular)
           NSApplication.shared.activate(ignoringOtherApps: true)
       }
   }
   ```

   For menu-bar-only utilities without a Dock icon, use `.accessory` deliberately instead.
2. **Swift strict concurrency in real-time / IO callbacks:**
   Never read or mutate `@MainActor` properties (such as UI throttle timestamps or `@Published`
   fields) directly inside a `@Sendable` audio, network, or `DispatchQueue` closure. Keep
   rate-limiting state in a queue-confined box and hop to `@MainActor` (`Task { @MainActor in ... }`)
   only for throttled UI snapshots (`~15–20 Hz`).
3. **Protect keyboard shortcuts from text fields:**
   When binding single-key transport shortcuts (such as `.keyboardShortcut(.space, modifiers: [])`),
   track `@FocusState private var textInputFocused: Bool` across every `TextField` and ignore the
   shortcut while `textInputFocused == true` so typing spaces in inputs still works.

## 3. Deterministic `.app` bundle & TCC signing (`build_app.sh`)

Raw Mach-O binaries in `.build/release/` lack an `Info.plist`, so macOS TCC silently denies or
crashes hardware permission prompts (Microphone, Camera, Bluetooth, Screen Recording). Always
assemble and ad-hoc sign a real `.app` bundle into gitignored `dist/`:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="MyMacApp"
EXEC_NAME="MyMacApp"
OUT_APP="${REPO_ROOT}/dist/${APP_NAME}.app"

cd "${MACOS_DIR}"
swift build -c release --product "${EXEC_NAME}"
BIN_PATH="$(swift build -c release --show-bin-path)/${EXEC_NAME}"

rm -rf "${OUT_APP}"
mkdir -p "${OUT_APP}/Contents/MacOS" "${OUT_APP}/Contents/Resources"
cp "${BIN_PATH}" "${OUT_APP}/Contents/MacOS/${EXEC_NAME}"
chmod 755 "${OUT_APP}/Contents/MacOS/${EXEC_NAME}"
cp "${MACOS_DIR}/Resources/Info.plist" "${OUT_APP}/Contents/Info.plist"
printf 'APPL????' > "${OUT_APP}/Contents/PkgInfo"

codesign --force --deep --sign - \
  --entitlements "${MACOS_DIR}/Resources/entitlements.plist" \
  "${OUT_APP}"
```

Checklist for `build_app.sh` and git hygiene:

- **Always brace `${VAR}` in bash:** never write `$OUT_APP…` with a trailing Unicode ellipsis
  (`…`), which bash parses as part of the identifier (`unbound variable`). Use `${OUT_APP}...`.
- **Gitignore build outputs:** add `macos/.build/`, `macos/.swiftpm/`, and `dist/` to `.gitignore`
  before staging. Never commit compiled Mach-O binaries or `.app` bundles.
- **Verify the signature & entitlements:** `codesign -dv --entitlements :- dist/MyMacApp.app`.

## 4. Pro-audio & hardware capture on macOS

When building audio capture, DSP, or voice-evaluation tools on macOS where browser `getUserMedia`
is insufficient (sample-rate locking above `48 kHz`, >2 discrete array channels, Hog Mode, or
bypassing WebRTC / Control Center Mic Modes), read
[`references/coreaudio-hal.md`](references/coreaudio-hal.md).
