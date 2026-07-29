# Design tokens

All interface tokens are CSS custom properties at the top of `src/styles.css`.
Themes redefine semantic colors rather than component colors.

- Brand: Diorna cream `#F3EFE0`, cobalt `#1D518A`, navy `#3F6495`,
  terracotta `#C66542`, olive `#7C8E58`, and mustard `#DAA343`.
- Color: surfaces, text, border, accent, danger, success, and category colors.
- Spacing: a 4 px scale (`--space-1` through `--space-8`).
- Type: UI, editor, and monospace families plus six named sizes.
- Shape: small, medium, and large radii; small and medium shadows.
- Layout: sidebar, context panel, titlebar, and right-panel dimensions.
- Motion: short state transitions only; the reduced-motion media query reduces
  all duration to effectively zero.

Components consume semantic variables and define hover, active, focus-visible,
disabled, and loading/empty treatments. The hidden `components` module renders
the reusable states for visual regression review.

The warm Diorna theme is the default. Neutral light, dark, follow-Windows, and
user-selected accent colors remain available without changing component code.
