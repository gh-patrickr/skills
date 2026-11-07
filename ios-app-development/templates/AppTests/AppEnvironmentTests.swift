import Core
import XCTest
@testable import MyApp

final class AppEnvironmentTests: XCTestCase {
    func testUITestingStartsWithNoItems() async throws {
        let environment = AppEnvironment(arguments: ["-ui-testing"], environment: [:])

        let items = try await environment.itemStore.load()

        XCTAssertTrue(items.isEmpty)
    }

    func testSeedAddsOneItem() async throws {
        let environment = AppEnvironment(
            arguments: ["-ui-testing"],
            environment: ["UI_TEST_SEED": "1"]
        )

        let items = try await environment.itemStore.load()

        XCTAssertEqual(items.map(\.title), ["Seeded item"])
    }

    func testDefaultEnvironmentStartsEmpty() async throws {
        let environment = AppEnvironment(arguments: [], environment: [:])

        let items = try await environment.itemStore.load()

        XCTAssertTrue(items.isEmpty)
    }
}
