import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Gamepad2, Library, LockKeyhole, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const families = [
  ["Sony", ["ps1", "ps2", "ps3", "psp"]],
  [
    "Nintendo",
    [
      "nes",
      "snes",
      "n64",
      "gamecube",
      "wii",
      "gb",
      "gbc",
      "gba",
      "nds",
      "3ds",
      "wiiu",
      "switch",
    ],
  ],
  ["Microsoft", ["xbox", "xbox360"]],
  ["Sega", ["genesis", "segacd", "sega32x", "saturn", "dreamcast", "naomi"]],
  ["Other", ["atomiswave", "pcengine"]],
];

export default function RetroConsoles({
  platforms,
  profiles,
  games,
  selected,
  onSelect,
  access,
  onExplore,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const counts = new Map();
  for (const game of games)
    if (!game.missing) counts.set(game.platform, (counts.get(game.platform) || 0) + 1);
  const visible = platforms.filter(
    platform =>
      platform.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!configuredOnly || profiles[platform.id]?.executable)
  );
  return (
    <aside className="min-w-0 self-start rounded-2xl border border-border bg-card lg:sticky lg:top-6">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("retro.consoles.label")}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {platforms.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="h-9 bg-background pl-9 text-sm"
            placeholder={t("retro.layout.findConsole")}
            aria-label={t("retro.layout.findConsole")}
          />
        </div>
        <div className="flex rounded-lg bg-muted/50 p-1">
          {[false, true].map(value => (
            <button
              key={String(value)}
              onClick={() => setConfiguredOnly(value)}
              aria-pressed={configuredOnly === value}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${configuredOnly === value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(value ? "retro.layout.configured" : "retro.expanded.all")}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSelect("all")}
          aria-pressed={selected === "all"}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === "all" ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
        >
          <Library className="h-4 w-4" />
          {t("retro.filters.allConsoles")}
        </button>
      </div>
      <nav
        aria-label={t("retro.consoles.label")}
        className="max-h-64 space-y-4 overflow-y-auto border-t border-border p-3 lg:max-h-[calc(100vh-23rem)]"
      >
        {families.map(([family, ids]) => {
          const entries = visible.filter(platform => ids.includes(platform.id));
          if (!entries.length) return null;
          return (
            <div key={family}>
              <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`retro.families.${family}`)}
              </h3>
              {entries.map(platform => {
                const locked = platform.ascend && !access.allowed;
                return (
                  <button
                    key={platform.id}
                    onClick={() => (locked ? onExplore() : onSelect(platform.id))}
                    aria-pressed={selected === platform.id}
                    title={locked ? t("retro.layout.ascendOnly") : platform.name}
                    className={`my-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === platform.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                  >
                    <Gamepad2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1">{platform.name}</span>
                    {locked ? (
                      <>
                        <LockKeyhole className="h-3 w-3 shrink-0" />
                        <span className="sr-only">{t("retro.layout.ascendOnly")}</span>
                      </>
                    ) : (
                      <span className="text-xs tabular-nums opacity-70">
                        {counts.get(platform.id) || 0}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {!visible.length && (
          <p className="px-3 py-5 text-sm text-muted-foreground">
            {t("retro.layout.noConsoles")}
          </p>
        )}
      </nav>
    </aside>
  );
}
