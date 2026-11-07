# Complications (WidgetKit)

A complication is a WidgetKit extension, separate from the app target. Since watchOS 9/10,
ClockKit complications are deprecated; use WidgetKit.

## Target layout

```yaml
  MyWatchWidgets:
    type: app-extension
    platform: watchOS
    sources: [Widgets]
    dependencies:
      - package: Core
        product: Core
    info:
      path: Config/Widgets.plist
      properties:
        NSExtension:
          NSExtensionPointIdentifier: com.apple.widgetkit-extension
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.example.mywatchapp.widgets
```

and in the watch app target:

```yaml
    dependencies:
      - target: MyWatchWidgets
        embed: true
```

## Families

| Family | Use for |
| --- | --- |
| `.accessoryCircular` | one number or ring — the default for a metric |
| `.accessoryRectangular` | a value plus a short label/trend |
| `.accessoryInline` | a single line of text beside the time |
| `.accessoryCorner` | a curved label + gauge (watchOS only) |

Provide at least circular and rectangular; the face decides which one is shown.

## Keep the logic in `Core`

```swift
// Core
public struct HydrationEntry: TimelineEntry, Sendable {
    public let date: Date
    public let consumedML: Int
    public let targetML: Int
}

public struct HydrationTimeline {
    public func entries(now: Date, consumedML: Int, targetML: Int, calendar: Calendar) -> [HydrationEntry] {
        // one entry now + one at the next hour boundary, at most
    }
}
```

The widget target only maps that to views. This is what makes the complication testable in
`swift test` without a simulator.

## Provider contract

- `getTimeline(in:completion:)` returns entries covering the next few hours, not one per minute.
- Ask for a reload with `WidgetCenter.shared.reloadTimelines(ofKind:)` after the app writes data.
- Never fetch the network inside the provider when a cached value exists; the complication must
  render instantly.
- Set `TimelineEntryRelevance` when the value has a time-dependent importance (e.g. near goal).

## Testing

| What | Where |
| --- | --- |
| entry generation for a fixed clock | `Core` unit tests (`swift_test.sh`) |
| relevance ordering | `Core` unit tests |
| rendering | `#Preview(as: .accessoryCircular)` in Xcode |
| end-to-end appearance | watch simulator, add the complication to a face by hand (not scriptable) |

The last row is the only manual step in the whole pipeline. Plan for it once, not per change.

## Common mistakes

- Putting the widget extension in the iOS app instead of the watch app.
- Forgetting `embed: true`, so the complication works in Xcode previews and never on a face.
- A provider that returns a single entry with no reload policy, so the value freezes.
- Doing a `URLSession` call in `getTimeline` — timeouts produce an empty complication.
- Reading `UserDefaults.standard` — the widget process has its own container. Use an App Group
  and a shared store.
