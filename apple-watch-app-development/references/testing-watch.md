# Testing watch apps

## Where each test belongs

| Behaviour | Layer | Cost |
| --- | --- | --- |
| Clamping, progress, formatting | `Core` (host) | milliseconds |
| Crown binding arithmetic | `Core` + a thin view | milliseconds |
| Complication entries | `Core` | milliseconds |
| Connectivity payloads | `Core` | milliseconds |
| Goal ring appears with the right value | watch UI test | seconds, flaky |
| Add action updates the value | watch UI test | seconds |
| Accessibility audit | watch UI test | seconds |

The rule: if it can be asserted without rendering, assert it in `Core`. Watch UI tests are the
most expensive tests in the Apple ecosystem — every one must justify itself.

## Core tests (no simulator)

`swift_test.sh` runs `Core/Tests/CoreTests` on the host, including watch-only view models,
because the package declares `.watchOS(.v11)` but the tests run on macOS. Keep view models
free of WatchKit imports (guard haptics with `#if canImport(WatchKit)`).

## Watch UI tests

They work, with limits:

- The test runner launches on the watch simulator; the first launch after boot is slow. Use a
  10–15 s timeout for the first `waitForExistence`.
- **The Digital Crown cannot be rotated from XCUITest.** Provide a button (or a crown-driven
  value with a visible fallback) for anything you need to assert.
- System UI (the watch face, notification banners, permission sheets) is not queryable. Reset
  permissions before the suite: `sim.sh privacy --bundle-id <id> --reset`.
- Element sizes are tiny; `.tap()` targets the centre. Prefer identifiers over coordinates.
- Screenshots are small but useful in failure reports.

Minimal suite for a new watch app:

```swift
func testPrimaryValueIsVisibleOnLaunch()
func testAddingCommitsTheValue()
func testStartsAtZero()
```

Three tests. Add a fourth only for a distinct user journey, never for another assertion on the
same screen.

`performAccessibilityAudit()` is available through XCUITest on iOS and macOS; do not assume it
compiles for watchOS. If your Xcode supports it there, add it — otherwise verify labels and hit
targets by hand and record that in the summary.

## Simulator behaviour

- The watch simulator is paired with an iPhone simulator automatically in recent Xcode. If the
  watch app refuses to install, erase both and let Xcode re-pair.
- `destinations.sh --platform watchos` picks the newest runtime and an `Apple Watch` device by
  UDID; never hard-code "Apple Watch Series 11 (46mm)".
- The watch simulator boots slowly (20–60 s). Boot once per run, not per test class.
- `simctl status_bar` works on watch simulators too; use it for deterministic screenshots.

## What not to automate

| Thing | Why |
| --- | --- |
| Adding a complication to a watch face | not scriptable; manual, once |
| Paired iPhone ↔ watch connectivity | pairing state is external and flaky |
| Always-On dimmed appearance | no reliable hook; verify in Simulator and on device |
| Battery/thermal behaviour | device only |

State these as manual checks in the summary instead of pretending they are covered.

## Coverage expectations

- `Core` ≥ 90 % (enforced by `swift_test.sh --coverage-min`).
- Watch app target ≥ 60 % — most logic lives in `Core`, so the view layer is thin on purpose.
- UI tests are not counted as coverage; do not chase the number with UI tests.
