# Design tokens

All interface tokens are CSS custom properties at the top of `src/styles.css`.
Themes redefine semantic colors rather than component colors.

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
