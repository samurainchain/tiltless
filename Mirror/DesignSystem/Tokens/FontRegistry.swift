import CoreText
import Foundation

/// Registers the bundled Geist and Geist Mono fonts (SIL Open Font License, Resources/Fonts)
/// for this process at launch, so `Font.custom` finds them without an Info.plist font list.
enum FontRegistry {
    static func registerBundledFonts(in bundle: Bundle = .main) {
        for url in bundle.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [] {
            // Already registered (a second call, previews) is not an error worth reporting.
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}
