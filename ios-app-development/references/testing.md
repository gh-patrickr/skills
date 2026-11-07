# Testing

The suite has one job: fail before a human notices. Optimise for the fastest layer that can
catch the bug, and never duplicate the same assertion in three layers.

## The pyramid, concretely

| Layer | Runs on | Command | Budget |
| --- | --- | --- | --- |
| Core unit | host (no Xcode needed) | `scripts/swift_test.sh` | < 5 s, hundreds of tests |
| App unit | simulator | `scripts/test.sh --only unit` | < 60 s |
| UI | simulator | `scripts/test.sh --only ui` | < 5 min, journeys only |
| Snapshot | simulator | `-only-testing:SnapshotTests` | design-system views only |

If a behaviour can be asserted in `Core`, it must not be asserted in a UI test.

## swift-testing in `Core`

```swift
import Testing
@testable import Core

@MainActor
@Suite("ItemsViewModel")
struct ItemsViewModelTests {
    @Test("starts empty") func startsEmpty() async {
        let vm = ItemsViewModel(store: InMemoryItemStore())
        await vm.load()
        #expect(vm.items.isEmpty)
    }

    @Test("trims the title and persists", arguments: ["  Milk  ", "Milk"])
    func add(title: String) async throws {
        let store = InMemoryItemStore()
        let vm = ItemsViewModel(store: store)
        await vm.add(title: title)
        #expect(vm.items.map(\.title) == ["Milk"])
        #expect(try await store.load().map(\.title) == ["Milk"])
    }

    @Test("blank titles are rejected", arguments: ["", "   ", "\n\t"])
    func rejectsBlank(title: String) async {
        let vm = ItemsViewModel(store: InMemoryItemStore())
        await vm.add(title: title)
        #expect(vm.items.isEmpty)
    }
}
```

- Use `@Suite` per type, `@Test("plain sentence")` per behaviour, `arguments:` for tables.
- `#expect` for values, `#require` (`try #require`) when a nil would crash later.
- `@MainActor` on any suite touching a main-actor view model.
- Do not test private methods; if it needs a test, it is a type.

## Fakes

```swift
struct InMemoryItemStore: ItemStoring {
    private let storage = Storage()
    func load() async throws -> [Item] { await storage.items }
    func save(_ items: [Item]) async throws { await storage.set(items) }
}

struct FailingItemStore: ItemStoring {
    struct Boom: Error {}
    func load() async throws -> [Item] { throw Boom() }
    func save(_ items: [Item]) async throws { throw Boom() }
}
```

- One happy path fake, one failing fake per protocol. That is enough.
- Never mock with a recording framework; assert on outputs, not on call counts.
- A fake must be `Sendable` (actor or immutable) under Swift 6.

## Determinism checklist

- [ ] No `Date()` / `UUID()` / `Int.random` in tested code paths — injected instead.
- [ ] No network, no disk outside a temp directory, no `UserDefaults.standard` in tests.
- [ ] `TZ=UTC`, `LANG=en_US.UTF-8` when a script runs tests.
- [ ] Test order does not matter: no shared mutable statics.
- [ ] Every async test has a timeout through the runner (`-test-timeouts-enabled YES`).

## App-hosted XCTest

Use XCTest (not swift-testing) when the code needs a running app: SwiftData containers,
`Bundle` resolution, `URLProtocol` interception of a real `URLSession`, Keychain.

```swift
final class AppEnvironmentTests: XCTestCase {
    func testUITestingUsesInMemoryStore() {
        let env = AppEnvironment(arguments: ["-ui-testing"])
        XCTAssertTrue(env.isUITesting)
    }
}
```

## Coverage

- Gate lives in `verify.sh --coverage-min 0.75` (app target) and
  `swift_test.sh --coverage-min 0.90` (Core).
- Coverage is a floor, not a goal. A new file below the floor needs tests, not an exclusion.
- Exclusions must be listed in `Config/coverage-exclusions.txt` with a reason per line.
- Quote the number from `summary.md`, never from memory.

## Snapshot tests (optional)

Only for small, pure views (rows, badges). Record on the same simulator runtime as CI; pin
the `precision`; never snapshot a full screen with system chrome. If a snapshot test fails
more than once for a non-visual reason, delete it — flaky snapshots train people to ignore red.

```swift
import SnapshotTesting
func testRow() {
    assertSnapshot(of: ItemRowView(item: .fixture), as: .image(layout: .fixed(width: 360, height: 60)))
}
```

## What "a lot of tests" means here

- Every public function of `Core` has at least one `@Test`, edge cases included (empty,
  whitespace, duplicate, failure path).
- Every view model intent has success + failure coverage.
- Every screen has a UI test that reaches it and asserts its primary element exists.
- Every error message shown to a user is asserted somewhere.
- No test asserts `XCTAssertTrue(true)` or merely exercises a line to raise coverage.
