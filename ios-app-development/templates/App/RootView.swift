import SwiftUI

struct RootView: View {
    let model: AppModel

    var body: some View {
        NavigationStack {
            ItemsListView(viewModel: model.items)
        }
    }
}
