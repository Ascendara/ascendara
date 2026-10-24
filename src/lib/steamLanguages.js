// UI languages Steam also has store text in, so game info (descriptions,
// genres, requirements) is shown translated. Mirrors STEAM_LANGUAGES in the API;
// every other language gets Steam's English text.
const STEAM_LANGUAGE_CODES = new Set([
  "en",
  "ar",
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "es",
  "fi",
  "fr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "nb",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh",
]);

export const hasTranslatedGameInfo = code => {
  if (!code) return false;
  const normalized = code.toLowerCase().replace("_", "-");
  return (
    STEAM_LANGUAGE_CODES.has(normalized) ||
    STEAM_LANGUAGE_CODES.has(normalized.split("-")[0])
  );
};
