import Foundation
import Testing
@testable import Core

@MainActor
@Suite("HydrationViewModel")
struct HydrationViewModelTests {
    @Test("starts at zero with a visible target")
    func startsAtZero() async {
        let viewModel = HydrationViewModel(store: InMemoryHydrationStore())

        await viewModel.load()

        #expect(viewModel.consumedML == 0)
        #expect(viewModel.targetML == 2_000)
        #expect(viewModel.progress == 0)
        #expect(viewModel.goalReached == false)
    }

    @Test("clamps a stored total to the target")
    func clampsStoredTotal() async {
        let viewModel = HydrationViewModel(targetML: 2_000, store: InMemoryHydrationStore(consumedML: 5_000))

        await viewModel.load()

        #expect(viewModel.consumedML == 2_000)
        #expect(viewModel.goalReached)
    }

    @Test("adds an amount and persists it", arguments: [250, 500])
    func addPersists(amount: Int) async throws {
        let store = InMemoryHydrationStore()
        let viewModel = HydrationViewModel(store: store)

        await viewModel.add(amount)

        #expect(viewModel.consumedML == amount)
        #expect(try await store.loadConsumedML() == amount)
    }

    @Test("never exceeds the target")
    func addClampsToTarget() async {
        let viewModel = HydrationViewModel(targetML: 2_000, store: InMemoryHydrationStore(consumedML: 1_900))
        await viewModel.load()

        await viewModel.add(500)

        #expect(viewModel.consumedML == 2_000)
        #expect(viewModel.remainingML == 0)
    }

    @Test("ignores non-positive amounts", arguments: [0, -250])
    func ignoresNonPositive(amount: Int) async {
        let viewModel = HydrationViewModel(store: InMemoryHydrationStore(consumedML: 300))
        await viewModel.load()

        await viewModel.add(amount)

        #expect(viewModel.consumedML == 300)
    }

    @Test("computes progress as a fraction of the target")
    func progressFraction() async {
        let viewModel = HydrationViewModel(targetML: 2_000, store: InMemoryHydrationStore())

        await viewModel.add(500)

        #expect(abs(viewModel.progress - 0.25) < 0.0001)
        #expect(viewModel.remainingML == 1_500)
    }

    @Test("reset clears the total and persists zero")
    func resetPersists() async throws {
        let store = InMemoryHydrationStore(consumedML: 750)
        let viewModel = HydrationViewModel(store: store)
        await viewModel.load()

        await viewModel.reset()

        #expect(viewModel.consumedML == 0)
        #expect(try await store.loadConsumedML() == 0)
    }

    @Test("surfaces load failures without crashing")
    func loadFailure() async {
        let viewModel = HydrationViewModel(store: FailingHydrationStore())

        await viewModel.load()

        #expect(viewModel.errorMessage == "Could not load your total.")
        #expect(viewModel.consumedML == 0)
    }
}
