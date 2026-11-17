#if canImport(WatchKit)
import WatchKit

/// One haptic per completed action. Never per crown tick.
enum Haptics {
    static func success() {
        WKInterfaceDevice.current().play(.success)
    }

    static func click() {
        WKInterfaceDevice.current().play(.click)
    }
}
#else

/// Stub so the same sources typecheck against the macOS SDK.
enum Haptics {
    static func success() {}
    static func click() {}
}
#endif
