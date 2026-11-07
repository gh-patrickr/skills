---
name: apple-watch-app-development
description: Use when creating, changing, building, testing, or shipping a watchOS app — "make an Apple Watch app", add a complication, Digital Crown interaction, haptics, WatchConnectivity, or fix a watch build/simulator failure. Covers independent vs companion apps, watchOS XcodeGen targets and Info.plist keys, watch simulator selection, watch UI tests, and the shared core-test layer that runs without Xcode.
---

# Apple Watch app development

**Applies to:** watchOS apps built with SwiftUI (watchOS 11+). The build/test engine is the
same one shipped in `ios-app-development`; this skill adds the watchOS decisions that make
the difference between an app that runs and one that passes review.

## The contract

Identical to the iOS skill: `scripts/verify.sh --platform watchos` exits `0`,
`artifacts/<run>/summary.md` reports counts and coverage, and you quote it. Never open Xcode,
never hand-edit the project, never guess a simulator name.

## 0. Independent or companion? Decide first

| | Independent watch app (default) | Companion to an iPhone app |
| --- | --- | --- |
| Target count | one watchOS app | iOS app + watch app, watch embedded in the iOS bundle |
| Info.plist | `WKApplication` = YES, `WKWatchOnly` = YES | `WKApplication` = YES, `WKCompanionAppBundleIdentifier` = iOS bundle id |
| Display name | shown in the watch app grid | shown in the Watch app on iPhone |
| Testing | watch simulator only | both simulators |
| Complexity | low | embedding phase, shared container, connectivity |

Start independent. Convert only when the product genuinely needs the phone (HealthKit,
background location, large data entry). The conversion is a project.yml change plus an
Info.plist key — see `references/companion-and-connectivity.md`.

## 1. Preflight

```bash
bash "$SCRIPTS/preflight.sh" --platform watchos
```

The watchOS simulator runtime is a separate download from iOS:
`xcodebuild -downloadPlatform watchOS`. Without it, generation and typechecking still work,
but nothing runs.

## 2. Generate, build, test

```bash
bash "$SCRIPTS/gen.sh"
bash "$SCRIPTS/build.sh" --platform watchos --scheme MyWatchApp
bash "$SCRIPTS/test.sh"  --platform watchos --scheme MyWatchApp --only unit
bash "$SCRIPTS/test.sh"  --platform watchos --scheme MyWatchApp --only ui
bash "$SCRIPTS/verify.sh" --platform watchos
```

Also valid without Xcode: `swift_test.sh` (Core package), `typecheck.sh` (proxy).

## 3. What makes a watch app different

- **Two-second rule.** The primary value must be readable in one glance, without scrolling.
  If it needs a paragraph, it belongs on the phone.
- **No free-text entry.** Use the Digital Crown, steppers, lists or dictation. A keyboard on a
  45 mm screen is a bug.
- **Digital Crown is the main control** for numeric input:
  `.digitalCrownRotation($amount, from: 50, through: 500, by: 50, sensitivity: .low,
  isContinuous: false, isHapticFeedbackEnabled: true)`.
- **Haptics carry feedback** (`WKInterfaceDevice.current().play(.success)`), because the wrist
  is often looked at for under a second.
- **Always-On** dims the display: never rely on animation or colour alone; keep the key value
  visible in the reduced-luminance state (`.privacySensitive()`, `isLuminanceReduced`).
- **Battery:** no timers while inactive, no continuous location, no polling connectivity.
  A complication reload is not a refresh loop.
- **Small screen:** no `NavigationStack` depth beyond two levels; use pages or a list.

Details and layout patterns: `references/watchos-ui.md`.

## 4. Testing strategy

| Layer | Where | Runs when |
| --- | --- | --- |
| Domain + view model | `Core/` (shared with the phone app) | always, on the host |
| Watch view logic (crown binding, formatting) | `Core/` or plain structs | always |
| Complication timeline | `Core/` — pure `TimelineEntry` builder | always |
| Watch UI smoke | `UITests/` on the watch simulator | needs Xcode |
| Connectivity payloads | `Core/` — pure `Codable` + reducer | always |
| Snapshot of a watch view | optional | needs Xcode + fixed runtime |

Keep watch UI tests to 3–5 journeys: launch → primary value visible, add/commit an action,
and the accessibility audit. Everything else belongs in `Core`, where it is fast and stable.
Watch simulators are slower and more fragile than iOS ones; a 20-test UI suite will flake.

Details: `references/testing-watch.md`.

## 5. Complications

Complications are a WidgetKit extension, not a view in the app. Build the timeline entry in
`Core` (pure, testable), render it in the widget target. `references/complications.md` covers
the target setup, `TimelineProvider`, relevance and testing.

## 6. Plugins and toolchain

No Harness plugin is required: the pipeline is scripts over `xcodebuild`/`simctl`. The full
inventory (DSH bundles, MCP wrapper, Homebrew tools, Xcode/runtime downloads) lives in
`ios-app-development/references/plugins.md` and applies unchanged here — add the watchOS
runtime to the required list.

## 7. When something fails

`references/troubleshooting-watch.md` covers: no watchOS runtime, "paired iPhone required",
watch app not installing, Digital Crown not responding in the simulator, UI test runner not
launching, and complications not appearing.

## Files

| Need | File |
| --- | --- |
| layout, crown, haptics, always-on, accessibility | `references/watchos-ui.md` |
| complications, WidgetKit targets, timeline tests | `references/complications.md` |
| companion app, embedding, WatchConnectivity | `references/companion-and-connectivity.md` |
| watch testing, simulator behaviour, UI test limits | `references/testing-watch.md` |
| watch-specific errors | `references/troubleshooting-watch.md` |
| project.yml for a watch target | `templates/project.yml` |
| scripts (same engine as the iOS skill) | `scripts/*.sh`, `scripts/*.py` |
| publish this skill to `~/.dsh/skills` | `scripts/publish.sh` |

Publishing: `bash "$SCRIPTS/publish.sh" --dry-run` shows the plan; without the flag it copies
this skill to `~/.dsh/skills/<name>` with a backup under `~/.dsh/skill-backups/`.

Templates are a complete independent watch app: goal ring, Digital Crown input, haptics,
a view model with clamping, unit tests and UI smoke tests. Scaffold with
`bash "$SCRIPTS/scaffold.sh" --name MyWatchApp --bundle-id com.example.mywatchapp`; it
substitutes `MyWatchApp` / `com.example.mywatchapp` and vendors `scripts/apple/` for CI.
