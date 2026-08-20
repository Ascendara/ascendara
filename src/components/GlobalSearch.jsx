import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Command, Gamepad2, Library, Search, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import GameProfilesCenter from "@/components/GameProfilesCenter";
import SmartCollectionsCenter from "@/components/SmartCollectionsCenter";
import SystemCenter from "@/components/SystemCenter";
import { useLanguage } from "@/context/LanguageContext";
import { useSearch } from "@/context/SearchContext";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  commands: Command,
  library: Library,
  settings: Settings,
  index: Gamepad2,
};

const TYPE_ORDER = ["commands", "library", "settings", "index"];
const MAX_RESULTS_PER_CATEGORY = 10;
const MAX_TOTAL_RESULTS = 50;
const MAX_FEATURED_COMMANDS = 6;

function scoreItem(item, query) {
  const label = String(item.label || "").toLocaleLowerCase();
  const description = String(item.description || "").toLocaleLowerCase();
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.join(" ").toLocaleLowerCase()
    : "";

  if (!label.includes(query) && !description.includes(query) && !keywords.includes(query)) {
    return null;
  }
  if (label.startsWith(query)) return 100;
  if (label.includes(query)) return 70;
  if (keywords.includes(query)) return 45;
  return 25;
}

const GlobalSearch = () => {
  const { isOpen, closeSearch, getSearchableItems, searchContext } = useSearch();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const itemRefs = useRef([]);
  const debounceTimerRef = useRef(null);

  const resetSearch = useCallback(() => {
    setInputValue("");
    setQuery("");
    setSelectedIndex(0);
    itemRefs.current = [];
  }, []);

  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setQuery(inputValue), 120);
    return () => clearTimeout(debounceTimerRef.current);
  }, [inputValue]);

  const filteredResults = useMemo(() => {
    const trimmedQuery = query.trim().toLocaleLowerCase();

    if (!trimmedQuery) {
      if (searchContext !== "global") return {};
      const commands = getSearchableItems("commands")
        .filter(item => item.featured)
        .slice(0, MAX_FEATURED_COMMANDS);
      return commands.length > 0 ? { commands } : {};
    }

    const grouped = {};
    let totalCount = 0;
    const items = getSearchableItems(searchContext);

    for (const item of items) {
      if (totalCount >= MAX_TOTAL_RESULTS) break;
      const baseScore = scoreItem(item, trimmedQuery);
      if (baseScore === null) continue;

      if (!grouped[item.type]) grouped[item.type] = [];
      if (grouped[item.type].length >= MAX_RESULTS_PER_CATEGORY) continue;

      grouped[item.type].push({
        ...item,
        score: baseScore + (item.type === "library" ? 1000 : 0),
      });
      totalCount += 1;
    }

    for (const itemsInGroup of Object.values(grouped)) {
      itemsInGroup.sort((left, right) => right.score - left.score);
    }

    return grouped;
  }, [getSearchableItems, query, searchContext]);

  const orderedGroups = useMemo(() => {
    const groups = [];
    for (const type of TYPE_ORDER) {
      if (filteredResults[type]?.length) {
        groups.push([type, filteredResults[type]]);
      }
    }
    for (const [type, items] of Object.entries(filteredResults)) {
      if (!TYPE_ORDER.includes(type) && items.length) groups.push([type, items]);
    }
    return groups;
  }, [filteredResults]);

  const flatResults = useMemo(
    () => orderedGroups.flatMap(([, items]) => items),
    [orderedGroups]
  );

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchContext]);

  useEffect(() => {
    if (flatResults.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex(current => Math.min(current, flatResults.length - 1));
  }, [flatResults.length]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    item => {
      item.onSelect?.(navigate, location);
      closeSearch();
      resetSearch();
    },
    [closeSearch, location, navigate, resetSearch]
  );

  const handleKeyDown = useCallback(
    event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        resetSearch();
        return;
      }

      if (flatResults.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex(current => Math.min(current + 1, flatResults.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(current => Math.max(current - 1, 0));
      } else if (event.key === "Enter" && flatResults[selectedIndex]) {
        event.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      }
    },
    [closeSearch, flatResults, handleSelect, resetSearch, selectedIndex]
  );

  const handleOpenChange = open => {
    if (open) return;
    closeSearch();
    resetSearch();
  };

  const placeholder =
    searchContext === "library"
      ? t("globalSearch.placeholder.library")
      : searchContext === "settings"
        ? t("globalSearch.placeholder.settings")
        : t("globalSearch.placeholder.global");

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const modifierKey = platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
  const showingSuggestions = query.trim() === "" && searchContext === "global";
  const showContextEmpty = query.trim() === "" && searchContext !== "global";

  let resultOffset = 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{placeholder}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls="ascendara-command-results"
              className="min-w-0 border-0 px-1 text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-2"
            />
            <kbd className="hidden h-5 shrink-0 select-none items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              {modifierKey}+K
            </kbd>
          </div>

          <ScrollArea className="max-h-[min(62vh,440px)]" id="ascendara-command-results">
            {showContextEmpty ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {searchContext === "library"
                    ? t("globalSearch.emptyState.library")
                    : t("globalSearch.emptyState.settings")}
                </p>
              </div>
            ) : flatResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t("globalSearch.noResults")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("globalSearch.tryDifferent")}
                </p>
              </div>
            ) : (
              <div className="py-2" role="listbox">
                {orderedGroups.map(([type, items]) => {
                  const Icon = CATEGORY_ICONS[type];
                  const label =
                    type === "commands"
                      ? t(
                          showingSuggestions
                            ? "featureCenters.commandPalette.suggested"
                            : "featureCenters.commandPalette.category"
                        )
                      : t(`globalSearch.categories.${type}`);
                  const groupStart = resultOffset;
                  resultOffset += items.length;

                  return (
                    <div key={type} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-2 px-4 py-2">
                        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-xs text-foreground">
                          {items.length}
                        </Badge>
                      </div>

                      <div className="space-y-0.5">
                        {items.map((item, index) => {
                          const globalIndex = groupStart + index;
                          const selected = globalIndex === selectedIndex;
                          return (
                            <button
                              key={`${type}-${item.id || index}`}
                              ref={element => (itemRefs.current[globalIndex] = element)}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              onClick={() => handleSelect(item)}
                              className={cn(
                                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                selected
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/50"
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-medium">{item.label}</p>
                                  {item.badge && (
                                    <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                                      {item.badge}
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:truncate">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="hidden border-t border-border bg-muted/30 px-4 py-2 sm:block">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px]">
                  ↑↓
                </kbd>
                {t("globalSearch.navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px]">
                  ↵
                </kbd>
                {t("globalSearch.select")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px]">
                  Esc
                </kbd>
                {t("common.close")}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SystemCenter />
      <GameProfilesCenter />
      <SmartCollectionsCenter />
    </>
  );
};

export default GlobalSearch;
