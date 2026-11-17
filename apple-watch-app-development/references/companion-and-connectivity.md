# Companion apps and WatchConnectivity

## Converting an independent watch app into a companion

1. Add the iOS app target to the same `project.yml`.
2. Point the watch app at it:

```yaml
  MyApp:                      # iOS
    type: application
    platform: iOS
    sources: [App]
    dependencies:
      - target: MyWatchApp
        embed: true

  MyWatchApp:                 # watchOS
    type: application
    platform: watchOS
    sources: [Sources]
    info:
      path: Config/Info.plist
      properties:
        WKApplication: true
        WKCompanionAppBundleIdentifier: com.example.myapp
        # remove WKWatchOnly: a companion app is not watch-only
```

3. Regenerate and **verify the embedding**, because this is the step that silently produces an
   app that installs but never appears in the Watch app:

```bash
bash scripts/gen.sh
bash scripts/build.sh --scheme MyApp
find DerivedData/Build/Products/Debug-iphonesimulator/MyApp.app -name '*.app' | grep '/Watch/'
```

Expected: `.../MyApp.app/Watch/MyWatchApp.app`. If the watch app appears under `Frameworks/`
or nowhere, the dependency was not embedded as watch content — fix the dependency before
continuing.

4. The iOS app needs a Watch app entry in the Watch app on iPhone automatically; nothing else
   to configure. The watch app's bundle id must be prefixed by the iPhone app's bundle id
   (`com.example.myapp.watchkitapp` or any suffix) and must be unique.

## WatchConnectivity in one page

The API is callback-based, unreliable by design, and awkward to test. Put everything that can
be pure into `Core`.

```swift
// Core — pure, testable
public enum WatchMessage: Codable, Sendable, Equatable {
    case hydration(consumedML: Int, targetML: Int)
    case requestState
}
```

Wrap the session behind a protocol so the app can run with a fake:

```swift
public protocol PhoneLink: Sendable {
    func send(_ message: WatchMessage) async throws
    func messages() -> AsyncStream<WatchMessage>
}
```

Transport rules:

| Need | API | Delivery |
| --- | --- | --- |
| Live request/response while both apps run | `sendMessage(_:replyHandler:)` | immediate, fails when unreachable |
| Latest state (goal, settings) | `updateApplicationContext(_:)` | coalesced, latest wins |
| Queued events (a logged drink) | `transferUserInfo(_:)` | delivered eventually, in order |
| Large payload/file | `transferFile(_:metadata:)` | background |

- Always check `session.isReachable` before `sendMessage`, and fall back to
  `updateApplicationContext` / `transferUserInfo`.
- Activate the session once at launch; never in a view's `task`.
- `WCSessionDelegate` on iOS must implement `sessionDidBecomeInactive` and `sessionDidDeactivate`
  or pairing changes break the session.
- Never send secrets; the payload is not encrypted beyond the platform's transport.

## Testing connectivity

| What | How |
| --- | --- |
| Payload encoding/decoding | `Core` unit test with `JSONEncoder`/`JSONDecoder` round-trip |
| Message → state reduction | `Core` unit test on a pure reducer |
| Delivery, pairing, reachability | paired simulators, manual, flaky — not part of the gate |
| Session wrapper | fake `PhoneLink` injected into the view model |

Do not put paired-simulator tests in CI. They are slow, depend on simulator pairing state and
fail for reasons unrelated to the change.

## App Groups and shared storage

- The watch app and the phone app do **not** share a container. App Groups work within a
  platform, not across devices.
- Sync explicitly: write locally, send a `WatchMessage`, apply on the other side.
- The widget extension has its own container too; use an App Group between app and widgets on
  the same device.

## Info.plist keys that matter

| Key | Independent | Companion |
| --- | --- | --- |
| `WKApplication` | `true` | `true` |
| `WKWatchOnly` | `true` | absent |
| `WKCompanionAppBundleIdentifier` | absent | iOS bundle id |
| `WKBackgroundModes` | only if you need `workout-processing` | same |

A watch app with `WKWatchOnly: true` won't install as a companion; one with
`WKCompanionAppBundleIdentifier` but no matching iOS app won't install at all. Both failures
look like "app not installed" in the simulator.
