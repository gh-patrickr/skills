# Troubleshooting

Match the **first** error, not the last. `xcodebuild` prints a cascade; only the first line
identifies the cause. Run with `scripts/build.sh` or `scripts/test.sh` so the raw log is in
`artifacts/<run>/raw/`.

## Machine / toolchain

| Symptom | Cause | Fix |
| --- | --- | --- |
| `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory ... CommandLineTools` | Only Command Line Tools installed | Install Xcode (App Store or `xcodes install 26.0`), then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Until then only the `Core` layer can run. |
| `xcodebuild: error: tool 'xcodebuild' requires Xcode` after installing | Wrong `xcode-select` path | `sudo xcode-select -s /Applications/Xcode.app`, `sudo xcodebuild -license accept`, `sudo xcodebuild -runFirstLaunch`. |
| `xcodebuild: error: Failed to build ... The operation couldn't be completed` on first run only | First-launch components missing | `sudo xcodebuild -runFirstLaunch` (needs root; cannot be automated). |
| `Unable to find a destination matching` | Platform runtime not installed | `xcodebuild -downloadPlatform iOS` (or `-downloadPlatform watchOS`), then re-run `destinations.sh`. |
| `sandbox-exec: sandbox_apply: Operation not permitted` from `swift test` | Already inside a sandbox (agent/CI) | Add `--disable-sandbox`; `swift_test.sh` already does. |
| `error: failed to build module 'Swift'; this SDK is not supported by the compiler` | Mismatched CLT vs macOS SDK after an OS update | `sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install`; or install Xcode. |
| `You don't have permission to save ... org.swift.swiftpm` | Sandboxed home | `swift_test.sh` points `--cache-path`/`--scratch-path` and module caches into the project. |

## SwiftPM test layer (no Xcode)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `no such module 'Testing'` | Command Line Tools only; `Testing.framework` not on the search path | `swift_test.sh` passes `-F <CLT>/Library/Developer/Frameworks`. With full Xcode this never happens. |
| `dlopen ... Library not loaded: @rpath/lib_TestingInterop.dylib` | CLT ships the dylib outside the default rpath | `swift_test.sh` adds `-rpath <CLT>/Library/Developer/usr/lib`. |
| `Invalid manifest` with a long `swiftc` invocation | Manifest compile failed for an unrelated reason (cache/sandbox) | Re-run with `--disable-sandbox` and project-local caches; read the *first* line of the dump. |
| `package ... is using Swift tools version X but the installed version is Y` | Toolchain older than the manifest | Raise nothing: lower `swift-tools-version` only if the API allows, otherwise upgrade Xcode. |

## Generation / project

| Symptom | Cause | Fix |
| --- | --- | --- |
| `does not contain a scheme named "MyApp"` | Project not regenerated, or target not in scheme | `gen.sh`; add the target to `scheme.testTargets` / `scheme.build.targets`. |
| Target builds but new files are ignored | File outside `sources` directory | Move it under `App/` (or add the path to `sources`). |
| `Multiple commands produce ... Info.plist` | `Info.plist` inside the app's `sources` tree | Move it to `Config/`, set `info.path` there. |
| `no such module 'Core'` | Package not linked to the target | `dependencies: [{ package: Core, product: Core }]`, regenerate. |
| `xcodegen: error: Validation failed ... path does not exist` | `sources` entry typo / empty dir | Fix the path; empty directories are not committed by git — add a file. |
| Generated project opens but tests are greyed out | Test target not in the scheme | `scheme.testTargets` in `project.yml`. |

## Build

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Signing for "MyApp" requires a development team` | Signing leaked into a simulator build | Scripts pass `CODE_SIGNING_ALLOWED=NO`; if you ran `xcodebuild` by hand, add the flags. |
| `Macro "X" must be enabled before it can be used` | Macro trust prompt in a non-interactive run | `-skipMacroValidation` (already in scripts). |
| `Dependencies could not be resolved` / `Could not resolve package dependencies` | Lockfile drift or no network | Commit `Package.resolved`; let the first run resolve, then use `-onlyUsePackageVersionsFromResolvedFile`. |
| `Building for 'iOS', but linking in object file built for 'iOS-simulator'` | Stale DerivedData from another SDK | `rm -rf DerivedData .build` **once**, then rebuild; if it returns, check `ONLY_ACTIVE_ARCH` and package binary artifacts. |
| `error: unable to attach DB: ... build.db` | Two builds sharing DerivedData | One build at a time; scripts use a per-run derived data path when `--isolated` is passed. |
| Warnings break the build only in CI | `--strict` sets `SWIFT_TREAT_WARNINGS_AS_ERRORS=YES` | Fix the warning; do not remove `--strict`. |

## Tests

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Test runner exited with code 1` with zero failed tests | UI test target not linked to the app | `dependencies: [{ target: MyApp }]` in the UI test target; regenerate. |
| App launches then test fails on first query | App crashed at launch | Read `raw/ui.log` for the crash; UI tests need the in-memory store and `-ui-testing`. |
| `Failed to get matching snapshot: No matches found for ...` | Identifier missing or element not hittable | Add `.accessibilityIdentifier`, wait for the container, not the element. |
| Test passes locally, fails in CI | Locale/timezone/keyboard | Harness sets `-AppleLanguages (en) -AppleLocale en_US`; hardware keyboard disabled via `simctl`. |
| `Timed out waiting for simulator to boot` | Stuck CoreSimulator service | `xcrun simctl shutdown all`, `killall -9 Simulator com.apple.CoreSimulator.CoreSimulatorService`, retry. |
| `Unable to boot device in current state: Booted` | Harmless race | Ignore (`sim.sh` treats it as success). |
| `xcodebuild: error: result bundle at path ... already exists` | Reused path | Each run uses a timestamped path; never pass a fixed one. |
| Second permission test behaves differently | TCC state persisted | `sim.sh privacy --reset <bundle-id>` before the suite. |
| Whole suite is slow | `-parallel-testing-enabled NO` on unit tests | Unit tests run in parallel by default; only UI is serial. |

## Watch-specific

See `apple-watch-app-development` → `references/troubleshooting-watch.md`.

## When you are stuck

1. Re-run the single failing step with `--verbose`; read the first error.
2. Reproduce with the smallest command: `xcodebuild build -scheme X -destination 'platform=iOS Simulator,id=UDID'` and nothing else.
3. Compare `xcodebuild -showBuildSettings` against a project that builds.
4. If the cause is environmental (no Xcode, no runtime, no signing identity), stop and report
   the exact missing piece with the command that installs it. Do not invent a workaround.
