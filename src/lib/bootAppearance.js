// The boot screen (src/index.html) paints before any app code runs, so it
// reuses the theme and colors recorded on the previous launch. Without this it
// starts in a default theme and visibly switches once settings load.
const THEME_KEY = "ascendara-theme";
const COLORS_KEY = "ascendara-boot-colors";

const readVar = (style, name) => style.getPropertyValue(name).trim();

export function recordBootAppearance(theme) {
  // Wait a frame so the theme attribute and custom colors have been applied.
  requestAnimationFrame(() => {
    try {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const background =
        readVar(style, "--color-startup-background") ||
        readVar(style, "--color-background");
      const accent =
        readVar(style, "--color-startup-accent") || readVar(style, "--color-primary");
      if (theme) localStorage.setItem(THEME_KEY, theme);
      if (background && accent) {
        localStorage.setItem(
          COLORS_KEY,
          JSON.stringify({ background, accent, scheme: root.style.colorScheme || "" })
        );
      }
    } catch {
      // Storage unavailable: the boot screen falls back to the default theme.
    }
  });
}

export function readBootTheme(fallback) {
  try {
    return localStorage.getItem(THEME_KEY) || fallback;
  } catch {
    return fallback;
  }
}
