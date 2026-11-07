import Core
import SwiftUI

struct ItemsListView: View {
    @Bindable var viewModel: ItemsViewModel
    @State private var newTitle = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        List {
            ForEach(viewModel.items) { item in
                Button {
                    Task { await viewModel.toggle(item) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.isDone ? Color.accentColor : Color.secondary)
                        Text(item.title)
                            .strikethrough(item.isDone)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("items.row")
                .accessibilityLabel(item.title)
                .accessibilityValue(item.isDone ? "done" : "not done")
                .swipeActions {
                    Button("Delete", role: .destructive) {
                        Task { await viewModel.delete(item) }
                    }
                    .accessibilityIdentifier("items.deleteButton")
                }
            }
        }
        .accessibilityIdentifier("items.list")
        .overlay {
            if viewModel.items.isEmpty {
                ContentUnavailableView(
                    "No items yet",
                    systemImage: "tray",
                    description: Text("Add your first item below.")
                )
                .accessibilityIdentifier("items.emptyState")
            }
        }
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle("Items")
        .task { await viewModel.load() }
    }

    private var composer: some View {
        HStack(spacing: 12) {
            TextField("New item", text: $newTitle)
                .textFieldStyle(.roundedBorder)
                .focused($composerFocused)
                .submitLabel(.done)
                .onSubmit(submit)
                .accessibilityIdentifier("items.addField")

            Button("Add", action: submit)
                .buttonStyle(.borderedProminent)
                .disabled(trimmedTitle.isEmpty)
                .accessibilityIdentifier("items.addButton")
        }
        .padding()
        .background(.bar)
    }

    private var trimmedTitle: String {
        newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submit() {
        guard !trimmedTitle.isEmpty else { return }
        let title = newTitle
        newTitle = ""
        Task { await viewModel.add(title: title) }
    }
}
