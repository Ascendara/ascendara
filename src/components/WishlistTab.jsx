import { memo, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  Bell,
  Bookmark,
  EyeOff,
  ExternalLink,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  isWishlistAlertsEnabled,
  matchWishlistToCatalog,
  setWishlistAlertsEnabled,
} from "@/services/ascend/wishlistWatchService";

// Steam's portrait capsule, falling back to the wide header for games that
// don't have one yet (announced games often only have the header)
const capsules = id => [
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
];

const WishlistGameCard = memo(({ item, game }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [source, setSource] = useState(0);
  const images = capsules(item.id);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-lg transition-all duration-200",
        game ? "border-primary/40" : "border-border",
        "press hover:-translate-y-1 hover:shadow-xl"
      )}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden bg-muted">
          {source < images.length ? (
            <img
              src={images[source]}
              alt={item.name}
              loading="lazy"
              draggable={false}
              onError={() => setSource(index => index + 1)}
              className={cn(
                "h-full w-full border-b border-border",
                source === 0 ? "object-cover" : "object-contain",
                !game && "opacity-70 grayscale-[35%]"
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <span
            className={cn(
              "absolute left-2 top-2 z-20 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
              game ? "bg-primary text-secondary" : "bg-black/60 text-white"
            )}
          >
            {game ? <Sparkles className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
            {game ? t("library.wishlist.available") : t("library.wishlist.watching")}
          </span>
          <button
            onClick={() =>
              window.electron.openURL(`https://store.steampowered.com/app/${item.id}/`)
            }
            className="absolute right-2 top-2 z-20 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
            title={t("library.wishlist.openSteam")}
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 px-3 py-2">
        <h3
          className="w-full truncate text-sm font-semibold leading-tight text-foreground"
          title={item.name}
        >
          {item.name}
        </h3>
        {item.addedAt && (
          <p className="text-xs text-muted-foreground">
            {t("library.wishlist.addedOn", {
              date: new Date(item.addedAt).toLocaleDateString(),
            })}
          </p>
        )}
        {game ? (
          <Button
            className="w-full gap-2 text-secondary"
            onClick={() =>
              navigate("/download", {
                state: { gameData: { ...game, download_links: game.download_links || {} } },
              })
            }
          >
            <ArrowDown className="h-4 w-4" />
            {t("library.wishlist.download")}
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            {t("library.wishlist.notYet")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
});

WishlistGameCard.displayName = "WishlistGameCard";

function EmptyPanel({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Icon className="mb-4 h-12 w-12 text-muted-foreground/30" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Library tab for the Ascend Steam wishlist feature: everything on the
// wishlist, with the games already on Ascendara first
export default function WishlistTab({ hasAscend, steamAccount, onConnectSteam, onHide }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [matches, setMatches] = useState(() => new Map());
  const [alerts, setAlerts] = useState(isWishlistAlertsEnabled);
  const [filter, setFilter] = useState("all");
  const wishlist = useMemo(() => steamAccount?.wishlist || [], [steamAccount]);

  useEffect(() => {
    if (!hasAscend || !wishlist.length) return;
    let cancelled = false;
    const load = () =>
      matchWishlistToCatalog(wishlist)
        .then(next => !cancelled && setMatches(next))
        .catch(() => {});
    load();
    window.addEventListener("index-refreshed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("index-refreshed", load);
    };
  }, [hasAscend, wishlist]);

  const sorted = useMemo(
    () =>
      [...wishlist].sort(
        (a, b) =>
          Number(matches.has(b.id)) - Number(matches.has(a.id)) ||
          (b.addedAt || "").localeCompare(a.addedAt || "")
      ),
    [wishlist, matches]
  );
  const shown = filter === "available" ? sorted.filter(item => matches.has(item.id)) : sorted;

  if (!hasAscend) {
    return (
      <EmptyPanel
        icon={Bookmark}
        title={t("library.wishlist.ascendTitle")}
        description={t("library.wishlist.ascendDescription")}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button className="text-secondary" onClick={() => navigate("/ascend")}>
              {t("library.wishlist.getAscend")}
            </Button>
            {onHide && (
              <Button variant="outline" className="gap-2" onClick={onHide}>
                <EyeOff className="h-4 w-4" />
                {t("library.wishlist.hidePage")}
              </Button>
            )}
          </div>
        }
      />
    );
  }

  if (!steamAccount) {
    return (
      <EmptyPanel
        icon={Bookmark}
        title={t("library.wishlist.connectTitle")}
        description={t("library.wishlist.connectDescription")}
        action={
          <Button className="text-secondary" onClick={onConnectSteam}>
            {t("library.wishlist.connect")}
          </Button>
        }
      />
    );
  }

  if (!wishlist.length) {
    return (
      <EmptyPanel
        icon={Bookmark}
        title={t("library.wishlist.empty")}
        description={t("library.wishlist.emptyDescription")}
        action={
          <Button variant="outline" onClick={onConnectSteam}>
            {t("library.wishlist.manage")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
        <div className="flex rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
          {["all", "available"].map(id => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                filter === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {id === "all"
                ? t("library.wishlist.filterAll", { count: wishlist.length })
                : t("library.wishlist.filterAvailable", { count: matches.size })}
            </button>
          ))}
        </div>
        <label
          htmlFor="library-wishlist-alerts"
          className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
          {t("library.wishlist.alerts")}
          <Switch
            id="library-wishlist-alerts"
            checked={alerts}
            onCheckedChange={enabled => {
              if (setWishlistAlertsEnabled(enabled)) setAlerts(enabled);
            }}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyPanel
          icon={Bell}
          title={t("library.wishlist.noneAvailable")}
          description={t("library.wishlist.noneAvailableDescription")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map(item => (
            <WishlistGameCard key={item.id} item={item} game={matches.get(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
