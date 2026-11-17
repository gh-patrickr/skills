import Core
import XCTest
@testable import MyWatchApp

final class WatchModelTests: XCTestCase {
    @MainActor
    func testUsesTheInjectedStore() async {
        let model = WatchModel(store: InMemoryHydrationStore(consumedML: 500))

        await model.hydration.load()

        XCTAssertEqual(model.hydration.consumedML, 500)
    }

    @MainActor
    func testDefaultsToATwoLitreGoal() {
        XCTAssertEqual(WatchModel().hydration.targetML, 2_000)
    }
}
