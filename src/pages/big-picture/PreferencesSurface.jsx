import { useState } from "react";
import {
  Bell,
  Download,
  Gamepad2,
  HardDrive,
  UserRound,
  Cloud,
  Smartphone,
  Users,
  ChevronRight,
  Check,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { SurfaceButton, useSurface } from "./Surface";
import { BigPictureShell } from "./BigPictureShell";

const categories = [
  {
    name: "General",
    icon: Bell,
    description: "Everyday app behavior",
    options: [
      [
        "notifications",
        "Notifications",
        "Show app and download notifications.",
      ],
      [
        "hideOnGameLaunch",
        "Hide on launch",
        "Move Ascendara out of the way when you play.",
      ],
      [
        "rpcEnabled",
        "Discord activity",
        "Share what you are playing on Discord.",
      ],
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
      [
        "singleStream",
        "Single-stream downloads",
        "Use one stream for each download.",
      ],
      [
        "prioritizeTorboxOverSeamless",
        "Prefer TorBox",
        "Use your configured TorBox provider when available.",
      ],
    ],
  },
  {
    name: "Big Picture",
    icon: Gamepad2,
    description: "Startup and controller experience",
    options: [
      [
        "smoothTransitions",
        "Smooth transitions",
        "Animate transitions throughout Ascendara.",
      ],
      [
        "startup",
        "Start in Big Picture",
        "Open this experience when Ascendara starts.",
      ],
      [
        "controller",
        "Controller & keyboard",
        "Choose button prompts and on-screen keyboard layout.",
      ],
    ],
  },
  {
    name: "Storage",
    icon: HardDrive,
    description: "Where your games are stored",
    options: [],
  },
];

export function PreferencesSurface({
  navigation,
  active,
  onBack,
  openController,
  profile = false,
}) {
  const { settings, updateSetting } = useSettings();
  const { user, userData, isAuthenticated, loading } = useAuth();
  const [category, setCategory] = useState("General");
  const selected = categories.find((item) => item.name === category);
  const options = selected.options;
  const rows = profile
    ? []
    : Array.from(
        { length: Math.max(categories.length, options.length) },
        (_, i) =>
          [
            categories[i] && `category-${categories[i].name}`,
            options[i]?.[0],
          ].filter(Boolean),
      );
  const { root, focus } = useSurface(navigation, rows, onBack, active);
  const enabled = (key) =>
    key === "startup"
      ? settings.defaultOpenPage === "bigpicture"
      : !!settings[key];
  const toggle = (key) =>
    key === "controller"
      ? openController()
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
                  {...(key !== "controller"
                    ? { role: "switch", "aria-checked": enabled(key) }
                    : {})}
                  onClick={() => toggle(key)}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  {key === "controller" ? (
                    <ChevronRight />
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
                      {settings.downloadDirectory ||
                        "No download directory configured"}
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
                  Manage download locations in desktop Settings.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </BigPictureShell>
  );
}
