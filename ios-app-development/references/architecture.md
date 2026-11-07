# Architecture defaults

These defaults exist so generated code is testable, concurrency-safe under Swift 6, and
readable without a meeting. Deviate only with a written reason in `docs/assumptions.md`.

## Layers

```
App/        SwiftUI views, app entry point, navigation, launch configuration   (@MainActor)
Core/       domain models, view models, service protocols, pure logic          (UI-free)
Adapters/   URLSession / SwiftData / UserDefaults implementations of protocols (in App/)
```

Hard rules:

- `Core` imports only `Foundation` and `Observation`. No SwiftUI, no UIKit, no SwiftData.
  This is what makes the host test layer possible.
- Views do not own business logic. A view renders state and forwards intents to a view model.
- Every dependency is passed through an initializer. No `.shared`, no global mutable state.
- Only the app entry point and view models are `@MainActor`. Services are `Sendable`
  (actors or immutable structs).

## View models

```swift
@MainActor
@Observable
public final class ItemsViewModel {
    public private(set) var items: [Item] = []
    public private(set) var errorMessage: String?
    private let store: any ItemStoring
    private let now: @Sendable () -> Date

    public init(store: any ItemStoring, now: @escaping @Sendable () -> Date = { .now }) {
        self.store = store
        self.now = now
    }
}
```

- State is `private(set)`; mutation happens in intent methods (`load`, `add`, `toggle`).
- Intents are `async` when they touch a service, `throws` only if the view can act on the
  error; otherwise the view model stores a user-facing `errorMessage`.
- Time, randomness and identifiers are injected. Otherwise the tests are a coin flip.

## Concurrency (Swift 6, strict)

- `SWIFT_VERSION = 6.0`, `SWIFT_STRICT_CONCURRENCY = complete`. New code must build with
  zero concurrency warnings; the `--strict` verify run turns warnings into errors.
- Prefer `actor` for mutable shared state, `Sendable struct` for values.
- Never `Task.detached` to "escape" isolation — it is the usual source of data races.
  If work is expensive, make the service an actor and `await` it.
- Use `Task { }` from a view intent; SwiftUI cancels `.task` automatically. Do not store
  unmanaged tasks in view models.
- `@MainActor` view models may call `await` on actors; keep the main actor free of I/O.

## State and navigation

- One `@Observable` app model owned by the `App` struct with `@State`; pass it down.
- `NavigationStack` with a typed `enum Route: Hashable` path. Deep links map to routes, not
  to view instances.
- Sheets/alerts are driven by optional `Identifiable` state, never booleans plus a separate
  payload (that is how stale-payload bugs happen).

## Errors

- Domain errors are a small `enum` conforming to `LocalizedError`.
- Never `try!`, never force unwrap outside tests, never `fatalError` on user data.
- Map transport errors to domain errors in the adapter; views only see domain errors.

## Persistence

- Start with the protocol (`ItemStoring`) and an in-memory implementation for tests.
- When persistence is required, prefer SwiftData or a file-based store behind the protocol;
  the view model must not change.
- UI tests always run against the in-memory store, selected by the launch environment.

## Networking

- One `HTTPClient` protocol + `URLSession` implementation; JSON decoding with
  `JSONDecoder` and explicit `CodingKeys`.
- In tests, a `URLProtocol` stub or a fake client — never a real network call.
- No ATS exceptions. No secrets in source; read them from the environment/Keychain.

## Accessibility (non-negotiable)

- Every control gets `.accessibilityIdentifier("screen.element.role")`; identifiers are
  stable, lowercase, dot-separated, and never contain user data.
- Every image-only button gets `.accessibilityLabel(...)`.
- Dynamic Type: no fixed font sizes; test at `.accessibility3` at least once.
- Colour is never the only signal (use icon + text), which also makes the audit pass.

## Localization

- All user-facing strings in a String Catalog (`Localizable.xcstrings`), including the
  development language. Hard-coded literals in views are a bug once a second language is
  even considered.
- Test with `-AppleLanguages (ar)` once to catch layout that breaks in RTL.

## File layout

```
App/
  App.swift
  RootView.swift
  Features/
    Items/
      ItemsListView.swift
      ItemRowView.swift
  Support/
    AppEnvironment.swift       // composition root
    LaunchArguments.swift      // -ui-testing switch
  Resources/
Core/
  Package.swift
  Sources/Core/
    Item.swift
    ItemStore.swift
    ItemsViewModel.swift
  Tests/CoreTests/
AppTests/
UITests/
Config/
```

One feature = one folder. A file that needs the word "Manager" or "Helper" is usually two
types that have not been separated yet.
