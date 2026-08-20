import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./translations/ar.json";
import bn from "./translations/bn.json";
import en from "./translations/en.json";
import es from "./translations/es.json";
import hi from "./translations/hi.json";
import ja from "./translations/ja.json";
import pt from "./translations/pt.json";
import ru from "./translations/ru.json";
import zhCN from "./translations/zh-CN.json";
import it from "./translations/it.json";
import de from "./translations/de.json";
import fr from "./translations/fr.json";
import featureCenterResources from "./i18n/featureCenterResources";

// Base languages that come with the app
export const baseLanguages = {
  en: { name: "English", nativeName: "English" },
  ar: { name: "Arabic", nativeName: "العربية" },
  bn: { name: "Bengali", nativeName: "বাংলা" },
  es: { name: "Spanish", nativeName: "Español" },
  hi: { name: "Hindi", nativeName: "हिन्दी" },
  ja: { name: "Japanese", nativeName: "日本語" },
  pt: { name: "Portuguese", nativeName: "Português" },
  ru: { name: "Russian", nativeName: "Русский" },
  "zh-CN": { name: "Chinese (Simplified)", nativeName: "简体中文" },
  it: { name: "Italian", nativeName: "Italiano" },
  de: { name: "German", nativeName: "Deutsch" },
  fr: { name: "French", nativeName: "Français" },
};

// All available languages, including downloaded ones
export const languages = { ...baseLanguages };

// Function to add a new language to the available languages
export const addLanguage = (code, name, nativeName) => {
  if (!languages[code]) {
    languages[code] = { name, nativeName };
  }
};

// Function to check if a language file exists in the languages folder
export const isExtraLanguageFile = async lang => {
  try {
    const { electron } = window;
    return await electron.languageFileExists(`lang.${lang}.json`);
  } catch (err) {
    return false;
  }
};

// Function to check if a language is supported
export const isSupportedLanguage = lang => {
  return lang in languages || isExtraLanguageFile(lang);
};

// Function to get the closest supported language
export const getClosestSupportedLanguage = lang => {
  if (!lang) return "en";
  if (isSupportedLanguage(lang)) return lang;

  // Try to match language without region code
  const baseLang = lang.split("-")[0];
  const match = Object.keys(languages).find(code => code.startsWith(baseLang));
  return match || "en";
};

// Initialize i18next with base translations
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    bn: { translation: bn },
    es: { translation: es },
    hi: { translation: hi },
    ja: { translation: ja },
    pt: { translation: pt },
    ru: { translation: ru },
    "zh-CN": { translation: zhCN },
    it: { translation: it },
    de: { translation: de },
    fr: { translation: fr },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// Feature Center copy lives in its own bundle to keep the base translation files smaller.
for (const [language, resources] of Object.entries(featureCenterResources)) {
  i18n.addResourceBundle(language, "translation", resources, true, true);
}

export default i18n;
