import XCTest

final class HydrationUITests: XCTestCase {
    private var app: XCUIApplication?

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        if let app {
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "\(name)-final"
            screenshot.lifetime = .deleteOnSuccess
            add(screenshot)
        }
        app = nil
    }

    @discardableResult
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        self.app = app
        app.launch()
        return app
    }

    func testAddButtonIsVisible() {
        let app = launch()

        XCTAssertTrue(app.buttons["hydration.addButton"].waitForExistence(timeout: 20))
    }

    func testStartsAtZero() {
        let app = launch()
        let label = app.staticTexts["hydration.consumedLabel"]

        XCTAssertTrue(label.waitForExistence(timeout: 20))
        XCTAssertTrue(label.label.contains("0"), "expected a zero total, got \(label.label)")
    }

    func testAddingUpdatesTheConsumedTotal() {
        let app = launch()
        let addButton = app.buttons["hydration.addButton"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 20))

        addButton.tap()

        let label = app.staticTexts["hydration.consumedLabel"]
        XCTAssertTrue(label.waitForExistence(timeout: 10))
        XCTAssertTrue(label.label.contains("250"), "expected 250 ml, got \(label.label)")
    }
}
