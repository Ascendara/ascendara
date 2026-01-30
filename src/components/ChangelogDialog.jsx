import React, { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader,
  Plus,
  Wrench,
  TrendingUp,
  Trash2,
  Users,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const CHANGELOG_API_URL = "https://api.ascendara.app/json/changelog/v2";

const ChangelogDialog = ({ open, onOpenChange, currentVersion }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [changelogData, setChangelogData] = useState(null);

  useEffect(() => {
    if (open) {
      fetchChangelog();
    }
  }, [open]);

  const fetchChangelog = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(CHANGELOG_API_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch changelog");
      }
      const data = await response.json();
      setChangelogData(data);
    } catch (err) {
      console.error("Error fetching changelog:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = category => {
    const icons = {
      additions: <Plus className="h-4 w-4" />,
      fixes: <Wrench className="h-4 w-4" />,
      improvements: <TrendingUp className="h-4 w-4" />,
      removals: <Trash2 className="h-4 w-4" />,
    };
    return icons[category] || null;
  };

  const getCategoryColor = category => {
    const colors = {
      additions: "text-green-500",
      fixes: "text-red-500",
      improvements: "text-blue-500",
      removals: "text-gray-500",
    };
    return colors[category] || "text-gray-500";
  };

  const getCategoryLabel = category => {
    const labels = {
      additions: t("app.changelog.additions"),
      fixes: t("app.changelog.fixes"),
      improvements: t("app.changelog.improvements"),
      removals: t("app.changelog.removals"),
    };
    return labels[category] || category;
  };

  const renderChangeItem = item => {
    if (typeof item === "string") {
      return <span>{item}</span>;
    }
    return (
      <div className="flex items-start gap-2">
        <span className="flex-1">{item.change}</span>
        {item.contributor && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {item.contributor}
          </Badge>
        )}
      </div>
    );
  };

  const renderEntry = entry => {
    if (!entry) return null;

    const hasFeatures = entry.features && Object.keys(entry.features).length > 0;

    return (
      <div className="space-y-6">
        {hasFeatures && (
          <>
            <div className="space-y-8 pb-4">
              {Object.entries(entry.features).map(([parentTag, categories]) => {
                const hasContent = Object.values(categories).some(
                  items => Array.isArray(items) && items.length > 0
                );

                if (!hasContent) return null;

                return (
                  <div key={parentTag} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <h4 className="px-3 text-lg font-bold text-foreground">
                        {parentTag}
                      </h4>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="grid gap-4">
                      {Object.entries(categories).map(([category, items]) => {
                        if (!Array.isArray(items) || items.length === 0) return null;

                        return (
                          <div
                            key={category}
                            className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4"
                          >
                            <div
                              className={`flex items-center gap-2 text-base font-semibold ${getCategoryColor(category)}`}
                            >
                              {getCategoryIcon(category)}
                              <span>{getCategoryLabel(category)}</span>
                              <Badge variant="outline" className="ml-auto text-xs">
                                {items.length}
                              </Badge>
                            </div>
                            <ul className="ml-6 space-y-2">
                              {items.map((item, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                                >
                                  <span className="text-muted-foreground">•</span>
                                  <span className="flex-1">{renderChangeItem(item)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const latestEntry = changelogData?.entries?.[0];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {t("app.changelog.title")}
            {currentVersion && (
              <Badge variant="outline" className="text-xs font-normal">
                {currentVersion}
              </Badge>
            )}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogDescription asChild>
          <div className="max-h-[calc(85vh-180px)] flex-1 overflow-y-auto pr-4">
            {loading && (
              <div className="flex h-64 flex-col items-center justify-center gap-2">
                <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("app.changelog.loading")}
                </p>
              </div>
            )}

            {error && (
              <div className="flex h-64 flex-col items-center justify-center space-y-2">
                <p className="text-destructive">{t("app.changelog.failedToLoad")}</p>
                <Button variant="outline" size="sm" onClick={fetchChangelog}>
                  {t("app.changelog.retry")}
                </Button>
              </div>
            )}

            {!loading && !error && changelogData && (
              <div className="space-y-6 pb-4">{renderEntry(latestEntry)}</div>
            )}
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="flex-row items-center justify-between">
          <Button
            variant="ghost"
            className="text-primary-foreground"
            size="sm"
            onClick={() => window.electron.openURL("https://ascendara.app/changelog")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("app.changelog.fullChangelog")}
          </Button>
          <Button className="text-secondary" onClick={() => onOpenChange(false)}>
            {t("app.changelog.close")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangelogDialog;
