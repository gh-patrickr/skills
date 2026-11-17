import Foundation

/// A single item. Values only: no behaviour, no framework imports.
public struct Item: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var title: String
    public var isDone: Bool

    public init(id: UUID = UUID(), title: String, isDone: Bool = false) {
        self.id = id
        self.title = title
        self.isDone = isDone
    }
}
