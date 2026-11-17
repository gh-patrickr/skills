import Foundation

/// One logged drink. Values only — this type is shared with the phone app and widgets.
public struct HydrationEntry: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public let amountML: Int
    public let date: Date

    public init(id: UUID = UUID(), amountML: Int, date: Date) {
        self.id = id
        self.amountML = amountML
        self.date = date
    }
}
