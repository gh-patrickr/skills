# watchOS troubleshooting

First error line only. Logs land in `artifacts/<run>/raw/`.

## Environment

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Unable to find a destination matching ... watchOS Simulator` | watchOS runtime not installed | `xcodebuild -downloadPlatform watchOS` |
| `no available watchOS simulator` from `destinations.sh` | runtime installed but no device | `xcrun simctl create "Apple Watch Series 11 (46mm)"` (or open Xcode → Settings → Components) |
| `A paired iPhone is required` / session fails to activate | watch simulator not paired | Erase the watch and its paired iPhone simulator, then let Xcode re-pair |
| Watch simulator stuck at boot | CoreSimulator wedged | `xcrun simctl shutdown all && killall -9 com.apple.CoreSimulator.CoreSimulatorService` |
| `xcodebuild: error: SDK "watchos" cannot be located` | Wrong `xcode-select`, or the watchOS platform was never downloaded | `sudo xcode-select -s /Applications/Xcode.app` then `xcodebuild -downloadPlatform watchOS` |

## Project / build

| Symptom | Cause | Fix |
| --- | --- | --- |
| `WatchKit is not available when building for iOS` | watch target missing `platform: watchOS` | Add `platform: watchOS` + `TARGETED_DEVICE_FAMILY: "4"` |
| App builds but never appears in the Watch app / simulator | `WKWatchOnly` and `WKCompanionAppBundleIdentifier` inconsistent | Independent: `WKWatchOnly: true`, no companion key. Companion: companion key, no `WKWatchOnly`. |
| `No such module 'Core'` in the watch target | Package not linked | `dependencies: [{ package: Core, product: Core }]`, regenerate |
| `no such module 'WatchKit'` in `typecheck.sh` | Typechecking watch sources against the macOS SDK | Guard WatchKit imports with `#if canImport(WatchKit)`; the real build is the authority |
| Embedding: watch app ends up in `Frameworks/` | iOS dependency not embedded as watch content | `dependencies: [{ target: MyWatchApp, embed: true }]`; verify `MyApp.app/Watch/MyWatchApp.app` after build |
| Unit test bundle fails to run on the watch simulator | Test bundle is not hosted | Add `dependencies: [{ target: MyWatchApp }]` to the test target; if that still fails, remove the dependency to run as a logic test |

## Runtime / interaction

| Symptom | Cause | Fix |
| --- | --- | --- |
| Digital Crown does nothing in the simulator | No focus, or crown rotation not sent | Add `.focusable()`; in Simulator use Hardware → Rotate Digital Crown; UI tests cannot rotate it |
| Always-On shows a blank/garbled screen | Layout depends on animation | Read `\.isLuminanceReduced` and render a static variant |
| Haptics do nothing | Simulator does not play haptics | Expected: verify on device |
| Complication missing after install | Widget extension not embedded, or face not refreshed | `embed: true`; `WidgetCenter.shared.reloadAllTimelines()`; re-add to face |
| Complication value frozen | Provider returned a single entry with `.never` and no reload | Return future entries and call `reloadTimelines` on data change |
| Watch app installs but `launch` fails immediately | Missing `WKApplication`, or companion key pointing at an absent iOS app | Fix Info.plist keys, reinstall (`simctl uninstall` first) |

## Tests

| Symptom | Cause | Fix |
| --- | --- | --- |
| First `waitForExistence` times out only on the first run | Cold watch simulator boot | 15 s timeout on the first query; boot once per run |
| `Failed to launch test runner` | Stale test bundle on the watch | `sim.sh erase --platform watchos`, then re-run |
| UI test cannot find an element by label | watchOS shortens labels | Query by accessibility identifier, not text |
| Suite takes minutes | Too many UI tests | Move assertions into `Core`; keep 3–5 UI journeys |

## When the fix is a design change

The most common "watch bug" is a phone-shaped design on a watch: text input, deep navigation,
dense lists, polling for freshness. If the fix list above does not apply, check
`references/watchos-ui.md` before changing build settings.
