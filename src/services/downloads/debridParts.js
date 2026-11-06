// Sorts the files of a multi-part debrid torrent into game files, language packs and extras.
export const TORRENT_PART_MODES = ["ask", "all", "skipExtras"];
export const DEFAULT_TORRENT_PART_MODE = "ask";

const LANGUAGES = {
  en: ["english", "eng", "en"],
  fr: ["french", "francais", "fre", "fra", "fr"],
  de: ["german", "deutsch", "ger", "deu", "de"],
  es: ["spanish", "espanol", "spa", "es", "latam"],
  it: ["italian", "italiano", "ita", "it"],
  pt: ["portuguese", "brazilian", "portugues", "por", "pt", "br", "ptbr"],
  ru: ["russian", "rus", "ru"],
  pl: ["polish", "polski", "pol", "pl"],
  ja: ["japanese", "jpn", "jap", "ja", "jp"],
  ko: ["korean", "kor", "ko", "kr"],
  zh: ["chinese", "chs", "cht", "chi", "zho", "zh", "cn", "tw"],
  ar: ["arabic", "ara", "ar"],
  tr: ["turkish", "tur", "tr"],
  cs: ["czech", "cze", "ces", "cs", "cz"],
  nl: ["dutch", "nld", "dut", "nl"],
  hu: ["hungarian", "hun", "hu"],
  uk: ["ukrainian", "ukr", "uk", "ua"],
  sv: ["swedish", "swe", "sv"],
  th: ["thai", "tha", "th"],
  vi: ["vietnamese", "vie", "vi"],
  id: ["indonesian", "ind", "id"],
  bn: ["bengali", "bangla", "ben", "bn"],
  hi: ["hindi", "hin", "hi"],
};
const LANGUAGE_BY_TOKEN = new Map(
  Object.entries(LANGUAGES).flatMap(([code, tokens]) =>
    tokens.map(token => [token, code])
  )
);
// Full names are safe anywhere; short codes only where the name is clearly a language pack.
const LANGUAGE_NAMES = new Set(Object.values(LANGUAGES).map(([name]) => name));
const LANGUAGE_CONTEXT =
  /\b(?:selective|optional|lang|language|languages|locale|voice|voices|audio|speech|subtitles?)\b/;
const EXTRAS =
  /\b(?:soundtracks?|ost|bonus(?:es)?|art ?books?|extras?|wallpapers?|making of|digital artbook)\b/;

const tokensOf = name =>
  String(name || "")
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export function classifyTorrentPart(name) {
  const tokens = tokensOf(name);
  const words = ` ${tokens.join(" ")} `;
  if (EXTRAS.test(words)) return { kind: "extra" };
  const languageContext = LANGUAGE_CONTEXT.test(words);
  // "fg-optional-<something>" that is not a language is optional extra content.
  const language = tokens
    .map(token =>
      LANGUAGE_NAMES.has(token) || languageContext ? LANGUAGE_BY_TOKEN.get(token) : null
    )
    .find(Boolean);
  if (language) return { kind: "language", language };
  if (/\bfg optional\b/.test(words)) return { kind: "extra" };
  return { kind: "game" };
}

export const wantedLanguages = systemLanguage => {
  const base = String(systemLanguage || "en")
    .toLowerCase()
    .split(/[-_]/)[0];
  return new Set([base || "en", "en"]);
};

// Returns the files to download, or null when the user should pick.
export function selectTorrentParts(
  files,
  mode = DEFAULT_TORRENT_PART_MODE,
  systemLanguage
) {
  if (!Array.isArray(files) || files.length < 2) return files || [];
  if (mode === "all") return files;
  if (mode !== "skipExtras") return null;
  const languages = wantedLanguages(systemLanguage);
  return files.filter(file => {
    const part = classifyTorrentPart(file.path || file.name);
    if (part.kind === "extra") return false;
    return part.kind === "game" || languages.has(part.language);
  });
}

// Picks the parts of a torrent record: the user's earlier choice, else the setting.
// Returns null while the user still has to choose.
export function resolveTorrentParts(files, entry, mode, systemLanguage) {
  if (Array.isArray(entry?.chosenFileIds)) {
    const chosen = new Set(entry.chosenFileIds.map(String));
    return files.filter(file => chosen.has(String(file.id)));
  }
  const selected = selectTorrentParts(files, mode, systemLanguage);
  // Never download nothing: if every part looks like an extra, keep them all.
  return selected && !selected.length ? files : selected;
}

const readRecords = storageKey => JSON.parse(localStorage.getItem(storageKey) || "{}");
const updateRecord = (storageKey, recordKey, update) => {
  const records = readRecords(storageKey);
  if (!records[recordKey]) return;
  records[recordKey] = update(records[recordKey]);
  localStorage.setItem(storageKey, JSON.stringify(records));
};

// Parks a torrent until the user picks its parts in the checklist dialog.
export const requestPartChoice = (storageKey, recordKey, files) =>
  updateRecord(storageKey, recordKey, record => ({
    ...record,
    partFiles: files.map(({ id, name, size }) => ({ id, name, size: size ?? null })),
  }));

export const saveTorrentPartChoice = (storageKey, recordKey, fileIds) =>
  updateRecord(storageKey, recordKey, record => {
    const next = { ...record, chosenFileIds: fileIds };
    delete next.partFiles;
    return next;
  });

// Torrents waiting for the user, across the given storage keys.
export const getPendingPartChoices = storageKeys =>
  storageKeys.flatMap(storageKey =>
    Object.entries(readRecords(storageKey))
      .filter(
        ([key, record]) =>
          key.startsWith("torrent:") &&
          Array.isArray(record?.partFiles) &&
          !Array.isArray(record.chosenFileIds)
      )
      .map(([recordKey, record]) => ({
        storageKey,
        recordKey,
        name: record.name || record.game || record.gameData?.game || "",
        files: record.partFiles,
      }))
  );
