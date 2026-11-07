import Core
import SwiftUI

struct HydrationView: View {
    let model: WatchModel
    @State private var amount: Double = 250

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ProgressView(value: model.hydration.progress)
                    .progressViewStyle(.circular)
                    .tint(.blue)
                    .accessibilityIdentifier("hydration.progress")
                    .accessibilityLabel("Hydration progress")
                    .accessibilityValue(
                        "\(model.hydration.consumedML) of \(model.hydration.targetML) millilitres"
                    )

                Text("\(model.hydration.consumedML) / \(model.hydration.targetML) ml")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("hydration.consumedLabel")

                Text("\(Int(amount)) ml")
                    .font(.headline)
                    .focusable()
                    .modifier(CrownAmountControl(amount: $amount))
                    .accessibilityIdentifier("hydration.amountLabel")
                    .accessibilityLabel("Amount per tap")

                Button("Add") {
                    Task {
                        await model.hydration.add(Int(amount))
                        Haptics.success()
                    }
                }
                .accessibilityIdentifier("hydration.addButton")

                if let error = model.hydration.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("hydration.errorLabel")
                }
            }
            .padding(.vertical)
        }
        .task { await model.hydration.load() }
    }
}

/// Digital Crown input is watchOS-only; isolating it keeps the rest of the view typecheckable
/// against the macOS SDK as well.
private struct CrownAmountControl: ViewModifier {
    @Binding var amount: Double

    func body(content: Content) -> some View {
        #if os(watchOS)
        content.digitalCrownRotation(
            $amount,
            from: 50,
            through: 500,
            by: 50,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        #else
        content
        #endif
    }
}
