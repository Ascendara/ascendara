import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import i18n, { languages, getClosestSupportedLanguage } from "@/i18n";
import { changeLanguage } from "@/services/languageService";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Default to browser language or English
    return getClosestSupportedLanguage(navigator.language);
  });

  // Initialize language from electron settings
  useEffect(() => {
    const initLanguage = async () => {
      try {
        const settings = await window.electron.getSettings();
        if (settings?.language) {
          const targetLang = getClosestSupportedLanguage(settings.language);
          try {
            await changeLanguage(targetLang);
            setLanguage(targetLang);
          } catch (error) {
            console.warn(
              `Failed to load language ${targetLang}, falling back to English`,
              error
            );
            await i18n.changeLanguage("en");
            setLanguage("en");
          }
        } else {
          // No language in settings, initialize with browser language
          const browserLang = getClosestSupportedLanguage(navigator.language);
          try {
            await changeLanguage(browserLang);
            setLanguage(browserLang);
          } catch (error) {
            console.warn(
              `Failed to load browser language ${browserLang}, falling back to English`,
              error
            );
            await i18n.changeLanguage("en");
            setLanguage("en");
          }
        }
      } catch (error) {
        console.error("Error loading language from settings:", error);
        // Fall back to English on error
        await i18n.changeLanguage("en");
        setLanguage("en");
      }
    };

    initLanguage();
  }, []);

  const setLanguageAndSave = useCallback(async newLanguage => {
    try {
      await changeLanguage(newLanguage);
      setLanguage(newLanguage);
      await window.electron.saveSettings({ language: newLanguage });
    } catch (error) {
      console.error("Failed to change language:", error);
      throw error;
    }
  }, []);

  useEffect(() => {
    // Set HTML lang attribute
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      changeLanguage: setLanguageAndSave,
      languages,
      t: i18n.t.bind(i18n),
    }),
    [language, setLanguageAndSave]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
