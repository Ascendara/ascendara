import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Search, ImagePlus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettings } from "@/context/SettingsContext";
import usePrivateArtwork from "@/hooks/usePrivateArtwork";
import {
  addToQueue,
  hasActiveDownloads,
} from "@/services/downloadQueueService";
import gameService from "@/services/gameService";
import { toast } from "sonner";

export default function PrivateGameDetails({ initialGame }) {
  const [game, setGame] = useState(initialGame);
  const [revision, setRevision] = useState(0);
  const [matching, setMatching] = useState(false);
  const [query, setQuery] = useState(game.game);
  const [description, setDescription] = useState(
    game.privateMetadata?.description || "",
  );
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState(0);
  const { settings } = useSettings();
  const navigate = useNavigate();
  const source = game.privateSource;
  const image = usePrivateArtwork(source, revision);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const update = async (override) => {
    const catalog = await window.electron.privateSources.match(
      source.sourceId,
      source.entryId,
      override,
    );
    const next = catalog.games.find(
      (g) => g.privateSource.entryId === source.entryId,
    );
    setGame(next);
    setQuery(next.game);
    setDescription(next.privateMetadata?.description || "");
    setRevision((v) => v + 1);
    gameService.notifySourceChanged();
    setMatching(false);
  };
  const download = async (queued) => {
    if (queued && (await hasActiveDownloads())) {
      addToQueue({
        url: `private:${source.sourceId}:${source.entryId}`,
        gameName: game.game,
        size: game.size,
        additionalDirIndex: directory,
        privateSource: source,
      });
      toast.success("Added to the download queue");
    } else {
      await window.electron.privateSources.download(
        source.sourceId,
        source.entryId,
        directory,
      );
    }
    navigate("/downloads");
  };
  const metadata = game.privateMetadata || {};
  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative flex min-h-64 items-end bg-gradient-to-br from-primary/20 via-muted to-background p-8">
          {image && (
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="relative space-y-3">
            <Badge variant="secondary">
              <Server className="mr-2 h-3 w-3" />
              Private · {game.releasedBy}
            </Badge>
            <h1 className="text-4xl font-bold">{game.game}</h1>
            <p className="text-muted-foreground">
              {game.packageType.toUpperCase()} · {game.size}
            </p>
          </div>
        </div>
        <div className="grid gap-8 p-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <p className="whitespace-pre-wrap text-muted-foreground">
              {metadata.description ||
                "No description yet. Match this package to a game, or add your own details."}
            </p>
            <div className="flex flex-wrap gap-2">
              {metadata.genres?.map((g) => (
                <Badge key={g} variant="outline">
                  {g}
                </Badge>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Released", metadata.releaseDate],
                ["Developer", metadata.developer],
                ["Publisher", metadata.publisher],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setMatching(true)}
              >
                <Search className="mr-2 h-4 w-4" />
                Match Game / Edit details
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await window.electron.privateSources.uploadArt(
                      source.sourceId,
                      source.entryId,
                    );
                    setRevision((v) => v + 1);
                  })
                }
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload artwork
              </Button>
            </div>
            {game.privateMatch === "needs-review" && (
              <p className="text-sm text-amber-600">
                No unambiguous match was found. Choose a candidate in Match
                Game.
              </p>
            )}
            {metadata.screenshots?.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {metadata.screenshots.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt="Game screenshot"
                    loading="lazy"
                    className="rounded-lg"
                  />
                ))}
              </div>
            )}
          </div>
          <aside className="space-y-4 rounded-xl border bg-background/50 p-5">
            <h2 className="font-semibold">Download package</h2>
            <Label htmlFor="private-destination">Library destination</Label>
            <select
              id="private-destination"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={directory}
              onChange={(e) => setDirectory(Number(e.target.value))}
            >
              {[
                settings.downloadDirectory,
                ...(settings.additionalDirectories || []),
              ].map((dir, i) => (
                <option key={i} value={i}>
                  {dir || "Choose a download folder in Settings"}
                </option>
              ))}
            </select>
            <Button
              className="w-full gap-2 text-secondary"
              disabled={busy || !settings.downloadDirectory}
              onClick={() => run(() => download(true))}
            >
              <Download className="h-4 w-4" />
              {busy ? "Preparing…" : "Download / Queue"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy || !settings.downloadDirectory}
              onClick={() => run(() => download(false))}
            >
              Start concurrently
            </Button>
            <p className="text-xs text-muted-foreground">
              Downloads appear in the normal Download Manager. Packages require
              review before installation. Executables are never started
              automatically. ISO mounting is performed manually using your
              operating system.
            </p>
          </aside>
        </div>
      </section>
      <Dialog open={matching} onOpenChange={setMatching}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match Game</DialogTitle>
            <DialogDescription>
              Search sends this title directly to Steam. Select a result only if
              it identifies your package correctly, or save your own title and
              description.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="private-title">Title / search</Label>
          <div className="flex gap-2">
            <Input
              id="private-title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              className="text-secondary"
              disabled={busy || !query.trim()}
              onClick={() =>
                run(async () => {
                  const items =
                    await window.electron.privateSources.search(query);
                  setCandidates(items);
                  if (!items.length) toast.info("No matches found");
                })
              }
            >
              Search Steam
            </Button>
          </div>
          <Label htmlFor="private-description">Description</Label>
          <textarea
            id="private-description"
            className="min-h-24 rounded-md border bg-background p-3 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy || !query.trim()}
            onClick={() => run(() => update({ title: query, description }))}
          >
            Save custom details
          </Button>
          <div className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                className="flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                onClick={() => run(() => update({ steamId: c.id }))}
              >
                <img
                  src={c.image}
                  alt=""
                  className="h-16 w-32 rounded object-cover"
                />
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(c.confidence * 100)}% title similarity
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
