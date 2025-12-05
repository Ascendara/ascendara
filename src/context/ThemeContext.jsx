import React, { createContext, useContext, useState, useEffect } from "react";
import {
  ThemeProvider as NextThemeProvider,
  useTheme as useNextTheme,
} from "next-themes";

const ThemeContext = createContext();

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
        } else {
          clearCustomTheme();
        }
      }
    };

    window.electron.ipcRenderer.on("settings-updated", handleSettingsChange);

    return () => {
      window.electron.ipcRenderer.off("settings-updated", handleSettingsChange);
    };
  }, []);

  const setTheme = newTheme => {
    setThemeState(newTheme);
  };

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
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {children}
      </ThemeContext.Provider>
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
