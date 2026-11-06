import SwiftData
import SwiftUI

@main
struct MirrorApp: App {
    private let container: ModelContainer

    init() {
        FontRegistry.registerBundledFonts()
        do {
            container = try Persistence.makeContainer()
        } catch {
            fatalError("Could not open the data store: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
