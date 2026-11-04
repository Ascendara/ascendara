import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import { readBootTheme, recordBootAppearance } from "@/lib/bootAppearance";

const ThemeContext = createContext();

const DARK_THEMES = new Set([
  "dark",
  "midnight",
  "cyberpunk",
  "sunset",
  "forest",
  "ocean",
  "aurora",
  "crimson",
  "royal-night",
]);

/** Whether a built-in theme is dark; custom themes count as dark. */
export const isDarkTheme = theme => theme === "custom" || DARK_THEMES.has(theme);

// Custom themes store colors as "r g b"; treat a dark background as a dark theme.
const isDarkBackground = rgb => {
  const [r, g, b] = String(rgb || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if ([r, g, b].some(Number.isNaN)) return false;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
};

// Tailwind's dark: variant and native controls (scrollbars, inputs) key off this.
const applyColorScheme = (theme, customColors) => {
  const isDark =
    theme === "custom"
      ? isDarkBackground(customColors?.background)
      : DARK_THEMES.has(theme);
  const root = document.documentElement;
  root.dataset.colorScheme = isDark ? "dark" : "light";
  root.style.colorScheme = isDark ? "dark" : "light";
};

// Every CSS variable a custom theme sets: [variable, color key, fallback]. A
// fallback is another color key, or a fixed "r g b" for themes saved before
// that color existed.
const CUSTOM_THEME_VARS = [
  ["--color-background", "background"],
  ["--color-foreground", "foreground"],
  ["--color-primary", "primary"],
  ["--color-secondary", "secondary"],
  ["--color-muted", "muted"],
  ["--color-muted-foreground", "mutedForeground"],
  ["--color-accent", "accent"],
  ["--color-accent-foreground", "accentForeground"],
  ["--color-border", "border"],
  ["--color-input", "input"],
  ["--color-ring", "ring"],
  ["--color-card", "card"],
  ["--color-card-foreground", "cardForeground"],
  ["--color-popover", "popover"],
  ["--color-popover-foreground", "popoverForeground"],
  ["--color-nav-background", "navBackground", "background"],
  ["--color-nav-active", "navActive", "primary"],
  ["--color-nav-active-text", "navActiveText", "secondary"],
  ["--color-nav-hover", "navHover", "secondary"],
  ["--color-success", "success", "34 197 94"],
  ["--color-warning", "warning", "234 179 8"],
  ["--color-error", "error", "239 68 68"],
  ["--color-info", "info", "59 130 246"],
  ["--color-star-filled", "starFilled", "250 204 21"],
  ["--color-star-empty", "starEmpty", "148 163 184"],
  ["--color-startup-background", "startupBackground", "background"],
  ["--color-startup-accent", "startupAccent", "primary"],
];

/** Apply a custom theme's colors to the whole app. */
export const applyCustomTheme = customColors => {
  if (!customColors) return;
  const root = document.documentElement;
  CUSTOM_THEME_VARS.forEach(([variable, key, fallback]) => {
    const value = customColors[key] || (fallback && (customColors[fallback] || fallback));
    if (value) root.style.setProperty(variable, value);
  });
};

/** Clear custom theme colors so the selected built-in theme's CSS takes over. */
export const clearCustomTheme = () => {
  const root = document.documentElement;
  CUSTOM_THEME_VARS.forEach(([variable]) => root.style.removeProperty(variable));
};

export function ThemeProvider({ children }) {
  // Start from the last launch's theme (the boot screen already uses it) so the
  // app doesn't flash the default theme while settings load.
  const [theme, setThemeState] = useState(() => readBootTheme("purple"));
  const [customColors, setCustomColors] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    applyColorScheme(theme, customColors);
    if (settingsLoaded) recordBootAppearance(theme);
  }, [theme, customColors, settingsLoaded]);

  useEffect(() => {
    // Load theme from settings on mount
    const loadTheme = async () => {
      try {
        const settings = await window.electron.getSettings();
        if (settings?.theme) {
          setThemeState(settings.theme);
          // Apply custom theme if it's the active theme, otherwise clear custom styles
          if (
            settings.theme === "custom" &&
            settings.customTheme &&
            settings.customTheme.length > 0
          ) {
            applyCustomTheme(settings.customTheme[0]);
            setCustomColors(settings.customTheme[0]);
          } else {
            clearCustomTheme();
          }
        }
      } catch (error) {
        console.error("Error loading theme from settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadTheme();

    // Listen for settings changes
    const handleSettingsChange = (event, settings) => {
      if (settings?.theme) {
        setThemeState(settings.theme);
        // Apply custom theme if it's the active theme, otherwise clear custom styles
        if (
          settings.theme === "custom" &&
          settings.customTheme &&
          settings.customTheme.length > 0
        ) {
          applyCustomTheme(settings.customTheme[0]);
          setCustomColors(settings.customTheme[0]);
        } else {
          clearCustomTheme();
        }
      }
    };

    // Keep the callback shape used by the existing settings listener.
    return window.electron.onSettingsChanged(handleSettingsChange);
  }, []);

  const setTheme = useCallback(newTheme => {
    setThemeState(newTheme);
  }, []);

  const contextValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="purple"
      enableSystem={false}
      forcedTheme={theme}
      themes={[
        "light",
        "dark",
        "midnight",
        "cyberpunk",
        "sunset",
        "forest",
        "blue",
        "purple",
        "emerald",
        "rose",
        "amber",
        "ocean",
        "aurora",
        "crimson",
        "coral",
        "lagoon",
        "royal-pearl",
        "royal-night",
        "custom",
      ]}
    >
      <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
    </NextThemeProvider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
