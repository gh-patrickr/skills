import XCTest

/// Page object for the items screen. Elements in, assertions out.
final class ItemsScreen {
    private let app: XCUIApplication

    init(app: XCUIApplication) {
        self.app = app
    }

    var addField: XCUIElement { app.textFields["items.addField"] }
    var addButton: XCUIElement { app.buttons["items.addButton"] }
    var emptyState: XCUIElement { app.staticTexts["items.emptyState"] }
    var deleteButton: XCUIElement { app.buttons["Delete"] }

    func row(_ title: String) -> XCUIElement { app.buttons[title] }

    func waitUntilVisible(timeout: TimeInterval = 10) -> Bool {
        addButton.waitForExistence(timeout: timeout)
    }

    @discardableResult
    func add(_ title: String) -> Self {
        XCTAssertTrue(addField.waitForExistence(timeout: 10), "add field never appeared")
        addField.tap()
        addField.typeText(title)
        addButton.tap()
        return self
    }

    @discardableResult
    func delete(_ title: String) -> Self {
        let element = row(title)
        XCTAssertTrue(element.waitForExistence(timeout: 10), "row \(title) never appeared")
        element.swipeLeft()
        if deleteButton.waitForExistence(timeout: 5) {
            deleteButton.tap()
        }
        return self
    }

    func waitForDisappearance(of title: String, timeout: TimeInterval = 10) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: row(title)
        )
        return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
    }
}
