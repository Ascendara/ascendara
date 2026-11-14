import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle,
  CircleAlert,
  ExternalLink,
  FileInput,
  FileOutput,
  Home,
  Info,
  Library,
  Loader,
  Palette,
  Search,
  Settings2,
  Star,
  Trophy,
  TriangleAlert,
  Undo2,
  Users,
  X,
  Download,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme, applyCustomTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_URL } from "@/config/api";
import { persistThemeSelection } from "@/lib/themePersistence";

// Starting point for a new theme, and the fill for colors an older saved theme
// doesn't have yet
const DEFAULT_COLORS = {
  background: "255 255 255",
  foreground: "15 23 42",
  primary: "124 58 237",
  secondary: "221 214 254",
  muted: "221 214 254",
  mutedForeground: "88 28 135",
  accent: "221 214 254",
  accentForeground: "88 28 135",
  border: "167 139 250",
  input: "167 139 250",
  ring: "88 28 135",
  card: "255 255 255",
  cardForeground: "15 23 42",
  popover: "255 255 255",
  popoverForeground: "15 23 42",
  navBackground: "255 255 255",
  navActive: "124 58 237",
  navActiveText: "255 255 255",
  navHover: "221 214 254",
  success: "34 197 94",
  warning: "234 179 8",
  error: "239 68 68",
  info: "59 130 246",
  starFilled: "250 204 21",
  starEmpty: "148 163 184",
  startupBackground: "255 255 255",
  startupAccent: "124 58 237",
};

// Desktop notifications fall back to the general colors until set, matching
// how the notification helper resolves them
const NOTIFICATION_FALLBACKS = {
  notificationBackground: "card",
  notificationForeground: "cardForeground",
  notificationMuted: "mutedForeground",
  notificationAccent: "primary",
  notificationBorder: "border",
  notificationAchievement: "starFilled",
};

// The editor's groups: [key, label key]
const COLOR_GROUPS = [
  {
    id: "core",
    fields: [
      ["background", "background"],
      ["foreground", "text"],
      ["primary", "primary"],
      ["secondary", "secondary"],
      ["accent", "accent"],
      ["accentForeground", "accentText"],
      ["muted", "muted"],
      ["mutedForeground", "mutedText"],
    ],
  },
  {
    id: "surfaces",
    fields: [
      ["card", "card"],
      ["cardForeground", "cardText"],
      ["popover", "popover"],
      ["popoverForeground", "popoverText"],
      ["border", "border"],
      ["input", "input"],
      ["ring", "focusRing"],
    ],
  },
  { id: "navigation", fields: [["navBackground", "background"]] },
  {
    id: "status",
    fields: [
      ["success", "success"],
      ["warning", "warning"],
      ["error", "error"],
      ["info", "info"],
      ["starFilled", "starFilled"],
      ["starEmpty", "starEmpty"],
    ],
  },
  {
    id: "startup",
    fields: [
      ["startupBackground", "background"],
      ["startupAccent", "accent"],
    ],
  },
  {
    id: "notifications",
    fields: [
      ["notificationBackground", "background"],
      ["notificationForeground", "title"],
      ["notificationMuted", "message"],
      ["notificationAccent", "accent"],
      ["notificationBorder", "border"],
      ["notificationAchievement", "achievement"],
    ],
  },
];

const rgbToHex = rgb => {
  const parts = String(rgb || "")
    .trim()
    .split(/\s+/)
    .map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return "#808080";
  return "#" + parts.map(n => n.toString(16).padStart(2, "0")).join("");
};

const hexToRgb = hex => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return match
    .slice(1)
    .map(part => parseInt(part, 16))
    .join(" ");
};

// WCAG contrast ratio between two "r g b" colors
const luminance = rgb => {
  const [r, g, b] = String(rgb)
    .split(/\s+/)
    .map(Number)
    .map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const withDefaults = colors => ({ ...DEFAULT_COLORS, ...(colors || {}) });

const readSavedColors = settings => {
  if (Array.isArray(settings?.customTheme) && settings.customTheme[0]) {
    return withDefaults(settings.customTheme[0]);
  }
  try {
    const stored = localStorage.getItem("custom-theme-colors");
    if (stored) return withDefaults(JSON.parse(stored));
  } catch {
    // Fall through to the defaults
  }
  return withDefaults();
};

// The community list returns a few shapes over time; always hand back an array
const normalizeThemeList = data => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.themes)) return data.themes;
  if (data && typeof data === "object") {
    return Object.values(data).filter(item => item && typeof item === "object");
  }
  return [];
};

function ColorField({ label, value, onChange }) {
  const hex = rgbToHex(value);
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);

  const commitDraft = () => {
    const rgb = hexToRgb(draft.startsWith("#") ? draft : `#${draft}`);
    if (rgb) onChange(rgb);
    else setDraft(hex);
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg py-1.5">
      <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-sm ring-1 ring-border transition-transform group-hover:scale-105">
        <span className="absolute inset-0" style={{ backgroundColor: hex }} />
        <input
          type="color"
          value={hex}
          onChange={e => onChange(hexToRgb(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        />
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
          spellCheck={false}
          className="w-24 bg-transparent font-mono text-xs uppercase text-muted-foreground outline-none focus:text-foreground"
        />
      </div>
    </div>
  );
}

function ContrastCheck({ label, ratio, t }) {
  const grade =
    ratio >= 4.5
      ? { text: "AA", className: "text-green-500" }
      : ratio >= 3
        ? { text: t("settings.themeStudio.contrastLarge"), className: "text-yellow-500" }
        : { text: t("settings.themeStudio.contrastLow"), className: "text-red-500" };
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">{ratio.toFixed(1)}</span>
        <span className={`text-xs font-semibold ${grade.className}`}>{grade.text}</span>
      </p>
    </div>
  );
}

/** A small mock of the app, drawn entirely from the theme being edited. */
function ThemePreview({ colors, notificationColor, t, canSendTest, onSendTest }) {
  const c = key => `rgb(${colors[key]})`;
  const toasts = [
    ["success", CheckCircle, t("settings.preview.success") || "Success"],
    ["warning", TriangleAlert, t("settings.preview.warning") || "Warning"],
    ["error", X, t("settings.preview.error") || "Error"],
    ["info", Info, t("settings.preview.info") || "Info"],
  ];

  return (
    <div className="space-y-6">
      {/* App window */}
      <div
        className="overflow-hidden rounded-xl shadow-lg ring-1 ring-black/10"
        style={{ backgroundColor: c("background") }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-medium" style={{ color: c("foreground") }}>
            Ascendara
          </span>
          <span className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c("mutedForeground"), opacity: 0.4 }}
              />
            ))}
          </span>
        </div>

        <div className="space-y-3 px-4 pb-4">
          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: c("card"), borderColor: c("border") }}
          >
            <p className="text-sm font-semibold" style={{ color: c("cardForeground") }}>
              {t("settings.preview.cardTitle")}
            </p>
            <p className="mt-1 text-xs" style={{ color: c("mutedForeground") }}>
              {t("settings.preview.cardDescription")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: c("primary"), color: c("secondary") }}
              >
                {t("settings.preview.primaryButton")}
              </span>
              <span
                className="rounded-md border px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: c("secondary"),
                  borderColor: c("border"),
                  color: c("foreground"),
                }}
              >
                {t("settings.preview.secondaryButton")}
              </span>
              <span
                className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: c("accent"), color: c("accentForeground") }}
              >
                {t("settings.preview.accentButton")}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <span
                className="flex h-4 w-7 items-center justify-end rounded-full p-0.5"
                style={{ backgroundColor: c("primary") }}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: c("card") }}
                />
              </span>
              <span className="text-xs" style={{ color: c("foreground") }}>
                {t("settings.preview.toggleEnabled")}
              </span>
            </div>
            <div
              className="mt-3 rounded-md border px-2.5 py-1.5 text-xs"
              style={{
                backgroundColor: c("background"),
                borderColor: c("input"),
                color: c("mutedForeground"),
                boxShadow: `0 0 0 2px rgb(${colors.ring} / 0.25)`,
              }}
            >
              {t("settings.preview.inputPlaceholder")}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ backgroundColor: c("muted"), color: c("mutedForeground") }}
                >
                  {t("settings.preview.badge")}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ backgroundColor: c("accent"), color: c("accentForeground") }}
                >
                  {t("settings.preview.accentBadge")}
                </span>
              </div>
              <span className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5"
                    style={{
                      color: i <= 3 ? c("starFilled") : c("starEmpty"),
                      fill: i <= 3 ? c("starFilled") : "transparent",
                    }}
                  />
                ))}
              </span>
            </div>
          </div>

          <div
            className="ml-auto w-3/4 rounded-lg border p-3 shadow-md"
            style={{ backgroundColor: c("popover"), borderColor: c("border") }}
          >
            <p className="text-xs font-medium" style={{ color: c("popoverForeground") }}>
              {t("settings.preview.popoverTitle")}
            </p>
            <p className="text-[11px]" style={{ color: c("mutedForeground") }}>
              {t("settings.preview.popoverDescription")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {toasts.map(([key, Icon, label]) => (
              <div
                key={key}
                className="flex items-center gap-1.5 rounded-md border px-2 py-1"
                style={{
                  backgroundColor: `rgb(${colors.background} / 0.85)`,
                  borderColor: `rgb(${colors[key]} / 0.5)`,
                }}
              >
                <Icon className="h-3 w-3" style={{ color: c(key) }} />
                <span className="text-[11px]" style={{ color: c("foreground") }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Dock */}
          <div
            className="mx-auto flex w-fit items-center gap-1.5 rounded-xl border p-1.5"
            style={{
              backgroundColor: `rgb(${colors.navBackground} / 0.8)`,
              borderColor: c("border"),
            }}
          >
            {[Home, Search, Library, Download, Settings2].map((Icon, index) => (
              <span
                key={index}
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={
                  index === 0
                    ? { backgroundColor: c("primary"), color: c("background") }
                    : { color: c("mutedForeground") }
                }
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop notifications */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("settings.preview.desktopNotification")}
          </p>
          {canSendTest && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t("settings.preview.sendTestNotification")}
                onClick={() => onSendTest(false)}
              >
                <Bell className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t("settings.preview.sendTestNotification")}
                onClick={() => onSendTest(true)}
              >
                <Trophy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {[false, true].map(isAchievement => {
          const tone = isAchievement
            ? notificationColor("notificationAchievement")
            : colors.success;
          return (
            <div
              key={String(isAchievement)}
              className="relative flex gap-3 overflow-hidden rounded-xl border p-3 pb-3.5 shadow-md"
              style={{
                backgroundColor: `rgb(${notificationColor("notificationBackground")})`,
                borderColor: `rgb(${notificationColor("notificationBorder")})`,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                style={{
                  backgroundColor: `rgb(${tone} / 0.16)`,
                  color: `rgb(${tone})`,
                  boxShadow: isAchievement ? `inset 0 0 0 1.5px rgb(${tone})` : "none",
                }}
              >
                {isAchievement ? (
                  <Trophy className="h-4 w-4" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    color: `rgb(${isAchievement ? tone : notificationColor("notificationAccent")})`,
                  }}
                >
                  {isAchievement
                    ? `★ ${t("settings.preview.achievementUnlocked")}`
                    : "Ascendara"}
                </p>
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: `rgb(${notificationColor("notificationForeground")})` }}
                >
                  {isAchievement
                    ? t("settings.preview.achievementName")
                    : t("settings.preview.desktopNotificationTitle")}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: `rgb(${notificationColor("notificationMuted")})` }}
                >
                  {isAchievement
                    ? t("settings.preview.achievementGame")
                    : t("settings.preview.desktopNotificationMessage")}
                </p>
              </div>
              <div
                className="absolute bottom-0 left-0 h-[3px] w-full"
                style={{ backgroundColor: `rgb(${tone} / 0.15)` }}
              >
                <div
                  className="h-full w-3/5"
                  style={{ backgroundColor: `rgb(${tone})` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Startup screen */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("settings.preview.startupScreen") || "Startup Screen"}
        </p>
        <div
          className="flex h-24 items-center justify-center rounded-xl shadow-md ring-1 ring-black/10"
          style={{
            background: `linear-gradient(135deg, rgb(${colors.startupAccent} / 0.12), rgb(${colors.startupBackground}))`,
            backgroundColor: c("startupBackground"),
          }}
        >
          <span
            className="h-9 w-9 rounded-xl shadow"
            style={{ backgroundColor: c("startupAccent") }}
          />
        </div>
      </div>
    </div>
  );
}

function ThemeStudio() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { settings, setSettingsLocal } = useSettings();

  const [saved, setSaved] = useState(() => readSavedColors(settings));
  const [colors, setColors] = useState(saved);
  const [themeVersion, setThemeVersion] = useState(null);
  const [tab, setTab] = useState("colors");
  const [communityThemes, setCommunityThemes] = useState(null);
  const [communityFailed, setCommunityFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(false);

  // Settings can arrive after the page mounts; adopt them if nothing's edited
  useEffect(() => {
    const next = readSavedColors(settings);
    setSaved(next);
    setColors(current =>
      JSON.stringify(current) === JSON.stringify(saved) ? next : current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.customTheme]);

  useEffect(() => {
    window.electron
      .isOnWindows?.()
      .then(setIsOnWindows)
      .catch(() => {});
  }, []);

  // Community themes load the first time their tab opens
  useEffect(() => {
    if (tab !== "community" || communityThemes) return;
    let cancelled = false;
    fetch(`${API_URL}/json/publicthemes`)
      .then(response => response.json())
      .then(data => !cancelled && setCommunityThemes(normalizeThemeList(data)))
      .catch(error => {
        console.error("Error fetching public themes:", error);
        if (cancelled) return;
        setCommunityFailed(true);
        setCommunityThemes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, communityThemes]);

  const dirty = JSON.stringify(colors) !== JSON.stringify(saved);
  const isActive = settings?.theme === "custom";

  const notificationColor = key => colors[key] || colors[NOTIFICATION_FALLBACKS[key]];
  const colorValue = key =>
    key in NOTIFICATION_FALLBACKS ? notificationColor(key) : colors[key];
  const setColor = (key, rgb) => {
    if (!rgb) return;
    setColors(current => ({ ...current, [key]: rgb }));
  };

  const contrast = useMemo(
    () => [
      ["text", contrastRatio(colors.foreground, colors.background)],
      ["cardText", contrastRatio(colors.cardForeground, colors.card)],
      ["buttonText", contrastRatio(colors.secondary, colors.primary)],
      ["mutedText", contrastRatio(colors.mutedForeground, colors.background)],
    ],
    [colors]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await window.electron.saveCustomThemeColors([{ ...colors }]);
      if (!success) {
        toast.error(t("settings.themeStudio.saveFailed"));
        return;
      }
      const themeSaved = await persistThemeSelection("custom", {
        persist: value => window.electron.updateSetting("theme", value),
        applyTheme: value => {
          setTheme(value);
          applyCustomTheme(colors);
        },
        syncSettings: value =>
          setSettingsLocal(prev => ({ ...prev, theme: value, customTheme: [colors] })),
      });
      if (!themeSaved) {
        toast.error(t("settings.themeStudio.saveFailed"));
        return;
      }
      setSaved(colors);
      setThemeVersion(null);
      toast.success(t("settings.customColorsSaved") || "Custom colors saved!");
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    const result = await window.electron.importCustomTheme();
    if (result.success && result.customTheme) {
      setColors(withDefaults(result.customTheme[0]));
      setTab("colors");
      toast.success(t("settings.themeImported") || "Theme imported successfully!");
    } else if (!result.canceled) {
      toast.error(
        result.error || t("settings.themeImportFailed") || "Failed to import theme"
      );
    }
  };

  const handleExport = async () => {
    const result = await window.electron.exportCustomTheme([colors]);
    if (result.success) {
      toast.success(t("settings.themeExported") || "Theme exported successfully!");
    } else if (!result.canceled) {
      toast.error(
        result.error || t("settings.themeExportFailed") || "Failed to export theme"
      );
    }
  };

  const handleUseCommunityTheme = theme => {
    setColors(withDefaults(theme.colors || theme));
    setThemeVersion(theme.version);
    setTab("colors");
    toast.success(t("settings.themeStudio.communityLoaded"));
  };

  const handleSendTest = async achievement => {
    const result = await window.electron.previewNotification(colors, achievement);
    if (!result?.success) {
      toast.error(result?.error || "Failed to show notification");
    }
  };

  const leave = () => navigate("/settings");

  const tabs = [
    { id: "colors", icon: Palette, label: t("settings.themeStudio.tabColors") },
    { id: "community", icon: Users, label: t("settings.themeStudio.tabCommunity") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl p-4 md:p-8">
        {/* Header */}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => (dirty ? setConfirmLeave(true) : leave())}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("settings.title")}
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mb-0 text-3xl font-bold tracking-tight">
                {t("settings.themeStudio.title")}
              </h1>
              {isActive && !dirty && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {t("settings.active") || "Active"}
                </span>
              )}
              {dirty && (
                <span className="rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-500">
                  {t("settings.themeStudio.unsaved")}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {t("settings.themeStudio.description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleImport}>
              <FileInput className="h-4 w-4" />
              {t("settings.importTheme") || "Import"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleExport}>
              <FileOutput className="h-4 w-4" />
              {t("settings.exportTheme") || "Export"}
            </Button>
            {dirty && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setColors(saved);
                  setThemeVersion(null);
                }}
              >
                <Undo2 className="h-4 w-4" />
                {t("settings.themeStudio.discard")}
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2 text-secondary"
              disabled={saving || (!dirty && isActive)}
              onClick={handleSave}
            >
              {saving ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("settings.themeStudio.saveApply")}
            </Button>
          </div>
        </div>

        {(themeVersion === 1 || themeVersion === "1") && (
          <div className="mt-6 flex items-start gap-2 border-l-2 border-yellow-500 pl-3 text-sm text-yellow-600 dark:text-yellow-500">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t("settings.legacyThemeWarning") ||
              "This theme uses an older format and may be missing some color options. Some colors will use default values."}
          </div>
        )}

        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            {/* Tabs */}
            <div className="mb-2 flex gap-1 border-b border-border/60">
              {tabs.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative -mb-px flex items-center gap-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                    tab === item.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {tab === item.id && (
                    <motion.span
                      layoutId="theme-studio-tab"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {tab === "colors" ? (
              <div className="divide-y divide-border/60">
                {/* Readability */}
                <section className="py-7">
                  <h2 className="mb-0 text-lg font-semibold tracking-tight">
                    {t("settings.themeStudio.contrastTitle")}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {t("settings.themeStudio.contrastDescription")}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {contrast.map(([key, ratio]) => (
                      <ContrastCheck
                        key={key}
                        label={t(`settings.themeStudio.contrast.${key}`)}
                        ratio={ratio}
                        t={t}
                      />
                    ))}
                  </div>
                </section>

                {COLOR_GROUPS.map(group => (
                  <section key={group.id} className="py-7">
                    <h2 className="mb-0 text-lg font-semibold tracking-tight">
                      {t(`settings.themeStudio.groups.${group.id}.title`)}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {t(`settings.themeStudio.groups.${group.id}.description`)}
                    </p>
                    <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                      {group.fields.map(([key, labelKey]) => (
                        <ColorField
                          key={key}
                          label={t(`settings.themeStudio.fields.${labelKey}`)}
                          value={colorValue(key)}
                          onChange={rgb => setColor(key, rgb)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <section className="py-7">
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {t("settings.communityThemesDescription")}&nbsp;
                  <a
                    className="inline-flex cursor-pointer items-center text-primary hover:underline"
                    onClick={() =>
                      window.electron.openURL("https://ascendara.app/discord")
                    }
                  >
                    {t("settings.joinDiscord")}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {communityThemes === null
                    ? [0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="aspect-[16/10] rounded-xl" />
                          <Skeleton className="h-3.5 w-2/3" />
                        </div>
                      ))
                    : communityThemes.map((theme, index) => {
                        const swatch = withDefaults(theme.colors || theme);
                        const outdated = theme.version === 1 || theme.version === "1";
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleUseCommunityTheme(theme)}
                            className="group text-left outline-none"
                          >
                            <div
                              className="aspect-[16/10] overflow-hidden rounded-xl p-3 shadow-sm ring-1 ring-border transition-all group-hover:ring-2 group-hover:ring-primary group-focus-visible:ring-2 group-focus-visible:ring-primary"
                              style={{ backgroundColor: `rgb(${swatch.background})` }}
                            >
                              <div
                                className="h-full rounded-lg p-2.5"
                                style={{ backgroundColor: `rgb(${swatch.card})` }}
                              >
                                <div
                                  className="h-2 w-16 rounded-full"
                                  style={{ backgroundColor: `rgb(${swatch.primary})` }}
                                />
                                <div
                                  className="mt-1.5 h-1.5 w-24 rounded-full opacity-50"
                                  style={{ backgroundColor: `rgb(${swatch.foreground})` }}
                                />
                                <div className="mt-4 flex gap-1.5">
                                  {["primary", "accent", "secondary", "muted"].map(
                                    key => (
                                      <span
                                        key={key}
                                        className="h-4 w-4 rounded"
                                        style={{ backgroundColor: `rgb(${swatch[key]})` }}
                                      />
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium">
                                {theme.name || `Theme ${index + 1}`}
                              </p>
                              {outdated && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-yellow-500">
                                  {t("settings.themeStudio.outdated")}
                                </span>
                              )}
                            </div>
                            {theme.author && (
                              <p className="truncate text-xs text-muted-foreground">
                                {t("settings.themeBy") || "by"} {theme.author}
                              </p>
                            )}
                          </button>
                        );
                      })}
                </div>
                {communityThemes?.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {communityFailed
                      ? t("settings.publicThemesFailed") || "Failed to load public themes"
                      : t("settings.noPublicThemes") ||
                        "No community themes available yet."}
                  </p>
                )}
              </section>
            )}
          </div>

          {/* Live preview stays in view while editing */}
          <aside className="lg:sticky lg:top-[84px]">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("settings.colorSection.preview") || "Live Preview"}
            </p>
            <ThemePreview
              colors={colors}
              notificationColor={notificationColor}
              t={t}
              canSendTest={isOnWindows}
              onSendTest={handleSendTest}
            />
          </aside>
        </div>
      </div>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {t("settings.themeStudio.leaveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.themeStudio.leaveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("settings.themeStudio.keepEditing")}
            </AlertDialogCancel>
            <AlertDialogAction className="text-secondary" onClick={leave}>
              {t("settings.themeStudio.discardLeave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ThemeStudio;
