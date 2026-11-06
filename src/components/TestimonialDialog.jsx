import { useEffect, useState } from "react";
import { Quote, Globe, Loader2, Send, Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { API_URL } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { verifyAscendAccess } from "@/services/firebase/firebaseService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DeveloperSignature from "@/components/DeveloperSignature";

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_GAME = "__none__";

// Whole hours past 10, one decimal below so short sessions still read as time
const toHours = seconds => {
  const hours = seconds / 3600;
  return hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
};

// Installed and custom games with recorded playtime, most played first
const loadPlayedGames = async () => {
  const [installed, custom] = await Promise.all([
    window.electron.getGames().catch(() => []),
    window.electron.getCustomGames().catch(() => []),
  ]);
  const seen = new Set();
  return [...(installed || []), ...(custom || [])]
    .filter(game => game?.game && game.playTime >= 60 && !seen.has(game.game))
    .map(game => {
      seen.add(game.game);
      return { name: game.game, playTime: game.playTime };
    })
    .sort((a, b) => b.playTime - a.playTime);
};

const TestimonialDialog = ({ installedAt, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState(user?.displayName || "");
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [playedGames, setPlayedGames] = useState([]);
  const [featuredGame, setFeaturedGame] = useState(NO_GAME);

  useEffect(() => {
    loadPlayedGames()
      .then(games => {
        setPlayedGames(games);
        if (games.length) setFeaturedGame(games[0].name);
      })
      .catch(error => console.error("Error loading played games:", error));
  }, []);

  const trimmed = review.trim();
  const canSubmit = trimmed.length >= MIN_LENGTH && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const authHeaders = await window.electron.getAuthHeaders();
      const tokenResponse = await fetch(`${API_URL}/auth/token`, {
        headers: authHeaders,
      });
      const { token } = await tokenResponse.json();
      if (!token) throw new Error("No auth token available");

      let hasAscend = false;
      if (user) {
        const hardwareId = (await window.electron.getHardwareId?.()) ?? null;
        const access = await verifyAscendAccess(hardwareId).catch(() => null);
        hasAscend = !!access?.hasAccess;
      }

      const featured = playedGames.find(game => game.name === featuredGame);
      const totalPlayTime = playedGames.reduce((sum, game) => sum + game.playTime, 0);

      const response = await fetch(`${API_URL}/app/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "testimonial",
          review: trimmed,
          name: name.trim() || null,
          installedAt,
          daysWithAscendara: Math.floor((Date.now() - installedAt) / DAY_MS),
          hasAscend,
          featuredGame: featured
            ? {
                name: featured.name,
                playTime: featured.playTime,
                hours: toHours(featured.playTime),
                isMostPlayed: featured.name === playedGames[0].name,
              }
            : null,
          totalHours: toHours(totalPlayTime),
          gamesPlayed: playedGames.length,
          uid: user?.uid || null,
        }),
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      toast.success(t("app.testimonialDialog.thanks"), {
        description: t("app.testimonialDialog.thanksDesc"),
      });
      onClose();
    } catch (error) {
      console.error("Error sending testimonial:", error);
      toast.error(t("app.testimonialDialog.failed"), {
        description: t("app.testimonialDialog.failedDesc"),
      });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && !submitting && onClose()}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden border-border/60 bg-card p-0 sm:rounded-2xl">
        <div className="grid md:grid-cols-[5fr_7fr]">
          {/* Intro */}
          <div className="relative flex flex-col border-b border-border/60 bg-muted/20 px-6 py-8 md:border-b-0 md:border-r">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent"
            />
            <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <Quote className="h-6 w-6" aria-hidden="true" />
            </div>
            <DialogTitle className="relative text-xl font-bold text-foreground">
              {t("app.testimonialDialog.title")}
            </DialogTitle>
            <DialogDescription className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("app.testimonialDialog.message")}
            </DialogDescription>

            {/* Personal note */}
            <figure className="relative mt-6 md:mt-auto md:pt-6">
              <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-muted-foreground">
                {t("app.testimonialDialog.note")}
              </blockquote>
              <figcaption className="mt-3 flex justify-end">
                <DeveloperSignature
                  title={t("ascend.settings.pages.profile.signatureAlt")}
                  className="h-auto w-28 text-foreground/80"
                />
              </figcaption>
            </figure>
          </div>

          {/* Review */}
          <div className="flex flex-col gap-3 px-6 py-8">
            <Input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 50))}
              placeholder={t("app.testimonialDialog.namePlaceholder")}
              disabled={submitting}
            />
            <div className="relative flex-1">
              <Textarea
                value={review}
                onChange={e => setReview(e.target.value.slice(0, MAX_LENGTH))}
                placeholder={t("app.testimonialDialog.reviewPlaceholder")}
                disabled={submitting}
                className="h-full min-h-[160px] resize-none"
                autoFocus
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground">
                {review.length}/{MAX_LENGTH}
              </span>
            </div>
            {playedGames.length > 0 && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Gamepad2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("app.testimonialDialog.featuredGame")}
                </label>
                <Select
                  value={featuredGame}
                  onValueChange={setFeaturedGame}
                  disabled={submitting}
                >
                  <SelectTrigger aria-label={t("app.testimonialDialog.featuredGame")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {playedGames.map((game, index) => (
                      <SelectItem key={game.name} value={game.name}>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{game.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t("app.testimonialDialog.hours", {
                              hours: toHours(game.playTime),
                            })}
                            {index === 0 && ` · ${t("app.testimonialDialog.mostPlayed")}`}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value={NO_GAME}>
                      {t("app.testimonialDialog.noGame")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Globe
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                {t("app.testimonialDialog.websiteNote")}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 whitespace-nowrap text-primary"
              >
                {t("app.testimonialDialog.notNow")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 gap-2 whitespace-nowrap text-secondary"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {t("app.testimonialDialog.submit")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TestimonialDialog;
