import Foundation
import Observation

/// Daily hydration state. No WatchKit, no SwiftUI: this runs in `swift test` on the host.
@MainActor
@Observable
public final class HydrationViewModel {
    public let targetML: Int
    public private(set) var consumedML: Int = 0
    public private(set) var errorMessage: String?

    private let store: any HydrationStoring

    public init(targetML: Int = 2000, store: any HydrationStoring) {
        self.targetML = max(targetML, 1)
        self.store = store
    }

    public var progress: Double {
        min(Double(consumedML) / Double(targetML), 1)
    }

    public var remainingML: Int {
        max(targetML - consumedML, 0)
    }

    public var goalReached: Bool {
        consumedML >= targetML
    }

    public func load() async {
        do {
            consumedML = min(max(try await store.loadConsumedML(), 0), targetML)
            errorMessage = nil
        } catch {
            errorMessage = "Could not load your total."
        }
    }

    /// Adds a positive amount, clamped to the daily target.
    public func add(_ amountML: Int) async {
        guard amountML > 0 else { return }
        consumedML = min(consumedML + amountML, targetML)
        await persist()
    }

    public func reset() async {
        consumedML = 0
        await persist()
    }

    private func persist() async {
        do {
            try await store.saveConsumedML(consumedML)
            errorMessage = nil
        } catch {
            errorMessage = "Could not save your total."
        }
    }
}
