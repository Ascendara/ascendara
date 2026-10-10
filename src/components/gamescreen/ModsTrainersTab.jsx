import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/context/LanguageContext";
import {
  Bolt,
  Download,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Gem,
  Loader,
  Puzzle,
  Tag,
} from "lucide-react";

/** Shown instead of a feature when the user has no Ascend access. */
function AscendPromo({ icon: Icon, title, subtitle, description, isAuthenticated, onGetAscend }) {
  const { t } = useLanguage();
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border/40 bg-card p-6">
      <div className="rounded-full bg-primary/10 p-3">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-foreground/80">{subtitle}</p>}
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      <Button className="shrink-0 gap-2 text-secondary" onClick={onGetAscend}>
        <Gem className="h-4 w-4" />
        {!isAuthenticated ? t("gameScreen.getAscend") : t("gameScreen.subscribeToAscend")}
      </Button>
    </section>
  );
}

function ModCard({ mod, showUploader, onSelect }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="group overflow-hidden rounded-lg border border-border/40 bg-background/30 text-left transition-all hover:border-primary/50 hover:shadow-lg"
      onClick={() => onSelect(mod)}
    >
      {mod.pictureUrl && (
        <div className="aspect-video overflow-hidden bg-muted">
          <img
            src={mod.pictureUrl}
            alt={mod.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div className="p-4">
        <h4 className="line-clamp-1 font-semibold text-foreground">{mod.name}</h4>
        {showUploader && mod.uploader?.name && (
          <p className="text-xs text-muted-foreground">
            {t("gameScreen.modBy")} {mod.uploader.name}
          </p>
        )}
        {mod.summary && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mod.summary}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          {mod.version && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />v{mod.version}
            </span>
          )}
          {mod.modCategory?.name && (
            <span className="rounded bg-muted px-2 py-0.5">{mod.modCategory.name}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function TrainerSection({
  trainer,
  trainerExists,
  isInstalling,
  onInstall,
  onDownloadStandalone,
  onOpenPage,
}) {
  const { t } = useLanguage();
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-xl border border-border/40 bg-card p-6">
      {trainer?.imageUrl ? (
        <img
          src={trainer.imageUrl}
          alt={trainer.title}
          className="h-24 w-auto shrink-0 rounded-lg object-contain"
        />
      ) : (
        <div className="rounded-full bg-primary/10 p-4">
          <Bolt className="h-8 w-8 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {trainer?.title || t("gameScreen.trainersTitle")}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {trainer?.options && (
            <span className="font-medium text-primary">
              {t("gameScreen.trainerOptions", { count: trainer.options })}
            </span>
          )}
          {trainer?.version && (
            <span className="text-muted-foreground">{trainer.version}</span>
          )}
          {trainerExists && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
              <FileCheck2 className="h-3.5 w-3.5" />
              {t("gameScreen.trainerInstalled")}
            </span>
          )}
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("gameScreen.trainersDescription")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {trainer?.downloadUrl ? (
          <>
            <Button
              className="gap-2 text-secondary"
              onClick={onInstall}
              disabled={isInstalling || trainerExists}
            >
              {isInstalling ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  {t("gameScreen.installingTrainer")}
                </>
              ) : trainerExists ? (
                <>
                  <FileCheck2 className="h-4 w-4" />
                  {t("gameScreen.trainerInstalled")}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t("gameScreen.installTrainer")}
                </>
              )}
            </Button>
            <Button variant="outline" className="gap-2" onClick={onDownloadStandalone}>
              <Download className="h-4 w-4" />
              {t("gameScreen.downloadStandalone")}
            </Button>
          </>
        ) : (
          <Button className="gap-2 text-secondary" onClick={onOpenPage}>
            <ExternalLink className="h-4 w-4" />
            {t("gameScreen.downloadTrainer")}
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={onOpenPage}>
          <ExternalLink className="h-4 w-4" />
          {t("gameScreen.viewOnFling")}
        </Button>
      </div>
    </section>
  );
}

function ModsSection({
  nexusGameData,
  loading,
  mods,
  popularMods,
  totalCount,
  page,
  perPage,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  sortBy,
  onSortChange,
  onPageChange,
  onSelectMod,
  onBrowse,
}) {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl border border-border/40 bg-card p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("gameScreen.modsTitle")}
          </h2>
          {nexusGameData && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("gameScreen.modsAvailable", { count: nexusGameData.modCount || 0 })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={onSearch} className="flex gap-2">
            <Input
              placeholder={t("gameScreen.searchMods")}
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              className="sm:w-64"
            />
            <Button type="submit" variant="outline" className="w-10 shrink-0 p-0">
              <FileSearch className="h-4 w-4" />
            </Button>
          </form>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("gameScreen.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="endorsements">{t("gameScreen.sortPopular")}</SelectItem>
              <SelectItem value="downloads">{t("gameScreen.sortDownloads")}</SelectItem>
              <SelectItem value="updatedAt">{t("gameScreen.sortRecent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Puzzle className="h-8 w-8 animate-pulse text-primary/60" />
          <p className="animate-pulse text-sm font-medium text-primary/70">
            {t("gameScreen.loadingMods")}
          </p>
        </div>
      ) : mods.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mods.map((mod, index) => (
              <ModCard
                key={mod.modId || index}
                mod={mod}
                showUploader
                onSelect={onSelectMod}
              />
            ))}
          </div>
          {totalCount > perPage && (
            <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-4">
              <div className="text-sm text-muted-foreground">
                {t("gameScreen.showingMods", {
                  from: page * perPage + 1,
                  to: Math.min((page + 1) * perPage, totalCount),
                  total: totalCount,
                })}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {t("common.page")} {page + 1} / {Math.ceil(totalCount / perPage)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                  >
                    {t("common.prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={(page + 1) * perPage >= totalCount}
                  >
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : popularMods.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("gameScreen.popularMods")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popularMods.map((mod, index) => (
              <ModCard key={mod.modId || index} mod={mod} onSelect={onSelectMod} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Puzzle className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">{t("gameScreen.modsSupported")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("gameScreen.modsDescription")}
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={onBrowse}>
            <Puzzle className="h-4 w-4" />
            {t("gameScreen.browseMods")}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Trainer and Nexus mods for the game; both need Ascend access. */
export default function ModsTrainersTab({
  hasAscendAccess,
  isAuthenticated,
  onGetAscend,
  showTrainer,
  trainerProps,
  showMods,
  modsProps,
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      {showTrainer &&
        (hasAscendAccess ? (
          <TrainerSection {...trainerProps} />
        ) : (
          <AscendPromo
            icon={Bolt}
            title={t("gameScreen.trainersTitle")}
            subtitle={t("gameScreen.trainerAvailable")}
            description={
              !isAuthenticated
                ? t("gameScreen.trainersAscendPromo")
                : t("gameScreen.trainersAscendRequired")
            }
            isAuthenticated={isAuthenticated}
            onGetAscend={onGetAscend}
          />
        ))}
      {showMods &&
        (hasAscendAccess ? (
          <ModsSection {...modsProps} />
        ) : (
          <AscendPromo
            icon={Puzzle}
            title={t("gameScreen.modsTitle")}
            subtitle={
              modsProps.nexusGameData &&
              t("gameScreen.modsAvailable", {
                count: modsProps.nexusGameData.modCount || 0,
              })
            }
            description={
              !isAuthenticated
                ? t("gameScreen.modsAscendPromo")
                : t("gameScreen.modsAscendRequired")
            }
            isAuthenticated={isAuthenticated}
            onGetAscend={onGetAscend}
          />
        ))}
    </div>
  );
}
