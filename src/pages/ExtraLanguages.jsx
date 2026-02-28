import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import {
  Loader,
  ArrowLeft,
  ExternalLink,
  CircleArrowDown,
  CircleCheck,
} from "lucide-react";
import {
  downloadLanguage,
  onTranslationProgress,
  getAvailableLanguages,
} from "@/services/languageService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Base languages that are always available
const baseLanguages = [
  { id: "en", name: "English", nativeName: "English", icon: "🇺🇸" },
  { id: "es", name: "Spanish", nativeName: "Español", icon: "🇪🇸" },
  { id: "fr", name: "French", nativeName: "Français", icon: "🇫🇷" },
  { id: "it", name: "Italian", nativeName: "Italiano", icon: "🇮🇹" },
  { id: "de", name: "German", nativeName: "Deutsch", icon: "🇩🇪" },
  { id: "pt", name: "Portuguese", nativeName: "Português", icon: "🇵🇹" },
  { id: "ru", name: "Russian", nativeName: "Русский", icon: "🇷🇺" },
  { id: "zh-CN", name: "Chinese", nativeName: "中文", icon: "🇨🇳" },
  { id: "ar", name: "Arabic", nativeName: "العربية", icon: "🇸🇦" },
  { id: "hi", name: "Hindi", nativeName: "हिन्दी", icon: "🇮🇳" },
  { id: "bn", name: "Bengali", nativeName: "বাংলা", icon: "🇧🇩" },
  { id: "ja", name: "Japanese", nativeName: "日本語", icon: "🇯🇵" },
];

// ISO 639-1 language codes and names
export const extraLanguages = {
  af: { name: "Afrikaans", nativeName: "Afrikaans" },
  am: { name: "Amharic", nativeName: "አማርኛ" },
  az: { name: "Azerbaijani", nativeName: "Azərbaycan dili" },
  be: { name: "Belarusian", nativeName: "Беларуская" },
  bg: { name: "Bulgarian", nativeName: "Български" },
  bs: { name: "Bosnian", nativeName: "Bosanski" },
  ca: { name: "Catalan", nativeName: "Català" },
  ceb: { name: "Cebuano", nativeName: "Cebuano" },
  co: { name: "Corsican", nativeName: "Corsu" },
  cs: { name: "Czech", nativeName: "Čeština" },
  cy: { name: "Welsh", nativeName: "Cymraeg" },
  da: { name: "Danish", nativeName: "Dansk" },
  el: { name: "Greek", nativeName: "Ελληνικά" },
  eo: { name: "Esperanto", nativeName: "Esperanto" },
  et: { name: "Estonian", nativeName: "Eesti" },
  eu: { name: "Basque", nativeName: "Euskara" },
  fa: { name: "Persian", nativeName: "فارسی" },
  fi: { name: "Finnish", nativeName: "Suomi" },
  fy: { name: "Frisian", nativeName: "Frysk" },
  ga: { name: "Irish", nativeName: "Gaeilge" },
  gd: { name: "Scots Gaelic", nativeName: "Gàidhlig" },
  gl: { name: "Galician", nativeName: "Galego" },
  gu: { name: "Gujarati", nativeName: "ગુજરાતી" },
  ha: { name: "Hausa", nativeName: "Hausa" },
  haw: { name: "Hawaiian", nativeName: "ʻŌlelo Hawaiʻi" },
  he: { name: "Hebrew", nativeName: "עברית" },
  hmn: { name: "Hmong", nativeName: "Hmong" },
  hr: { name: "Croatian", nativeName: "Hrvatski" },
  ht: { name: "Haitian Creole", nativeName: "Kreyòl Ayisyen" },
  hu: { name: "Hungarian", nativeName: "Magyar" },
  hy: { name: "Armenian", nativeName: "Հայերեն" },
  id: { name: "Indonesian", nativeName: "Bahasa Indonesia" },
  ig: { name: "Igbo", nativeName: "Igbo" },
  is: { name: "Icelandic", nativeName: "Íslenska" },
  iw: { name: "Hebrew", nativeName: "עברית" },
  jw: { name: "Javanese", nativeName: "Basa Jawa" },
  ka: { name: "Georgian", nativeName: "ქართული" },
  kk: { name: "Kazakh", nativeName: "Қазақ тілі" },
  km: { name: "Khmer", nativeName: "ខ្មែរ" },
  kn: { name: "Kannada", nativeName: "ಕನ್ನಡ" },
  ko: { name: "Korean", nativeName: "한국어" },
  ku: { name: "Kurdish", nativeName: "Kurdî" },
  ky: { name: "Kyrgyz", nativeName: "Кыргызча" },
  la: { name: "Latin", nativeName: "Latina" },
  lb: { name: "Luxembourgish", nativeName: "Lëtzebuergesch" },
  lo: { name: "Lao", nativeName: "ລາວ" },
  lt: { name: "Lithuanian", nativeName: "Lietuvių" },
  lv: { name: "Latvian", nativeName: "Latviešu" },
  mg: { name: "Malagasy", nativeName: "Malagasy" },
  mi: { name: "Maori", nativeName: "Māori" },
  mk: { name: "Macedonian", nativeName: "Македонски" },
  ml: { name: "Malayalam", nativeName: "മലയാളം" },
  mn: { name: "Mongolian", nativeName: "Монгол" },
  mr: { name: "Marathi", nativeName: "मराठी" },
  ms: { name: "Malay", nativeName: "Bahasa Melayu" },
  mt: { name: "Maltese", nativeName: "Malti" },
  my: { name: "Myanmar (Burmese)", nativeName: "မြန်မာစာ" },
  ne: { name: "Nepali", nativeName: "नेपाली" },
  nl: { name: "Dutch", nativeName: "Nederlands" },
  no: { name: "Norwegian", nativeName: "Norsk" },
  ny: { name: "Chichewa", nativeName: "Chichewa" },
  pa: { name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  pl: { name: "Polish", nativeName: "Polski" },
  ps: { name: "Pashto", nativeName: "پښتو" },
  ro: { name: "Romanian", nativeName: "Română" },
  sd: { name: "Sindhi", nativeName: "سنڌي" },
  si: { name: "Sinhala", nativeName: "සිංහල" },
  sk: { name: "Slovak", nativeName: "Slovenčina" },
  sl: { name: "Slovenian", nativeName: "Slovenščina" },
  sm: { name: "Samoan", nativeName: "Gagana Samoa" },
  sn: { name: "Shona", nativeName: "Shona" },
  so: { name: "Somali", nativeName: "Soomaali" },
  sq: { name: "Albanian", nativeName: "Shqip" },
  sr: { name: "Serbian", nativeName: "Српски" },
  st: { name: "Sesotho", nativeName: "Sesotho" },
  su: { name: "Sundanese", nativeName: "Basa Sunda" },
  sv: { name: "Swedish", nativeName: "Svenska" },
  sw: { name: "Swahili", nativeName: "Kiswahili" },
  ta: { name: "Tamil", nativeName: "தமிழ்" },
  te: { name: "Telugu", nativeName: "తెలుగు" },
  tg: { name: "Tajik", nativeName: "Тоҷикӣ" },
  th: { name: "Thai", nativeName: "ไทย" },
  tl: { name: "Filipino", nativeName: "Filipino" },
  tr: { name: "Turkish", nativeName: "Türkçe" },
  uk: { name: "Ukrainian", nativeName: "Українська" },
  ur: { name: "Urdu", nativeName: "اردو" },
  uz: { name: "Uzbek", nativeName: "O'zbek" },
  vi: { name: "Vietnamese", nativeName: "Tiếng Việt" },
  xh: { name: "Xhosa", nativeName: "isiXhosa" },
  yi: { name: "Yiddish", nativeName: "ייִדיש" },
  yo: { name: "Yoruba", nativeName: "Yorùbá" },
  "zh-TW": { name: "Chinese (Traditional)", nativeName: "繁體中文" },
  zu: { name: "Zulu", nativeName: "isiZulu" },
};

function ExtraLanguages() {
  const { language, changeLanguage, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(null);
  const navigate = useNavigate();
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [selectedLangId, setSelectedLangId] = useState(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const loadLanguages = useCallback(async () => {
    const languages = await getAvailableLanguages();
    setAvailableLanguages(languages);
  }, []);

  useEffect(() => {
    loadLanguages();
  }, [loadLanguages]);

  useEffect(() => {
    const getInstalledTools = async () => {
      const tools = await window.electron.getInstalledTools();
      setShowDownloadDialog(!tools.includes("translator"));
    };
    getInstalledTools();
  }, []);
  // Subscribe to download progress updates
  useEffect(() => {
    const unsubscribe = onTranslationProgress((progress) => {
      setDownloadProgress(progress);
      
      // Refresh available languages when translation completes
      if (progress?.phase === "completed") {
        loadLanguages();
      }
    });
    return () => unsubscribe();
  }, [loadLanguages]);

  const handleChangeLanguage = useCallback(
    langId => {
      // Ensure value is a string
      const languageValue = String(langId);
      // Use changeLanguage from the context
      changeLanguage(languageValue);
      window.electron.updateSetting("language", languageValue);
    },
    [changeLanguage]
  );

  // Memoize the available languages map for O(1) lookup
  const availableLanguagesMap = useMemo(() => {
    const map = new Map();
    availableLanguages.forEach(lang => map.set(lang.id, true));
    return map;
  }, [availableLanguages]);

  // Filter languages based on search query
  const filteredLanguages = useMemo(
    () =>
      Object.entries(extraLanguages)
        .filter(([code, lang]) => {
          const searchLower = searchQuery.toLowerCase();
          return (
            !baseLanguages.some(base => base.id === code) && // Exclude base languages from extra list
            (lang.name.toLowerCase().includes(searchLower) ||
              lang.nativeName.toLowerCase().includes(searchLower) ||
              code.toLowerCase().includes(searchLower))
          );
        })
        .map(([code, lang]) => ({
          id: code,
          ...lang,
        })),
    [searchQuery] // Only recompute when search query changes
  );

  return (
    <div className="container mx-auto space-y-4 p-4">
      <div className="mt-20" />
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="mb-2 rounded-full hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="ml-4 text-3xl font-bold text-primary">
          {t("settings.extraLanguagesPanel.title")}
        </h1>
      </div>

      {/* Available Languages Section */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold text-primary">
          {t("settings.extraLanguagesPanel.availableLanguagesList")}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {availableLanguages.map(lang => (
            <Button
              key={lang.id}
              variant={language === lang.id ? "default" : "outline"}
              className={`w-full justify-start gap-2 ${language === lang.id ? "text-secondary" : ""}`}
              onClick={() => handleChangeLanguage(lang.id)}
            >
              <span>{lang.icon}</span>
              <span>{lang.nativeName}</span>
              {lang.downloaded && (
                <CircleCheck className="ml-auto h-4 w-4 text-green-500" />
              )}
            </Button>
          ))}
        </div>
      </Card>

      {/* Extra Languages Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-primary">
          {t("settings.extraLanguagesPanel.additionalLanguagesList")}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("settings.extraLanguagesPanel.additionalLangListDesc")}&nbsp;
          <a
            onClick={() =>
              window.electron.openURL(
                "https://ascendara.app/docs/developer/language-translator"
              )
            }
            className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
          >
            {t("common.learnMore")}
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </p>
        <div className="mb-4">
          <Input
            type="text"
            placeholder={t("Search languages...")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLanguages.map(lang => {
            const isAvailable = availableLanguagesMap.has(lang.id);
            const isDownloading = downloadProgress?.languageCode === lang.id;
            const progress = isDownloading
              ? Math.round(downloadProgress.progress * 100)
              : 0;

            return (
              <Button
                key={lang.id}
                variant={language === lang.id ? "default" : "outline"}
                className="relative w-full justify-start gap-2 overflow-hidden"
                onClick={() =>
                  !isAvailable && !downloadProgress && setSelectedLangId(lang.id)
                }
                disabled={downloadProgress || isAvailable}
              >
                <div className="z-10 flex items-center gap-2">
                  {isDownloading ? (
                    <>
                      <Loader className="animate-spin" />
                      <span>{progress}%</span>
                    </>
                  ) : isAvailable ? (
                    <CircleCheck className="text-green-500" />
                  ) : (
                    <CircleArrowDown />
                  )}
                  <span>{lang.nativeName}</span>
                  <span className="text-muted-foreground">({lang.name})</span>
                </div>

                {/* Progress Bar */}
                {isDownloading && (
                  <div
                    className="absolute bottom-0 left-0 top-0 bg-primary/20 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </Button>
            );
          })}
        </div>
      </Card>

      <AlertDialog
        open={!!selectedLangId}
        onOpenChange={open => !open && setSelectedLangId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.extraLanguagesPanel.translatingDialog")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.extraLanguagesPanel.translatingDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={() => {
                downloadLanguage(selectedLangId);
                setSelectedLangId(null);
              }}
            >
              {t("welcome.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDownloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.extraLanguagesPanel.downloadTool")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.extraLanguagesPanel.downloadToolDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate(-1)} className="text-primary">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={async () => {
                try {
                  setIsDownloading(true);
                  await window.electron.installTool("translator");
                  setShowDownloadDialog(false);
                  setHasTranslationTool(true);
                } catch (error) {
                  console.error("Failed to install translator tool:", error);
                } finally {
                  setIsDownloading(false);
                }
              }}
              disabled={isDownloading}
            >
              {isDownloading ? t("common.downloading") : t("welcome.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ExtraLanguages;
