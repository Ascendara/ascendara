import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAuthToken } from "@/components/download/ReportGameDialog";
import { Check, ChevronLeft, ImageOff, Loader, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_URL } from "@/config/api";

// A game's artwork can be corrected once a day from this install
const CORRECTED_GAMES_KEY = "ascendara_artwork_corrections";
const CORRECTION_REPEAT_MS = 24 * 60 * 60 * 1000;

const loadCorrectedGames = () => {
  try {
    const corrected = JSON.parse(localStorage.getItem(CORRECTED_GAMES_KEY)) || {};
    const cutoff = Date.now() - CORRECTION_REPEAT_MS;
    return Object.fromEntries(
      Object.entries(corrected).filter(([, time]) => time > cutoff)
    );
  } catch (e) {
    return {};
  }
};

export const hasCorrectedArtwork = gameData =>
  !!gameData?.gameID && String(gameData.gameID) in loadCorrectedGames();

const rememberCorrectedArtwork = gameData => {
  try {
    localStorage.setItem(
      CORRECTED_GAMES_KEY,
      JSON.stringify({ ...loadCorrectedGames(), [gameData.gameID]: Date.now() })
    );
  } catch (e) {
    // Storage disabled - the server dedupes repeat submissions anyway
  }
};

export default function ArtworkCorrectionDialog({ open, onOpenChange, gameData }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState(gameData.game);
  const [games, setGames] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [loadingArtwork, setLoadingArtwork] = useState(false);
  const [selectedGrid, setSelectedGrid] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const search = async term => {
    if (!term.trim()) return;
    setSearching(true);
    try {
      const results = await window.electron.searchSteamGridGames(term);
      if (!results) throw new Error("Search failed");
      setGames(results);
    } catch (error) {
      console.error("Artwork search failed:", error);
      toast.error(t("download.artworkCorrection.searchFailed"));
      setGames([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setQuery(gameData.game);
    setSelectedGame(null);
    setArtwork(null);
    setSelectedGrid(null);
    setGames(null);
    search(gameData.game);
  }, [open, gameData.game]);

  const chooseGame = async game => {
    setSelectedGame(game);
    setArtwork(null);
    setSelectedGrid(null);
    setLoadingArtwork(true);
    try {
      const result = await window.electron.getSteamGridGameArtwork(game.id);
      if (!result) throw new Error("Artwork lookup failed");
      setArtwork(result);
      // Nothing to choose between when there is only one cover
      if (result.grids.length === 1) setSelectedGrid(result.grids[0]);
    } catch (error) {
      console.error("Artwork lookup failed:", error);
      toast.error(t("download.artworkCorrection.searchFailed"));
      setSelectedGame(null);
    } finally {
      setLoadingArtwork(false);
    }
  };

  const canSubmit =
    !!selectedGame && !!artwork && (selectedGrid || artwork.grids.length === 0);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const body = JSON.stringify({
        gameID: gameData.gameID,
        sgdbGameId: selectedGame.id,
        sgdbGameName: selectedGame.name,
        ...(selectedGrid && { gridId: selectedGrid.id, gridUrl: selectedGrid.url }),
        ...(artwork.hero && { heroId: artwork.hero.id, heroUrl: artwork.hero.url }),
      });
      const submit = async () =>
        fetch(`${API_URL}/app/artwork/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await fetchAuthToken()}`,
          },
          body,
        });

      let response = await submit();
      // If token is expired or invalid, try once more with a new token
      if (response.status === 401) {
        response = await submit();
      }
      if (response.status === 429) {
        toast.error(t("download.toast.reportRateLimited"));
        onOpenChange(false);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to submit artwork correction");
      }

      rememberCorrectedArtwork(gameData);
      toast.success(t("download.artworkCorrection.submitted"));
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting artwork correction:", error);
      toast.error(t("download.artworkCorrection.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("download.artworkCorrection.title")}: {gameData.game}
          </DialogTitle>
          <DialogDescription>
            {selectedGame
              ? t("download.artworkCorrection.chooseCover")
              : t("download.artworkCorrection.chooseGame")}
          </DialogDescription>
        </DialogHeader>

        {!selectedGame ? (
          <div className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                search(query);
              }}
            >
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="text-foreground"
              />
              <Button
                type="submit"
                className="gap-2 text-secondary"
                disabled={searching || !query.trim()}
              >
                {searching ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("download.artworkCorrection.search")}
              </Button>
            </form>

            {games?.length === 0 && !searching && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("download.artworkCorrection.noMatches")}
              </p>
            )}
            <div className="space-y-2">
              {games?.map(game => (
                <button
                  key={game.id}
                  type="button"
                  disabled={loadingArtwork}
                  className="flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left text-foreground transition-colors hover:bg-accent"
                  onClick={() => chooseGame(game)}
                >
                  <span className="font-medium">{game.name}</span>
                  {game.year && (
                    <span className="text-xs text-muted-foreground">{game.year}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setSelectedGame(null)}
            >
              <ChevronLeft className="h-4 w-4" />
              {selectedGame.name}
            </Button>

            {loadingArtwork && (
              <div className="flex justify-center py-10">
                <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {artwork?.grids.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <ImageOff className="h-6 w-6" />
                {t("download.artworkCorrection.noCovers")}
              </div>
            )}
            {artwork?.grids.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {artwork.grids.map(grid => {
                  const selected = selectedGrid?.id === grid.id;
                  return (
                    <button
                      key={grid.id}
                      type="button"
                      className={`relative aspect-[2/3] overflow-hidden rounded-lg border-2 transition-all ${
                        selected
                          ? "border-primary"
                          : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      onClick={() => setSelectedGrid(grid)}
                    >
                      <img
                        src={grid.thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {selected && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-secondary">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="text-secondary"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("download.submitting")}
              </>
            ) : (
              t("download.artworkCorrection.submit")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
