import XCTest

final class ItemsUITests: XCTestCase {
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
    private func launch(seed: Bool = false) -> ItemsScreen {
        let app = XCUIApplication.forTesting(seed: seed)
        self.app = app
        app.launch()
        let screen = ItemsScreen(app: app)
        XCTAssertTrue(screen.waitUntilVisible(), "items screen never became ready")
        return screen
    }

    func testEmptyStateIsVisibleOnLaunch() {
        let screen = launch()

        XCTAssertTrue(screen.emptyState.waitForExistence(timeout: 10))
    }

    func testAddingAnItemShowsItInTheList() {
        let screen = launch()

        screen.add("Milk")

        XCTAssertTrue(screen.row("Milk").waitForExistence(timeout: 10))
        XCTAssertFalse(screen.emptyState.exists)
    }

    func testDeletingAnItemRemovesIt() {
        let screen = launch()
        screen.add("Milk")
        XCTAssertTrue(screen.row("Milk").waitForExistence(timeout: 10))

        screen.delete("Milk")

        XCTAssertTrue(screen.waitForDisappearance(of: "Milk"))
    }

    func testSeededItemIsVisible() {
        let screen = launch(seed: true)

        XCTAssertTrue(screen.row("Seeded item").waitForExistence(timeout: 10))
    }

    func testBlankInputDoesNotAddRow() {
        let screen = launch()

        screen.addField.tap()
        screen.addField.typeText("   ")
        XCTAssertFalse(screen.addButton.isEnabled)

        XCTAssertFalse(screen.row("   ").exists)
    }

    func testAccessibilityAudit() throws {
        let app = XCUIApplication.forTesting(seed: true)
        self.app = app
        app.launch()
        XCTAssertTrue(ItemsScreen(app: app).waitUntilVisible())

        try app.performAccessibilityAudit()
    }
}
