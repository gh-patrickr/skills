# watchOS interface rules

## Screen budget

| Device | Points (≈) | Practical content |
| --- | --- | --- |
| 41 mm | 176 × 215 | one value + one action |
| 45 mm | 198 × 242 | one value + action + short caption |
| Ultra 49 mm | 205 × 251 | slightly more, same rules |

If a screen needs scrolling to reach the primary action, move the action to the bottom bar or
split the flow. Two levels of navigation is the practical maximum.

## Navigation

- `NavigationStack` for a detail behind a list; `TabView(.page)` for 2–4 peer pages.
- Never a `NavigationSplitView`. Never a modal sheet for the primary task — use a full-screen
  cover or a pushed view.
- Back buttons are small on a watch; provide a visible exit ("Done") on modal flows.

## Digital Crown

```swift
@State private var amount: Double = 250

var body: some View {
    Text("\(Int(amount)) ml")
        .focusable()
        .digitalCrownRotation(
            $amount,
            from: 50, through: 500, by: 50,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
}
```

- The bound value should be the thing the user sees change. Do not bind a hidden offset.
- `by:` sets the step; keep it aligned to a meaningful unit (50 ml, 5 min, 1 rep).
- `isHapticFeedbackEnabled: true` gives the detent feel for free. Do not add your own haptic on
  every tick; it drains the battery and feels noisy.
- Crown-only interaction must have a button fallback for accessibility and for UI tests —
  XCUITest cannot reliably rotate the crown.

## Haptics

```swift
#if canImport(WatchKit)
import WatchKit
enum Haptics {
    static func success() { WKInterfaceDevice.current().play(.success) }
    static func click() { WKInterfaceDevice.current().play(.click) }
}
#endif
```

One haptic per completed action, not per frame. Never on scroll or crown ticks.

## Always-On

- The system dims the display and may update at ~1 Hz. Time-sensitive content must be readable
  in the dimmed state.
- Read `@Environment(\.isLuminanceReduced)` and switch to a simplified, high-contrast layout.
- `.privacySensitive()` on health or personal values so they are hidden when the wrist is down.
- Do not run a `TimelineView(.animation)` in Always-On; it will be throttled and burn battery.

## Accessibility

- Every control ≥ 44 × 44 pt.
- VoiceOver labels on icon-only buttons: `.accessibilityLabel("Add 250 millilitres")`.
- Identifiers follow `feature.element.role` (`hydration.addButton`) and are stable.
- Test Dynamic Type at the largest setting once; watch layouts break quickly.
- Colour is never the only signal — pair it with text or a symbol.

## Typography and colour

- Use system text styles (`.title2`, `.headline`, `.body`) and `.containerRelativeFrame` where
  needed; never hard-code point sizes.
- Semantic colours only (`.primary`, `.secondary`, `.tint`, `Color(.fill)`), so light/dark and
  Always-On work automatically.
- One accent colour per screen. The ring/gauge should be the only strong colour.

## Performance and battery

- No `Timer` while the app is inactive. Use `TimelineView(.periodic)` only when visible.
- Network: one request on appearance, cached result in the shared store. No polling.
- HealthKit queries: anchored, limited to what the screen shows.
- Keep the extension launch path small; measure with the Xcode Instruments "App Launch" template
  once before shipping.

## Previews

`#Preview` per screen with fixture data, at both 41 mm and 45 mm. A preview that needs the
network is a design smell: inject the fake store instead.
