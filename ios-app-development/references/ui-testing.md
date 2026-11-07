# UI testing

UI tests are expensive and flaky when written casually. These patterns keep them honest.

## Launch harness

The app must be able to start in a deterministic mode. Implement once:

```swift
// App/Support/LaunchArguments.swift
enum LaunchArguments {
    static let uiTesting = "-ui-testing"

    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains(uiTesting)
    }

    static var seed: Bool {
        ProcessInfo.processInfo.environment["UI_TEST_SEED"] == "1"
    }
}
```

```swift
// App/Support/AppEnvironment.swift
@MainActor
struct AppEnvironment {
    let itemStore: any ItemStoring

    init() {
        if LaunchArguments.isUITesting {
            itemStore = InMemoryItemStore(items: LaunchArguments.seed ? [.fixture(title: "Seeded")] : [])
        } else {
            itemStore = InMemoryItemStore()
        }
    }
}
```

```swift
// UITests/Support/XCUIApplication+Launch.swift
extension XCUIApplication {
    static func forTesting(seed: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-ui-testing",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launchEnvironment["UI_TESTING"] = "1"
        app.launchEnvironment["UI_TEST_SEED"] = seed ? "1" : "0"
        return app
    }
}
```

Rules: the harness never touches the network, never writes outside a temp dir, and never
depends on the device's language or 24-hour setting.

## Page objects ("robots")

One type per screen, identifiers inside, assertions outside.

```swift
final class ItemsScreen {
    private let app: XCUIApplication
    init(app: XCUIApplication) { self.app = app }

    var addField: XCUIElement { app.textFields["items.addField"] }
    var addButton: XCUIElement { app.buttons["items.addButton"] }
    var emptyState: XCUIElement { app.staticTexts["items.emptyState"] }

    func row(_ title: String) -> XCUIElement { app.buttons[title] }

    @discardableResult
    func add(_ title: String) -> Self {
        addField.tap()
        addField.typeText(title)
        addButton.tap()
        return self
    }

    func waitUntilVisible(timeout: TimeInterval = 10) -> Bool {
        addButton.waitForExistence(timeout: timeout)
    }
}
```

A screen object exposes elements and actions; the test asserts. When a test fails, the stack
should point at the test, not at 40 lines of `app.buttons[...]`.

## Waiting

- `waitForExistence(timeout:)` for appearance, `XCTNSPredicateExpectation` for state
  (`exists == false`, `label == "2 items"`).
- `XCTAssertEqual` on element counts only after a wait on a stable anchor.
- `sleep`, `Thread.sleep`, `usleep` are forbidden. A sleep that "fixes" a test is hiding a
  missing loading state.

```swift
let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: row("Milk"))
XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 10), .completed)
```

## Accessibility audit

```swift
@available(iOS 17.0, *)
func testHomeAccessibility() throws {
    let app = XCUIApplication.forTesting()
    app.launch()
    XCTAssertTrue(ItemsScreen(app: app).waitUntilVisible())
    try app.performAccessibilityAudit()
}
```

Run it per top-level screen. Treat every new issue as a bug: missing labels, tiny hit
targets, low contrast. Suppress a specific category only with a comment naming the reason.

## Screenshots on failure

```swift
override func tearDownWithError() throws {
    let shot = XCTAttachment(screenshot: XCUIApplication().screenshot())
    shot.name = "\(name)-failure"
    shot.lifetime = .keepAlways
    add(shot)
}
```

`verify.sh` exports attachments to `artifacts/<run>/attachments/`. Reference the file names
in the summary when a test fails.

## Simulator control (what the tests cannot do)

```bash
bash scripts/sim.sh boot --platform ios
bash scripts/sim.sh statusbar --platform ios     # 9:41, full battery, no carrier noise
bash scripts/sim.sh privacy --platform ios --reset com.example.myapp
bash scripts/sim.sh screenshot --platform ios --out shot.png
```

- Reset privacy before a suite that grants permissions; otherwise the second run behaves
  differently from the first.
- Erase the simulator when state leaks between runs, not by default (it costs minutes).
- Never hard-code a device name. `destinations.sh` resolves the newest runtime and a device
  UDID; names change with every Xcode release.

## Flake policy

1. Reproduce with `-only-testing:<Target>/<Class>/<test>` three times in a row.
2. If it fails 1-in-3, fix the wait — do not retry.
3. Retries (`-retry-tests-on-failure`) are allowed only for tests that depend on the system
   (network handover, permission dialogs), and must be declared in the test plan/command,
   never silently wrapped.
4. Quarantine by skipping with a linked issue in the code comment; never delete the assertion.

## Journeys worth automating in every app

- Launch empty → primary screen visible.
- Create an item → appears → survives relaunch (if persisted).
- Delete an item → disappears, empty state returns.
- Validation: blank input rejected with no crash.
- Every top-level screen reachable from the tab/root.
- Accessibility audit on each top-level screen.
- RTL sanity: `app.launchArguments += ["-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]`,
  assert the primary action is still hittable.
