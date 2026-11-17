import Core
import Observation
import SwiftUI

@main
struct MyWatchApp: App {
    @State private var model = WatchModel()

    var body: some Scene {
        WindowGroup {
            HydrationView(model: model)
        }
    }
}

/// Composition root for the watch app. Keeps the view free of dependency wiring.
@MainActor
@Observable
final class WatchModel {
    let hydration: HydrationViewModel

    init(store: any HydrationStoring = InMemoryHydrationStore()) {
        self.hydration = HydrationViewModel(store: store)
    }
}
