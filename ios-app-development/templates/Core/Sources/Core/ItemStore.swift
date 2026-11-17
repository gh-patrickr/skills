import Foundation

/// Persistence boundary. Implementations must be `Sendable`.
public protocol ItemStoring: Sendable {
    func load() async throws -> [Item]
    func save(_ items: [Item]) async throws
}

/// Deterministic store for tests, previews and the `-ui-testing` launch mode.
public actor InMemoryItemStore: ItemStoring {
    private var items: [Item]

    public init(items: [Item] = []) {
        self.items = items
    }

    public func load() async throws -> [Item] {
        items
    }

    public func save(_ items: [Item]) async throws {
        self.items = items
    }
}

/// Always fails. Use it to test error paths.
public struct FailingItemStore: ItemStoring {
    public struct Unavailable: Error, Sendable {
        public init() {}
    }

    public init() {}

    public func load() async throws -> [Item] { throw Unavailable() }
    public func save(_ items: [Item]) async throws { throw Unavailable() }
}
