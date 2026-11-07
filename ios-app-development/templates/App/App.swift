import Core
import Observation
import SwiftUI

@main
struct MyApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
        }
    }
}

/// Composition root. Owns long-lived state and wires the environment.
@MainActor
@Observable
final class AppModel {
    let items: ItemsViewModel

    init(environment: AppEnvironment = AppEnvironment()) {
        self.items = ItemsViewModel(store: environment.itemStore)
    }
}
