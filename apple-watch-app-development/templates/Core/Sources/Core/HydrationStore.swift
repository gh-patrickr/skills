import Foundation

/// Persistence boundary for the daily total.
public protocol HydrationStoring: Sendable {
    func loadConsumedML() async throws -> Int
    func saveConsumedML(_ value: Int) async throws
}

public actor InMemoryHydrationStore: HydrationStoring {
    private var consumedML: Int

    public init(consumedML: Int = 0) {
        self.consumedML = consumedML
    }

    public func loadConsumedML() async throws -> Int { consumedML }
    public func saveConsumedML(_ value: Int) async throws { consumedML = value }
}

public struct FailingHydrationStore: HydrationStoring {
    public struct Unavailable: Error, Sendable {
        public init() {}
    }

    public init() {}

    public func loadConsumedML() async throws -> Int { throw Unavailable() }
    public func saveConsumedML(_ value: Int) async throws { throw Unavailable() }
}
