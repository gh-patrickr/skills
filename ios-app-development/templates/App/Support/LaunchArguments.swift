import Foundation

/// Launch switches shared by the app and the UI-test harness.
enum LaunchArguments {
    static let uiTesting = "-ui-testing"

    static var isUITesting: Bool {
        CommandLine.arguments.contains(uiTesting)
    }

    static var seed: Bool {
        ProcessInfo.processInfo.environment["UI_TEST_SEED"] == "1"
    }
}
