import i18n from "i18next";
import { addLanguage } from "@/i18n";
import { extraLanguages } from "@/lib/extraLanguages";
import { toast } from "sonner";

const { electron } = window;
const progressListeners = new Set();
const languageListeners = new Set();
let currentTranslation = null;
let pendingDownload = null;
let progressRevision = 0;

function publishProgress(progress) {
  currentTranslation = progress;
  progressListeners.forEach(listener => listener(progress));
}

function notifyLanguageListChange() {
  languageListeners.forEach(listener => listener());
}

async function loadLanguage(code) {
  const translation = await electron.getLanguageFile(code);
  if (
    !translation ||
    typeof translation !== "object" ||
    Array.isArray(translation) ||
    !Object.keys(translation).length
  ) {
    throw new Error("The language file is missing or invalid");
  }
  i18n.addResourceBundle(code, "translation", translation, true, true);
  const info = extraLanguages[code] || { name: code, nativeName: code };
  addLanguage(code, info.name, info.nativeName);
  notifyLanguageListChange();
  return translation;
}

electron.onTranslationProgress(progress => {
  if (!progress) return;
  progressRevision += 1;
  if (["completed", "error", "cancelled"].includes(progress.phase)) {
    progressListeners.forEach(listener => listener(progress));
    publishProgress(null);
    // Background updates also refresh bundles already loaded in this renderer.
    if (
      progress.phase === "completed" &&
      pendingDownload?.code !== progress.languageCode
    ) {
      loadLanguage(progress.languageCode).catch(error =>
        console.error("Failed to reload language:", error)
      );
    }
    return;
  }
  publishProgress(progress);
});

// Restore an in-flight job after a renderer reload without replacing newer events.
const initialRevision = progressRevision;
electron
  .getTranslationProgress()
  .then(progress => {
    if (
      progressRevision === initialRevision &&
      progress &&
      !["completed", "error", "cancelled"].includes(progress.phase)
    )
      publishProgress(progress);
  })
  .catch(error => console.error("Failed to read translation progress:", error));

export const getCurrentTranslation = () => currentTranslation;
export const onTranslationProgress = listener => {
  progressListeners.add(listener);
  listener(currentTranslation);
  return () => progressListeners.delete(listener);
};
export const onLanguageListChange = listener => {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
};

export const downloadLanguage = languageCode => {
  if (pendingDownload) {
    if (pendingDownload.code === languageCode) return pendingDownload.promise;
    return Promise.reject(new Error("A translation is already in progress"));
  }
  if (currentTranslation)
    return Promise.reject(new Error("A translation is already in progress"));
  const request = { code: languageCode };
  pendingDownload = request;
  publishProgress({ languageCode, phase: "starting", progress: 0 });
  request.promise = (async () => {
    try {
      const cached = await electron.getLanguageFile(languageCode);
      if (!cached) {
        const success = await electron.startTranslation(languageCode);
        if (!success) throw new Error("Failed to start translation");
      }
      const translation = await loadLanguage(languageCode);
      if (!cached) toast.success(i18n.t("Language downloaded successfully"));
      return translation;
    } catch (error) {
      if (!error.message.toLowerCase().includes("cancelled")) toast.error(error.message);
      throw error;
    } finally {
      if (pendingDownload === request) pendingDownload = null;
      if (currentTranslation?.languageCode === languageCode) publishProgress(null);
    }
  })();
  return request.promise;
};

export const cancelTranslation = async () => {
  if (await electron.cancelTranslation()) toast.info(i18n.t("Translation cancelled"));
  // Keep the controls locked until the process actually exits.
};

export const isLanguageLoaded = code => i18n.hasResourceBundle(code, "translation");

export const changeLanguage = async code => {
  if (!isLanguageLoaded(code)) {
    // Installed languages remain selectable while another language is updating.
    if (await electron.getLanguageFile(code)) await loadLanguage(code);
    else await downloadLanguage(code);
  }
  await i18n.changeLanguage(code);
};

export const handleLanguageChange = async languageValue => {
  const code = String(languageValue);
  try {
    await changeLanguage(code);
    const success = await electron.updateSetting("language", code);
    if (!success) throw new Error("Failed to save language setting");
  } catch (error) {
    toast.error(error.message);
    throw error;
  }
};

const baseLanguages = {
  en: { name: "English", nativeName: "English", icon: "🇺🇸" },
  es: { name: "Español", nativeName: "Español", icon: "🇪🇸" },
  fr: { name: "Français", nativeName: "Français", icon: "🇫🇷" },
  it: { name: "Italiano", nativeName: "Italiano", icon: "🇮🇹" },
  de: { name: "Deutsch", nativeName: "Deutsch", icon: "🇩🇪" },
  pt: { name: "Português", nativeName: "Português", icon: "🇵🇹" },
  ru: { name: "Русский", nativeName: "Русский", icon: "🇷🇺" },
  "zh-CN": { name: "中文", nativeName: "中文", icon: "🇨🇳" },
  ar: { name: "العربية", nativeName: "العربية", icon: "🇸🇦" },
  hi: { name: "हिन्दी", nativeName: "हिन्दी", icon: "🇮🇳" },
  bn: { name: "বাংলা", nativeName: "বাংলা", icon: "🇧🇩" },
  ja: { name: "日本語", nativeName: "日本語", icon: "🇯🇵" },
};

export const getDownloadedLanguages = async () => {
  try {
    return await electron.getDownloadedLanguages();
  } catch (error) {
    console.error("Failed to list downloaded languages:", error);
    return [];
  }
};

export const getAvailableLanguages = async () => {
  const base = Object.entries(baseLanguages).map(([id, info]) => ({ id, ...info }));
  const downloaded = await getDownloadedLanguages();
  const extra = downloaded
    .filter(id => !baseLanguages[id])
    .map(id => ({
      id,
      ...(extraLanguages[id] || { name: id.toUpperCase(), nativeName: id.toUpperCase() }),
      icon: "🌐",
      downloaded: true,
    }));
  return [...base, ...extra];
};

export { baseLanguages };
