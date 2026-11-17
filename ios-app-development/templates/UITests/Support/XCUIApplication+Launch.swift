import XCTest

extension XCUIApplication {
    /// A deterministic app: in-memory store, fixed locale, optional seed data.
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
