import Core
import Foundation

/// Composition root for dependencies. Tests pass their own arguments and environment, so
/// nothing here depends on global process state.
struct AppEnvironment {
    let itemStore: any ItemStoring

    init(
        arguments: [String] = CommandLine.arguments,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        if arguments.contains(LaunchArguments.uiTesting) {
            let seeded = environment["UI_TEST_SEED"] == "1"
            itemStore = InMemoryItemStore(items: seeded ? [Item(title: "Seeded item")] : [])
        } else {
            itemStore = InMemoryItemStore()
        }
    }
}
