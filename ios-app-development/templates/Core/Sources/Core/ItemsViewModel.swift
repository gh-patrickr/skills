import Foundation
import Observation

/// State and intents for the items screen. No SwiftUI, no UIKit: this is the layer that is
/// tested on the host without a simulator.
@MainActor
@Observable
public final class ItemsViewModel {
    public private(set) var items: [Item] = []
    public private(set) var errorMessage: String?

    private let store: any ItemStoring
    private let makeID: @Sendable () -> UUID

    public init(
        store: any ItemStoring,
        makeID: @escaping @Sendable () -> UUID = { UUID() }
    ) {
        self.store = store
        self.makeID = makeID
    }

    public func load() async {
        do {
            items = try await store.load()
            errorMessage = nil
        } catch {
            errorMessage = "Could not load items."
        }
    }

    public func add(title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        items.append(Item(id: makeID(), title: trimmed))
        await persist()
    }

    public func toggle(_ item: Item) async {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].isDone.toggle()
        await persist()
    }

    public func delete(_ item: Item) async {
        items.removeAll { $0.id == item.id }
        await persist()
    }

    private func persist() async {
        do {
            try await store.save(items)
            errorMessage = nil
        } catch {
            errorMessage = "Could not save items."
        }
    }
}
