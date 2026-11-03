import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";

const AchievementFolderSearch = () => {
  const { t } = useLanguage();
  const [appId, setAppId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async event => {
    event.preventDefault();
    const value = appId.trim();
    if (!/^\d{1,10}$/.test(value)) {
      setResults(null);
      setError(t("settings.achievementWatcher.searchInvalidId"));
      return;
    }

    setIsSearching(true);
    setError("");
    setResults(null);
    setTruncated(false);

    try {
      const response = await window.electron.searchAchievementFolders(value);
      if (!response?.success) {
        setError(
          response?.error === "invalidAppId"
            ? t("settings.achievementWatcher.searchInvalidId")
            : t("settings.achievementWatcher.searchFailed")
        );
        return;
      }
      setResults(response.results || []);
      setTruncated(Boolean(response.truncated));
    } catch {
      setError(t("settings.achievementWatcher.searchFailed"));
    } finally {
      setIsSearching(false);
    }
  };

  const openFolder = async folderPath => {
    const response = await window.electron.openFolderPath(folderPath);
    if (!response?.success) {
      toast.error(t("settings.achievementWatcher.searchOpenFailed"));
    }
  };

  return (
    <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
      <div>
        <p className="text-sm font-medium text-foreground">
          {t("settings.achievementWatcher.searchTitle")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("settings.achievementWatcher.searchDescription")}
        </p>
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={handleSearch}>
        <Input
          value={appId}
          onChange={event => {
            setAppId(event.target.value.replace(/\D/g, "").slice(0, 10));
            if (error) setError("");
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("settings.achievementWatcher.searchPlaceholder")}
          aria-label={t("settings.achievementWatcher.searchPlaceholder")}
          className="w-[180px]"
          disabled={isSearching}
        />
        <Button
          type="submit"
          variant="outline"
          className="gap-2"
          disabled={isSearching || !appId.trim()}
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {isSearching
            ? t("settings.achievementWatcher.searching")
            : t("settings.achievementWatcher.searchButton")}
        </Button>
      </form>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("settings.achievementWatcher.searchNoResults", { appId })}
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("settings.achievementWatcher.searchResults", {
              count: results.length,
            })}
          </p>
          <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50">
            {results.map(folderPath => (
              <li key={folderPath} className="flex min-w-0 items-center gap-2 px-3 py-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={folderPath}
                >
                  {folderPath}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => openFolder(folderPath)}
                >
                  {t("settings.achievementWatcher.searchOpen")}
                </Button>
              </li>
            ))}
          </ul>
          {truncated && (
            <p className="text-xs text-muted-foreground">
              {t("settings.achievementWatcher.searchTruncated")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AchievementFolderSearch;
