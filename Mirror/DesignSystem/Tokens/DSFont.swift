import SwiftUI

/// Typography tokens from SPEC section 9: Geist for text, Geist Mono for small labels, the same
/// families as the web app. Each one is tied to a Dynamic Type text style, so it scales with the
/// user's text size. The fonts are registered at launch by FontRegistry; if one is missing,
/// SwiftUI falls back to the system font at the same size.
enum DSFont {
    static let largeTitle = Font.custom("Geist-Bold", size: 34, relativeTo: .largeTitle)
    static let title = Font.custom("Geist-SemiBold", size: 22, relativeTo: .title2)
    static let headline = Font.custom("Geist-SemiBold", size: 17, relativeTo: .headline)
    static let body = Font.custom("Geist-Regular", size: 17, relativeTo: .body)
    static let caption = Font.custom("Geist-Regular", size: 12, relativeTo: .caption)
    /// Small uppercase labels over sections and metrics, as in the web app.
    static let label = Font.custom("GeistMono-Medium", size: 11, relativeTo: .caption2)
}

extension View {
    /// Applies a typography token with tabular digits, so numbers don't jump as they change.
    func dsNumeric(_ font: Font = DSFont.body) -> some View {
        self.font(font).monospacedDigit()
    }

    /// Hero amounts such as the day's PnL: Geist Bold, 48 pt at the default text size and scaled
    /// with Dynamic Type.
    func dsHeroNumber() -> some View {
        modifier(HeroNumberModifier())
    }
}

private struct HeroNumberModifier: ViewModifier {
    @ScaledMetric(relativeTo: .largeTitle) private var size: CGFloat = 48

    func body(content: Content) -> some View {
        content
            .font(.custom("Geist-Bold", fixedSize: size))
            .monospacedDigit()
    }
}
