import Foundation
import Testing
@testable import Core

@MainActor
@Suite("ItemsViewModel")
struct ItemsViewModelTests {
    @Test("starts empty and without an error")
    func startsEmpty() async {
        let viewModel = ItemsViewModel(store: InMemoryItemStore())

        await viewModel.load()

        #expect(viewModel.items.isEmpty)
        #expect(viewModel.errorMessage == nil)
    }

    @Test("loads existing items")
    func loadsSeededItems() async {
        let viewModel = ItemsViewModel(store: InMemoryItemStore(items: [Item(title: "Milk")]))

        await viewModel.load()

        #expect(viewModel.items.map(\.title) == ["Milk"])
    }

    @Test("adds a trimmed title and persists it", arguments: ["  Milk  ", "Milk"])
    func addPersists(title: String) async throws {
        let store = InMemoryItemStore()
        let viewModel = ItemsViewModel(store: store)

        await viewModel.add(title: title)

        #expect(viewModel.items.map(\.title) == ["Milk"])
        let saved = try await store.load()
        #expect(saved.map(\.title) == ["Milk"])
    }

    @Test("rejects blank titles", arguments: ["", "   ", "\n\t"])
    func rejectsBlank(title: String) async {
        let viewModel = ItemsViewModel(store: InMemoryItemStore())

        await viewModel.add(title: title)

        #expect(viewModel.items.isEmpty)
        #expect(viewModel.errorMessage == nil)
    }

    @Test("toggles done state and persists it")
    func togglePersists() async throws {
        let item = Item(title: "Milk")
        let store = InMemoryItemStore(items: [item])
        let viewModel = ItemsViewModel(store: store)
        await viewModel.load()

        await viewModel.toggle(item)

        #expect(viewModel.items.first?.isDone == true)
        let saved = try await store.load()
        #expect(saved.first?.isDone == true)
    }

    @Test("deletes an item")
    func deleteRemoves() async {
        let item = Item(title: "Milk")
        let viewModel = ItemsViewModel(store: InMemoryItemStore(items: [item]))
        await viewModel.load()

        await viewModel.delete(item)

        #expect(viewModel.items.isEmpty)
    }

    @Test("surfaces load failures without crashing")
    func loadFailure() async {
        let viewModel = ItemsViewModel(store: FailingItemStore())

        await viewModel.load()

        #expect(viewModel.errorMessage == "Could not load items.")
        #expect(viewModel.items.isEmpty)
    }

    @Test("uses the injected identifier")
    func usesInjectedID() async throws {
        let fixed = try #require(UUID(uuidString: "00000000-0000-0000-0000-000000000001"))
        let viewModel = ItemsViewModel(store: InMemoryItemStore(), makeID: { fixed })

        await viewModel.add(title: "Milk")

        #expect(viewModel.items.first?.id == fixed)
    }
}
