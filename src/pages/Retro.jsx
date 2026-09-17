import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Gamepad2,
  Info,
  Disc3,
  HardDrive,
  ArrowDownWideNarrow,
  ArrowLeft,
  Play,
  Settings2,
  FolderOpen,
  RefreshCw,
  Search,
  Star,
  Cloud,
  Download,
  Upload,
  ImagePlus,
  Loader2,
  Library,
  BookOpen,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams, useNavigate } from "react-router-dom";
import RetroCloudSaves from "@/components/RetroCloudSaves";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { retroCall } from "@/services/retroService";

const emptyProfile = {
  executable: "",
  core: "",
  romFolders: [],
  saveFolder: "",
  fullscreen: true,
};
const dialogStyle =
  "max-h-[85vh] overflow-y-auto border-border bg-background text-sm leading-relaxed text-foreground";
const basename = file => file.split(/[\\/]/).pop();

function RetroSelect({
  label,
  value,
  onValueChange,
  options,
  icon: Icon,
  placeholder,
  className = "",
  disabled = false,
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        className={`h-10 gap-3 rounded-lg border-border bg-background px-3 text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 data-[state=open]:border-primary/60 data-[state=open]:bg-muted/30 [&>svg]:shrink-0 ${className}`}
      >
        <div className="flex min-w-0 items-center gap-2.5 [&>span]:truncate">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          <SelectValue placeholder={placeholder || label} />
        </div>
      </SelectTrigger>
      <SelectContent
        align="start"
        sideOffset={4}
        className="max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-0 rounded-xl border-border bg-background p-1 text-foreground shadow-xl"
      >
        <SelectGroup>
          <SelectLabel className="px-2.5 pb-2 pt-1.5 text-xs font-medium text-muted-foreground">
            {label}
          </SelectLabel>
          {options.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
              textValue={option.label}
              className="my-0.5 cursor-pointer rounded-lg py-2.5 pl-2.5 pr-8 leading-snug text-foreground focus:bg-primary/10 focus:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary [&>span:last-child]:min-w-0 [&>span:last-child]:break-words"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Cover({ game, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.cover]);
  return (
    <div
      className={`flex aspect-[3/4] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 to-muted ${className}`}
    >
      {game.cover && !failed ? (
        <img
          src={game.cover}
          alt={game.title}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Gamepad2 className="h-14 w-14 text-primary/40" />
      )}
    </div>
  );
}

function PathField({ label, value, kind, onChange, help }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          aria-label={label}
          title={value || undefined}
          value={value}
          readOnly
          placeholder={t("retro.setup.notSelected")}
          className="min-w-0 bg-muted/20 text-sm"
        />
        <Button
          variant="outline"
          aria-label={`Browse for ${label}`}
          onClick={async () => {
            try {
              const file = await retroCall("pick", kind);
              if (file) onChange(file);
            } catch (error) {
              toast.error(error.message);
            }
          }}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
        {value && (
          <Button
            variant="ghost"
            aria-label={`Clear ${label}`}
            onClick={() => onChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {help && <p className="text-sm leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}

function ConsoleSetup({ platform, profile, onClose, onSaved, taskBusy }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => ({
    ...emptyProfile,
    adapter: platform.adapter,
    arguments: "",
    ...profile,
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const save = async scan => {
    setBusy(true);
    try {
      await retroCall("saveProfile", platform.id, draft);
      if (scan) await retroCall("scan", platform.id);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className={`${dialogStyle} max-w-2xl`}>
        <DialogHeader className="space-y-2 border-b border-border pb-4 pr-6 text-left">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl font-semibold leading-snug text-foreground">
              {t("retro.setup.title", { name: platform.name })}
            </DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 shrink-0 rounded-full p-0 text-muted-foreground"
                  aria-label={t("retro.setup.recommendedEmulator")}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="z-[10020] space-y-2 border-border bg-background text-sm leading-relaxed text-foreground"
                align="start"
              >
                <p className="font-medium">
                  {t("retro.setup.recommended", { emulator: platform.emulator })}
                </p>
                <p className="text-muted-foreground">{t("retro.setup.anyEmulator")}</p>
                <Button
                  variant="ghost"
                  className="h-auto px-0 text-primary"
                  onClick={() =>
                    retroCall("website", platform.id).catch(error =>
                      toast.error(error.message)
                    )
                  }
                >
                  {t("retro.setup.visitWebsite")}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
          <DialogDescription className="leading-relaxed">
            {t("retro.setup.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
            {t("retro.setup.setupInstructions")}
            {platform.id === "ps3"
              ? t("retro.setup.ps3Instructions")
              : t("retro.setup.romInstructions")}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("retro.setup.launchPresetLabel")}</p>
            <RetroSelect
              label={t("retro.setup.launchPreset")}
              icon={Gamepad2}
              value={draft.adapter}
              onValueChange={value => set("adapter", value)}
              options={[
                { value: "custom", label: t("retro.setup.presetCustom") },
                { value: "duckstation", label: "DuckStation" },
                { value: "pcsx2", label: "PCSX2" },
                { value: "rpcs3", label: "RPCS3" },
                { value: "ppsspp", label: "PPSSPP" },
                { value: "dolphin", label: "Dolphin" },
                { value: "retroarch", label: "RetroArch" },
              ]}
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("retro.setup.presetHint")}
            </p>
          </div>
          <PathField
            label={t("retro.setup.executable")}
            kind="executable"
            value={draft.executable}
            onChange={value => set("executable", value)}
            help={t("retro.setup.executableHelp")}
          />
          {draft.adapter === "custom" && (
            <div className="space-y-2">
              <label htmlFor="retro-custom-arguments" className="text-sm font-medium">
                {t("retro.setup.customArgumentsLabel")}
              </label>
              <textarea
                id="retro-custom-arguments"
                rows={4}
                value={draft.arguments}
                onChange={event => set("arguments", event.target.value)}
                placeholder={"--fullscreen\n{rom}"}
                className="w-full rounded-lg border border-input bg-background p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("retro.setup.customArgumentsHelp", { rom: "{rom}" })}
              </p>
            </div>
          )}
          {draft.adapter === "retroarch" && (
            <PathField
              label={t("retro.setup.core")}
              kind="core"
              value={draft.core}
              onChange={value => set("core", value)}
              help={`${t("retro.setup.coreHelp")}${platform.coreHint ? t("retro.setup.coreHelpSuggested", { hint: platform.coreHint }) : ""}`}
            />
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("retro.setup.romFolders")}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("retro.setup.romFoldersHelp", {
                extensions: platform.extensions.length
                  ? platform.extensions.join(", ")
                  : t("retro.setup.romFoldersFallback"),
              })}
            </p>
            {draft.romFolders.map(folder => (
              <div key={folder} className="flex items-center gap-2 rounded border p-2">
                <span className="min-w-0 flex-1 break-all text-sm leading-relaxed">
                  {folder}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("retro.setup.removeFolder", { folder })}
                  onClick={() =>
                    set(
                      "romFolders",
                      draft.romFolders.filter(f => f !== folder)
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const folder = await retroCall("pick", "romFolder");
                  if (folder)
                    set("romFolders", [...new Set([...draft.romFolders, folder])]);
                } catch (error) {
                  toast.error(error.message);
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("retro.setup.addRomFolder")}
            </Button>
          </div>
          <PathField
            label={t("retro.setup.saveFolder")}
            kind="saveFolder"
            value={draft.saveFolder}
            onChange={value => set("saveFolder", value)}
            help={t("retro.setup.saveFolderHelp")}
          />
          {!["rpcs3", "custom"].includes(draft.adapter) && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <Checkbox
                checked={draft.fullscreen}
                onCheckedChange={checked => set("fullscreen", checked)}
                disabled={busy}
                aria-labelledby="retro-fullscreen-label"
                aria-describedby="retro-fullscreen-description"
                className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => set("fullscreen", !draft.fullscreen)}
                className="space-y-1 text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  id="retro-fullscreen-label"
                  className="block text-sm font-medium text-foreground"
                >
                  {t("retro.setup.fullscreenLabel")}
                </span>
                <span
                  id="retro-fullscreen-description"
                  className="block text-sm leading-relaxed text-muted-foreground"
                >
                  {t("retro.setup.fullscreenHelp")}
                </span>
              </button>
            </div>
          )}
          {["rpcs3", "custom"].includes(draft.adapter) && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("retro.setup.fullscreenCustomHelp")}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              disabled={busy || taskBusy}
              onClick={() => save(false)}
            >
              {t("retro.setup.saveSetup")}
            </Button>
            <Button
              className="text-secondary"
              disabled={busy || taskBusy || !draft.romFolders.length}
              onClick={() => save(true)}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("retro.setup.saveAndScan")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GameDetails({ game, platform, profile, running, onClose, onChanged, onSetup }) {
  const { t } = useTranslation();
  const [disc, setDisc] = useState(0),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(game.title),
    [year, setYear] = useState(game.year || ""),
    [genres, setGenres] = useState(game.genres || "");
  const [query, setQuery] = useState(game.title),
    [matches, setMatches] = useState([]);
  const action = async callback => {
    setBusy(true);
    try {
      await callback();
      onChanged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className={`${dialogStyle} max-w-3xl`}>
        <DialogHeader className="space-y-2 border-b border-border pb-4 pr-6 text-left">
          <DialogTitle className="text-xl font-semibold leading-snug text-foreground">
            {game.title}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {platform.name}
            {game.year ? ` · ${game.year}` : ""}
            {game.genres ? ` · ${game.genres}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="details">
          <TabsList className="mb-4">
            <TabsTrigger value="details" disabled={busy}>
              {t("retro.gameDetails.detailsTab")}
            </TabsTrigger>
            <TabsTrigger value="ascend" disabled={busy}>
              <Cloud className="mr-2 h-4 w-4" />
              {t("retro.gameDetails.ascendTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ascend">
            <RetroCloudSaves
              platform={platform}
              profile={profile}
              running={running}
              onSetup={onSetup}
              onBusyChange={setBusy}
            />
          </TabsContent>
          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
              <Cover game={game} className="rounded-lg" />
              <div className="space-y-4">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {game.description || t("retro.gameDetails.noDescription")}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("retro.gameDetails.stats", {
                    minutes: Math.floor((game.playTime || 0) / 60),
                    launches: game.launchCount || 0,
                  })}
                  {game.lastPlayed
                    ? t("retro.gameDetails.lastPlayed", {
                        date: new Date(game.lastPlayed).toLocaleDateString(),
                      })
                    : ""}
                </p>
                {game.sourceName !== game.title && (
                  <p className="break-all text-sm leading-relaxed text-muted-foreground">
                    {t("retro.gameDetails.importedAs", { name: game.sourceName })}
                  </p>
                )}
                {game.missing && (
                  <p className="text-destructive text-sm">
                    {t("retro.gameDetails.filesMissing")}
                  </p>
                )}
                {!!game.missingDependencies?.length && (
                  <p className="text-destructive text-sm">
                    {t("retro.gameDetails.missingDependency")}
                  </p>
                )}
                {game.files.length > 1 && (
                  <label className="block space-y-1 text-sm">
                    <span>{t("retro.gameDetails.startingDisc")}</span>
                    <RetroSelect
                      label={t("retro.gameDetails.startingDisc")}
                      icon={Disc3}
                      value={String(disc)}
                      onValueChange={value => setDisc(Number(value))}
                      options={game.files.map((file, index) => ({
                        value: String(index),
                        label: basename(file),
                      }))}
                      disabled={busy || running}
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="text-secondary"
                    disabled={busy || running || game.missing}
                    onClick={() => action(() => retroCall("launch", game.id, disc))}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {running
                      ? t("retro.gameDetails.running")
                      : t("retro.gameDetails.play")}
                  </Button>
                  <Button variant="outline" onClick={onSetup}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    {t("retro.gameDetails.consoleSetup")}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t("retro.gameDetails.showFiles")}
                    onClick={() => action(() => retroCall("reveal", game.id))}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                {game.files.length > 1 ||
                game.files.some(file => /\.m3u$/i.test(file)) ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("retro.gameDetails.changeDiscHint")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(!editing)}
              >
                {t("retro.gameDetails.editMatch")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const file = await retroCall("pick", "cover");
                    if (file) await retroCall("setCover", game.id, file);
                  })
                }
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                {t("retro.gameDetails.chooseCover")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy || running}
                onClick={() =>
                  action(async () => {
                    await retroCall("remove", game.id);
                    onClose();
                  })
                }
              >
                {t("retro.gameDetails.remove")}
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("retro.gameDetails.removeHint")}
            </p>
            {editing && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">
                  {t("retro.gameDetails.matchTitle")}
                </p>
                <form
                  className="flex gap-2"
                  onSubmit={event => {
                    event.preventDefault();
                    action(async () =>
                      setMatches(await retroCall("search", game.platform, query))
                    );
                  }}
                >
                  <Input
                    aria-label={t("retro.gameDetails.searchLabel")}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                  />
                  <Button disabled={busy} variant="outline" type="submit">
                    {t("retro.gameDetails.search")}
                  </Button>
                </form>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {matches.map(match => (
                    <button
                      key={match.id}
                      disabled={busy}
                      className="flex w-full justify-between rounded px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={() =>
                        action(async () => {
                          await retroCall("updateGame", game.id, {
                            metadataId: match.id,
                          });
                          setEditing(false);
                        })
                      }
                    >
                      <span>{match.title}</span>
                      <span className="text-muted-foreground">{match.year}</span>
                    </button>
                  ))}
                </div>
                {!matches.length && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("retro.gameDetails.noResults")}
                  </p>
                )}
                <label className="block text-sm">
                  {t("retro.gameDetails.titleLabel")}
                  <Input value={title} onChange={event => setTitle(event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    {t("retro.gameDetails.yearLabel")}
                    <Input
                      value={year}
                      maxLength={4}
                      onChange={event => setYear(event.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    {t("retro.gameDetails.genresLabel")}
                    <Input
                      value={genres}
                      onChange={event => setGenres(event.target.value)}
                    />
                  </label>
                </div>
                <Button
                  className="text-secondary"
                  disabled={busy || !title.trim()}
                  onClick={() =>
                    action(async () => {
                      await retroCall("updateGame", game.id, { title, year, genres });
                      setEditing(false);
                    })
                  }
                >
                  {t("retro.gameDetails.saveDetails")}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SavesDialog({ platform, profile, onClose, onSetup, running }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false),
    [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(""),
    [cardName, setCardName] = useState("");
  const action = async callback => {
    setBusy(true);
    try {
      await callback();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  const localRestore = () =>
    action(async () => {
      const file = await retroCall("pick", "backup");
      if (file) {
        const result = await retroCall("restore", platform.id, file);
        if (result)
          toast.success(t("retro.saves.restoredFiles", { count: result.restored }));
      }
    });
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className={`${dialogStyle} max-w-2xl`}>
        <DialogHeader className="space-y-2 border-b border-border pb-4 pr-6 text-left">
          <DialogTitle className="text-xl font-semibold leading-snug text-foreground">
            {t("retro.saves.title", { name: platform.name })}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t("retro.saves.description")}
          </DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
          {profile?.saveFolder || t("retro.saves.noFolder")}
        </p>
        <p className="text-sm text-muted-foreground">{t("retro.saves.closeEmulator")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="text-secondary"
            disabled={busy || !profile?.saveFolder}
            onClick={() =>
              action(async () => {
                if (await retroCall("backup", platform.id, false))
                  toast.success(t("retro.saves.backupSaved"));
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t("retro.saves.saveBackup")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !profile?.saveFolder}
            onClick={localRestore}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("retro.saves.restoreBackup")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => action(() => retroCall("recoveryFolder"))}
          >
            {t("retro.saves.recoveryCopies")}
          </Button>
        </div>
        <div className="border-t border-border pt-4">
          <RetroCloudSaves
            platform={platform}
            profile={profile}
            onSetup={onSetup}
            running={running || busy}
            onBusyChange={setBusy}
          />
        </div>
        {["ps1", "ps2"].includes(platform.id) && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-medium">{t("retro.saves.memoryCards")}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("retro.saves.memoryCardsHelp")}
            </p>
            <Button
              variant="outline"
              disabled={busy || !profile?.saveFolder}
              onClick={() =>
                action(async () => setCards(await retroCall("cards", platform.id)))
              }
            >
              {t("retro.saves.listCards")}
            </Button>
            {cards.length > 0 && (
              <>
                <RetroSelect
                  label={t("retro.saves.memoryCardLabel")}
                  icon={HardDrive}
                  placeholder={t("retro.saves.selectCard")}
                  value={selectedCard}
                  onValueChange={value => {
                    setSelectedCard(value);
                    setCardName(value);
                  }}
                  options={cards.map(card => ({
                    value: card.name,
                    label: t("retro.saves.cardSizeLabel", {
                      name: card.name,
                      size: Math.round(card.size / 1024),
                    }),
                  }))}
                  disabled={busy}
                />
                <Input
                  aria-label={t("retro.saves.newCardName")}
                  placeholder={t("retro.saves.newCardPlaceholder")}
                  value={cardName}
                  onChange={event => setCardName(event.target.value)}
                />
                <div className="flex gap-2">
                  {[true, false].map(duplicate => (
                    <Button
                      key={String(duplicate)}
                      variant="outline"
                      disabled={
                        busy || !selectedCard || !cardName || selectedCard === cardName
                      }
                      onClick={() =>
                        action(async () => {
                          await retroCall(
                            "cardAction",
                            platform.id,
                            selectedCard,
                            cardName,
                            duplicate
                          );
                          setCards(await retroCall("cards", platform.id));
                          setSelectedCard("");
                          toast.success(
                            duplicate
                              ? t("retro.saves.cardDuplicated")
                              : t("retro.saves.cardRenamed")
                          );
                        })
                      }
                    >
                      {duplicate ? t("retro.saves.duplicate") : t("retro.saves.rename")}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {busy && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("retro.saves.working")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Retro() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const [state, setState] = useState(null),
    [error, setError] = useState(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [setup, setSetup] = useState(null),
    [selected, setSelected] = useState(null),
    [savePlatform, setSavePlatform] = useState(null);
  const [mode, setMode] = useState("library"),
    [catalogueResults, setCatalogueResults] = useState([]),
    [favorites, setFavorites] = useState(false),
    [review, setReview] = useState(false),
    [limit, setLimit] = useState(60);
  const [sort, setSort] = useState("title"),
    [searchBusy, setSearchBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setState(await retroCall("getState"));
      setError(null);
    } catch (failure) {
      setError(failure.message);
    }
  }, []);
  useEffect(() => {
    refresh();
    return window.electron?.retro?.onChanged(event => {
      if (event.job)
        setState(previous => (previous ? { ...previous, job: event.job } : previous));
      else refresh();
      if (event.error) toast.error(event.error);
      if (event.message) toast.success(event.message);
      if (event.warnings?.length)
        toast.warning(event.warnings.join("\n"), { duration: 10000 });
    });
  }, [refresh]);
  useEffect(() => {
    setLimit(60);
  }, [filter, query, favorites, review, sort]);
  useEffect(() => {
    if (mode !== "catalogue" || !state) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const results = await retroCall(
          "search",
          filter === "all" ? state.platforms[0].id : filter,
          query
        );
        if (!cancelled) setCatalogueResults(results);
      } catch (failure) {
        if (!cancelled) toast.error(failure.message);
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, filter, query, state?.catalogue?.updatedAt]);
  const games = useMemo(
    () =>
      (state?.games || [])
        .filter(
          game =>
            (filter === "all" || game.platform === filter) &&
            (!favorites || game.favorite) &&
            (!review || !game.metadataId) &&
            game.title.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) =>
          sort === "recent"
            ? (b.lastPlayed || "").localeCompare(a.lastPlayed || "")
            : sort === "playtime"
              ? (b.playTime || 0) - (a.playTime || 0)
              : a.title.localeCompare(b.title)
        ),
    [state?.games, filter, query, favorites, review, sort]
  );
  const perform = async callback => {
    try {
      await callback();
    } catch (failure) {
      toast.error(failure.message);
    }
  };
  useEffect(() => {
    const consoleId = searchParams.get("saves");
    if (state?.platforms.some(platform => platform.id === consoleId)) {
      setSavePlatform(consoleId);
      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);
          next.delete("saves");
          return next;
        },
        { replace: true }
      );
    }
  }, [state?.platforms, searchParams, setSearchParams]);
  if (error)
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-3xl font-bold">{t("retro.title")}</h1>
        <p className="text-destructive my-4">{error}</p>
        <Button className="text-secondary" onClick={refresh}>
          {t("retro.errors.retry")}
        </Button>
      </div>
    );
  if (!state)
    return (
      <div className="flex justify-center p-20" role="status">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="sr-only">{t("retro.loading")}</span>
      </div>
    );
  const platformFor = id => state.platforms.find(p => p.id === id);
  const currentGame = state.games.find(game => game.id === selected);
  return (
    <div className="mx-auto max-w-7xl space-y-7 px-2 py-8 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/library")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.library") || "Library"}
          </Button>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold">{t("retro.title")}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!!state.job}
            onClick={() =>
              perform(async () => {
                const file = await retroCall("pick", "catalogue");
                if (file) await retroCall("updateCatalogue", file);
              })
            }
          >
            {t("retro.actions.importMetadata")}
          </Button>
          <Button
            variant="outline"
            disabled={!!state.job}
            onClick={() => perform(() => retroCall("updateCatalogue"))}
          >
            <Download className="mr-2 h-4 w-4" />
            {state.catalogue.count
              ? t("retro.actions.updateCatalogue")
              : t("retro.actions.downloadCatalogue")}
          </Button>
        </div>
      </header>
      {state.job && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="text-sm">
            <p className="capitalize">
              {state.job.phase}
              {state.job.platform ? ` · ${platformFor(state.job.platform)?.name}` : ""}
            </p>
            <p className="text-muted-foreground">
              {state.job.bytes
                ? t("retro.job.bytesDownloaded", {
                    count: Math.round(state.job.bytes / 1024 / 1024),
                  })
                : state.job.records
                  ? t("retro.job.recordsProcessed", {
                      count: state.job.records.toLocaleString(),
                    })
                  : t("retro.job.filesChecked", { count: state.job.inspected || 0 })}
              {t("retro.job.leaveMessage")}
            </p>
          </div>
        </div>
      )}
      <section
        aria-label={t("retro.consoles.label")}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        {state.platforms.map(platform => {
          const profile = state.profiles[platform.id];
          const count = state.games.filter(
            game => game.platform === platform.id && !game.missing
          ).length;
          return (
            <div
              key={platform.id}
              className={`rounded-xl border-none p-3 transition-colors ${filter === platform.id ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <button
                onClick={() => {
                  setFilter(platform.id);
                }}
                className="w-full text-left"
              >
                <p className="font-medium">{platform.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("retro.consoles.gamesCount", { count })}
                </p>
              </button>
              <div className="mt-3 flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("retro.consoles.setup", { name: platform.name })}
                  aria-label={t("retro.consoles.setup", { name: platform.name })}
                  onClick={() => setSetup(platform.id)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("retro.consoles.scan", { name: platform.name })}
                  aria-label={t("retro.consoles.scan", { name: platform.name })}
                  disabled={!!state.job || !profile?.romFolders?.length}
                  onClick={() => perform(() => retroCall("scan", platform.id))}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("retro.consoles.saves", { name: platform.name })}
                  aria-label={t("retro.consoles.saves", { name: platform.name })}
                  onClick={() => setSavePlatform(platform.id)}
                >
                  <Cloud className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={mode === "library" ? "default" : "outline"}
            className={mode === "library" ? "text-secondary" : undefined}
            onClick={() => setMode("library")}
          >
            <Library className="mr-2 h-4 w-4" />
            {t("retro.tabs.library")}
          </Button>
          <Button
            variant={mode === "catalogue" ? "default" : "outline"}
            className={mode === "catalogue" ? "text-secondary" : undefined}
            onClick={() => {
              setMode("catalogue");
              if (filter === "all") setFilter("ps1");
            }}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            {t("retro.tabs.catalogue")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("retro.tabs.catalogueCount", {
              count: state.catalogue.count.toLocaleString(),
            })}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("retro.search.label")}
              placeholder={
                mode === "catalogue"
                  ? t("retro.search.cataloguePlaceholder")
                  : t("retro.search.libraryPlaceholder")
              }
              className="h-10 rounded-lg bg-background pl-9"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>
          <RetroSelect
            label={t("retro.filters.console")}
            icon={Gamepad2}
            className="w-full sm:w-[230px]"
            value={filter}
            onValueChange={setFilter}
            options={[
              ...(mode === "library"
                ? [{ value: "all", label: t("retro.filters.allConsoles") }]
                : []),
              ...state.platforms.map(platform => ({
                value: platform.id,
                label: platform.name,
              })),
            ]}
          />
          {mode === "library" && (
            <>
              <RetroSelect
                label={t("retro.filters.sort")}
                icon={ArrowDownWideNarrow}
                className="w-full sm:w-[200px]"
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: "title", label: t("retro.filters.sortTitle") },
                  { value: "recent", label: t("retro.filters.sortRecent") },
                  { value: "playtime", label: t("retro.filters.sortPlaytime") },
                ]}
              />
              <Button
                variant={favorites ? "default" : "outline"}
                className={favorites ? "text-secondary" : undefined}
                onClick={() => setFavorites(!favorites)}
                aria-pressed={favorites}
              >
                <Star className="mr-2 h-4 w-4" />
                {t("retro.filters.favorites")}
              </Button>
              <Button
                variant={review ? "default" : "outline"}
                className={review ? "text-secondary" : undefined}
                onClick={() => setReview(!review)}
                aria-pressed={review}
              >
                {t("retro.filters.needsMatching")}
              </Button>
            </>
          )}
        </div>
        {mode === "library" ? (
          <>
            {!games.length ? (
              <div className="rounded-xl border border-dashed px-6 py-16 text-center">
                <Gamepad2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h2 className="text-xl font-semibold">
                  {state.games.length
                    ? t("retro.empty.noMatch")
                    : t("retro.empty.libraryTitle")}
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                  {t("retro.empty.description")}
                </p>
                <Button
                  className="mt-5 text-secondary"
                  onClick={() => setSetup(filter === "all" ? "ps1" : filter)}
                >
                  {t("retro.empty.setupConsole")}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {games.slice(0, limit).map(game => (
                  <article
                    key={game.id}
                    className="group overflow-hidden rounded-xl border bg-card"
                  >
                    <button
                      className="block w-full text-left"
                      onClick={() => setSelected(game.id)}
                    >
                      <Cover game={game} />
                      <div className="p-3">
                        <h3 className="line-clamp-2 text-sm font-semibold">
                          {game.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {platformFor(game.platform)?.name}
                          {game.year ? ` · ${game.year}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {game.missing
                            ? t("retro.game.filesMissing")
                            : state.running.includes(game.id)
                              ? t("retro.game.running")
                              : !game.metadataId
                                ? t("retro.game.needsMatching")
                                : game.files.length > 1
                                  ? t("retro.game.discsCount", {
                                      count: game.files.length,
                                    })
                                  : ""}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center justify-between px-2 pb-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={state.running.includes(game.id) || game.missing}
                        onClick={() =>
                          game.files.length > 1
                            ? setSelected(game.id)
                            : perform(() => retroCall("launch", game.id, 0))
                        }
                      >
                        <Play className="mr-1 h-3 w-3" />
                        {t("retro.game.play")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={
                          game.favorite
                            ? t("retro.game.unfavorite", { title: game.title })
                            : t("retro.game.favorite", { title: game.title })
                        }
                        onClick={() =>
                          perform(() =>
                            retroCall("updateGame", game.id, { favorite: !game.favorite })
                          )
                        }
                      >
                        <Star
                          className={`h-4 w-4 ${game.favorite ? "fill-primary text-primary" : ""}`}
                        />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {games.length > limit && (
              <Button variant="outline" onClick={() => setLimit(limit + 60)}>
                {t("retro.game.showMore", { count: games.length - limit })}
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("retro.catalogue.description")}
              {!state.catalogue.count
                ? t("retro.catalogue.downloadPrompt")
                : t("retro.catalogue.searchPrompt")}
            </p>
            {searchBusy && <Loader2 className="h-5 w-5 animate-spin" />}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {catalogueResults.map(game => (
                <article
                  key={game.id}
                  className="overflow-hidden rounded-xl border bg-card"
                >
                  <Cover game={game} />
                  <div className="space-y-1 p-3">
                    <h3 className="text-sm font-semibold">{game.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {game.year} {game.genres}
                    </p>
                    {state.games.some(
                      local =>
                        local.metadataId === game.id && local.platform === game.platform
                    ) && (
                      <p className="text-xs text-primary">
                        {t("retro.catalogue.inLibrary")}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!searchBusy && query && !catalogueResults.length && (
              <p className="py-6 text-center text-muted-foreground">
                {t("retro.catalogue.noResults")}
              </p>
            )}
          </>
        )}
      </section>
      {setup && (
        <ConsoleSetup
          key={setup}
          platform={platformFor(setup)}
          profile={state.profiles[setup]}
          taskBusy={!!state.job}
          onClose={() => setSetup(null)}
          onSaved={refresh}
        />
      )}
      {currentGame && !setup && (
        <GameDetails
          key={currentGame.id}
          game={currentGame}
          platform={platformFor(currentGame.platform)}
          profile={state.profiles[currentGame.platform]}
          running={state.running.includes(currentGame.id)}
          onClose={() => setSelected(null)}
          onChanged={refresh}
          onSetup={() => setSetup(currentGame.platform)}
        />
      )}
      {savePlatform && (
        <SavesDialog
          key={savePlatform}
          platform={platformFor(savePlatform)}
          profile={state.profiles[savePlatform]}
          running={state.games.some(
            game => game.platform === savePlatform && state.running.includes(game.id)
          )}
          onSetup={() => {
            setSetup(savePlatform);
            setSavePlatform(null);
          }}
          onClose={() => setSavePlatform(null)}
        />
      )}
    </div>
  );
}
