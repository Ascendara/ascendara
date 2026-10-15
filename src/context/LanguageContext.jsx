import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import i18n, { languages, addLanguage, getClosestSupportedLanguage } from "@/i18n";
import { changeLanguage, getAvailableLanguages } from "@/services/languageService";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [resourceRevision, setResourceRevision] = useState(0);
  const [language, setLanguage] = useState(() => {
    // Default to browser language or English
    return getClosestSupportedLanguage(navigator.language);
  });

  // Initialize language from electron settings
  useEffect(() => {
    const initLanguage = async () => {
      try {
        const installed = await getAvailableLanguages();
        installed.forEach(({ id, name, nativeName }) =>
          addLanguage(id, name, nativeName)
        );
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
    const onLanguageChanged = newLanguage => setLanguage(newLanguage);
    const onResourcesAdded = code => {
      if (code === i18n.language) setResourceRevision(revision => revision + 1);
    };
    i18n.on("languageChanged", onLanguageChanged);
    i18n.store.on("added", onResourcesAdded);
    return () => {
      i18n.off("languageChanged", onLanguageChanged);
      i18n.store.off("added", onResourcesAdded);
    };
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
      resourceRevision,
      t: i18n.t.bind(i18n),
    }),
    [language, setLanguageAndSave, resourceRevision]
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
