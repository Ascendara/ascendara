import { useEffect, useState } from "react";
import {
  Bell,
  Languages,
  MonitorCog,
  Download,
  Gamepad2,
  HardDrive,
  UserRound,
  Cloud,
  Smartphone,
  Users,
  ChevronRight,
  Check,
  Sparkles,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { baseLanguages, getAvailableLanguages } from "@/services/app/languageService";
import { SurfaceButton, useSurface } from "./Surface";
import { BigPictureShell } from "./BigPictureShell";

const categories = [
  {
    name: "General",
    icon: Bell,
    description: "Everyday app behavior",
    options: [
      [
        "indexes",
        "Game indexes",
        "Refresh local and cloud indexes, manage sources and automatic updates.",
      ],
      ["notifications", "Notifications", "Show app and download notifications."],
      [
        "notificationSounds",
        "Notification sounds",
        "Play a sound with each notification.",
      ],
      [
        "autoUpdate",
        "Ascendara updates",
        "Download and install new versions of Ascendara automatically.",
      ],
      [
        "hideOnGameLaunch",
        "Hide on launch",
        "Move Ascendara out of the way when you play.",
      ],
      ["rpcEnabled", "Discord activity", "Share what you are playing on Discord."],
    ],
  },
  {
    name: "Downloads",
    icon: Download,
    description: "Installation preferences",
    options: [
      [
        "autoCreateShortcuts",
        "Game shortcuts",
        "Create a shortcut when a game is installed.",
      ],
      ["singleStream", "Single-stream downloads", "Use one stream for each download."],
      [
        "prioritizeTorboxOverSeamless",
        "Prefer TorBox",
        "Use your configured TorBox provider when available.",
      ],
    ],
  },
  {
    name: "Motion & Effects",
    icon: Sparkles,
    description: "Performance and animation options",
    options: [
      [
        "reduceEffects",
        "Reduce effects",
        "Turn off blur, page transitions and looping animations to use less CPU and GPU. Useful on lower-end PCs or while gaming.",
      ],
      [
        "smoothTransitions",
        "Smooth transitions",
        "Animate page changes, the startup splash and the Ascend celebration.",
      ],
    ],
  },
  {
    name: "Big Picture",
    icon: Gamepad2,
    description: "Startup and controller experience",
    options: [
      [
        "bigPictureHomeStyle",
        "Home style",
        "Ascendara offers a full dashboard. Classic puts your games in a simple cinematic carousel.",
      ],
      ["startup", "Start in Big Picture", "Open this experience when Ascendara starts."],
      [
        "bigPictureSounds",
        "Interface sounds",
        "Play soft sounds as you move, select and switch pages with a controller or keyboard.",
      ],
      [
        "controller",
        "Controller & keyboard",
        "Choose button prompts and on-screen keyboard layout.",
      ],
    ],
  },
  {
    name: "Language",
    icon: Languages,
    description: "The language Ascendara uses",
    options: [],
  },
  {
    name: "Storage",
    icon: HardDrive,
    description: "Where your games are stored",
    options: [],
  },
  {
    name: "Accounts & setup",
    icon: MonitorCog,
    description:
      "Debrid accounts, torrents, Proton and Wine, download speed and download locations are set up in the regular Ascendara view. It works in Steam Deck Game Mode too, no need to switch to Desktop Mode.",
    options: [
      [
        "openDesktop",
        "Open the regular view",
        "Leave Big Picture to change these. Come back any time from the menu.",
      ],
    ],
  },
];

const LINKS = ["controller", "indexes", "openDesktop"];

export function PreferencesSurface({
  navigation,
  active,
  onBack,
  openController,
  openIndexes,
  openDesktop,
  profile = false,
}) {
  const { settings, updateSetting } = useSettings();
  const { language, changeLanguage } = useLanguage();
  const { user, userData, isAuthenticated, loading } = useAuth();
  const [category, setCategory] = useState("General");
  const [languages, setLanguages] = useState(() =>
    Object.entries(baseLanguages).map(([id, info]) => ({ id, ...info }))
  );
  // Unknown until asked: portable and some Linux builds can not update themselves
  const [canAutoUpdate, setCanAutoUpdate] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getAvailableLanguages()
      .then(list => !cancelled && setLanguages(list))
      .catch(() => {});
    Promise.resolve(window.electron?.getAutomaticUpdateCapability?.())
      .then(capability => !cancelled && setCanAutoUpdate(capability || null))
      .catch(() => !cancelled && setCanAutoUpdate({ supported: false }));
    return () => {
      cancelled = true;
    };
  }, []);
  const selected = categories.find(item => item.name === category);
  const options =
    category === "Language"
      ? languages.map(lang => [
          `lang-${lang.id}`,
          lang.name,
          lang.nativeName !== lang.name ? lang.nativeName : "",
        ])
      : selected.options;
  // Options start on the selected category's row, so Right always lands on the first
  const offset = categories.indexOf(selected);
  const rows = profile
    ? []
    : Array.from(
        { length: Math.max(categories.length, offset + options.length) },
        (_, i) =>
          [
            categories[i] && `category-${categories[i].name}`,
            options[i - offset]?.[0],
          ].filter(Boolean)
      );
  const { root, focus } = useSurface(navigation, rows, onBack, active);
  // Reduce Effects already turns page transitions off, so the saved
  // Smooth transitions value is kept but shown off and locked
  const locked = key =>
    (key === "smoothTransitions" && settings.reduceEffects === true) ||
    (key === "autoUpdate" && canAutoUpdate !== null && !canAutoUpdate.supported);
  const lockedReason = key =>
    key === "autoUpdate"
      ? canAutoUpdate?.reason === "portable"
        ? "Portable copies do not update automatically. Download new versions from the release page."
        : "Automatic updates are not available for this build."
      : "Turned off by Reduce effects. Your choice comes back when it is turned off.";
  const isLanguage = key => key.startsWith("lang-");
  const enabled = key =>
    isLanguage(key)
      ? language === key.slice(5)
      : key === "startup"
        ? settings.defaultOpenPage === "bigpicture"
        : !locked(key) && !!settings[key];
  const toggle = key =>
    locked(key)
      ? undefined
      : isLanguage(key)
        ? changeLanguage(key.slice(5)).catch(() => {})
        : key === "bigPictureHomeStyle"
          ? updateSetting(key, settings[key] === "classic" ? "ascendara" : "classic")
          : key === "indexes"
            ? openIndexes()
            : key === "controller"
              ? openController()
              : key === "openDesktop"
                ? openDesktop?.()
                : key === "startup"
                  ? updateSetting("defaultOpenPage", enabled(key) ? "home" : "bigpicture")
                  : updateSetting(key, !settings[key]);
  return (
    <BigPictureShell
      ref={root}
      className={profile ? "bp-profile" : "bp-preferences"}
      title={profile ? "Profile" : "Settings"}
      focus={focus}
    >
      {profile ? (
        <>
          <div className="bp-profile-identity">
            <div className="bp-profile-avatar">
              <UserRound />
            </div>
            <div>
              <h2>
                {loading
                  ? "Loading account..."
                  : userData?.username || user?.displayName || "Your account"}
              </h2>
              <span className="bp-status">
                {isAuthenticated ? "Signed in" : "Not signed in"}
              </span>
            </div>
          </div>
          {!isAuthenticated && (
            <p className="bp-muted">
              Sign in from Ascendara desktop to connect your account.
            </p>
          )}
          <div className="bp-profile-features">
            {[
              [
                Cloud,
                "Ascend",
                userData?.ascendSubscription?.active
                  ? "Subscription active"
                  : "Ascend features",
                userData?.ascendSubscription?.active
                  ? "Individual features verify access when used."
                  : "Cloud backups and expanded Retro platforms require Ascend access.",
              ],
              [
                Smartphone,
                "Companion",
                "Manage on desktop",
                "Pair devices and manage connections in the Ascend Companion workspace.",
              ],
              [
                Users,
                "Account & social",
                "Manage on desktop",
                "Profile editing, account security, friends and messages are available in desktop Ascend.",
              ],
            ].map(([Icon, title, status, description]) => (
              <article className="bp-feature" key={title}>
                <Icon />
                <h2>{title}</h2>
                <span className="bp-status">{status}</span>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="bp-settings-layout">
          <nav className="bp-category-nav" aria-label="Settings categories">
            {categories.map(({ name, icon: Icon }) => (
              <SurfaceButton
                key={name}
                {...focus(`category-${name}`)}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                <Icon />
                <span>{name}</span>
                <ChevronRight />
              </SurfaceButton>
            ))}
          </nav>
          <div className="bp-settings-panel">
            <header>
              <h2>{category}</h2>
              <p>{selected.description}</p>
            </header>
            <div className="bp-setting-list">
              {options.map(([key, label, description]) => (
                <SurfaceButton
                  className="bp-setting-row"
                  key={key}
                  {...focus(key)}
                  {...(isLanguage(key)
                    ? { role: "radio", "aria-checked": enabled(key) }
                    : ![...LINKS, "bigPictureHomeStyle"].includes(key)
                      ? { role: "switch", "aria-checked": enabled(key) }
                      : {})}
                  aria-disabled={locked(key) || undefined}
                  onClick={() => toggle(key)}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{locked(key) ? lockedReason(key) : description}</small>
                  </span>
                  {key === "bigPictureHomeStyle" ? (
                    <span>
                      {settings.bigPictureHomeStyle === "classic"
                        ? "Classic"
                        : "Ascendara"}
                    </span>
                  ) : LINKS.includes(key) ? (
                    <ChevronRight />
                  ) : isLanguage(key) ? (
                    <span aria-hidden="true">{enabled(key) && <Check />}</span>
                  ) : (
                    <span
                      className="bp-toggle"
                      data-enabled={enabled(key)}
                      aria-hidden="true"
                    >
                      <span>{enabled(key) && <Check size={14} />}</span>
                    </span>
                  )}
                </SurfaceButton>
              ))}
            </div>
            {category === "Storage" && (
              <div className="bp-storage-list">
                <article>
                  <HardDrive />
                  <div>
                    <h3>Primary location</h3>
                    <p>
                      {settings.downloadDirectory || "No download directory configured"}
                    </p>
                  </div>
                </article>
                {settings.additionalDirectories?.map((path, index) => (
                  <article key={`${path}-${index}`}>
                    <HardDrive />
                    <div>
                      <h3>Additional location</h3>
                      <p>{path}</p>
                    </div>
                  </article>
                ))}
                <p className="bp-muted">
                  Manage download locations in the regular Ascendara view.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </BigPictureShell>
  );
}
