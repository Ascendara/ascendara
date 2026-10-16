import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";

const ThemeContext = createContext();

const DARK_THEMES = new Set([
  "dark",
  "midnight",
  "cyberpunk",
  "sunset",
  "forest",
  "ocean",
]);

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

// Helper to apply custom theme CSS variables
const applyCustomTheme = customColors => {
  if (!customColors) return;
  const root = document.documentElement;
  root.style.setProperty("--color-background", customColors.background);
  root.style.setProperty("--color-foreground", customColors.foreground);
  root.style.setProperty("--color-primary", customColors.primary);
  root.style.setProperty("--color-secondary", customColors.secondary);
  root.style.setProperty("--color-muted", customColors.muted);
  root.style.setProperty("--color-muted-foreground", customColors.mutedForeground);
  root.style.setProperty("--color-accent", customColors.accent);
  root.style.setProperty("--color-accent-foreground", customColors.accentForeground);
  root.style.setProperty("--color-border", customColors.border);
  root.style.setProperty("--color-input", customColors.input);
  root.style.setProperty("--color-ring", customColors.ring);
  root.style.setProperty("--color-card", customColors.card);
  root.style.setProperty("--color-card-foreground", customColors.cardForeground);
  root.style.setProperty("--color-popover", customColors.popover);
  root.style.setProperty("--color-popover-foreground", customColors.popoverForeground);
};

// Helper to clear custom theme CSS variables (let the theme CSS take over)
const clearCustomTheme = () => {
  const root = document.documentElement;
  root.style.removeProperty("--color-background");
  root.style.removeProperty("--color-foreground");
  root.style.removeProperty("--color-primary");
  root.style.removeProperty("--color-secondary");
  root.style.removeProperty("--color-muted");
  root.style.removeProperty("--color-muted-foreground");
  root.style.removeProperty("--color-accent");
  root.style.removeProperty("--color-accent-foreground");
  root.style.removeProperty("--color-border");
  root.style.removeProperty("--color-input");
  root.style.removeProperty("--color-ring");
  root.style.removeProperty("--color-card");
  root.style.removeProperty("--color-card-foreground");
  root.style.removeProperty("--color-popover");
  root.style.removeProperty("--color-popover-foreground");
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("purple");
  const [customColors, setCustomColors] = useState(null);

  useEffect(() => {
    applyColorScheme(theme, customColors);
  }, [theme, customColors]);

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
