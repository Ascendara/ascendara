import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearch } from "@/context/SearchContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Library, Settings, Gamepad2, ChevronRight, Command } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  library: Library,
  settings: Settings,
  index: Gamepad2,
};

const MAX_RESULTS_PER_CATEGORY = 10;
const MAX_TOTAL_RESULTS = 50;

const GlobalSearch = () => {
  const { isOpen, closeSearch, getSearchableItems, searchContext } = useSearch();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const itemRefs = useRef([]);
  const debounceTimerRef = useRef(null);

  // Debounce search query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setQuery(inputValue);
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue]);

  const filteredResults = useMemo(() => {
    if (!query.trim()) return {};

    const searchableItems = getSearchableItems(searchContext);
    const lowerQuery = query.toLowerCase().trim();
    const grouped = {};
    let totalCount = 0;

    // Separate library items from others for priority processing
    const libraryItems = [];
    const otherItems = [];

    for (const item of searchableItems) {
      if (item.type === "library") {
        libraryItems.push(item);
      } else {
        otherItems.push(item);
      }
    }

    // Process library items first
    for (const item of libraryItems) {
      if (totalCount >= MAX_TOTAL_RESULTS) break;

      const lowerLabel = item.label.toLowerCase();

      // Quick check - only title matching for speed
      if (!lowerLabel.includes(lowerQuery)) continue;

      let score = 0;
      if (lowerLabel.startsWith(lowerQuery)) {
        score = 100;
      } else {
        score = 50;
      }

      // Boost library games significantly
      score += 1000;

      if (!grouped[item.type]) {
        grouped[item.type] = [];
      }

      if (grouped[item.type].length < MAX_RESULTS_PER_CATEGORY) {
        grouped[item.type].push({ ...item, score });
        totalCount++;
      }
    }

    // Then process other items (settings, index)
    for (const item of otherItems) {
      if (totalCount >= MAX_TOTAL_RESULTS) break;

      const lowerLabel = item.label.toLowerCase();

      // Quick check - only title matching for speed
      if (!lowerLabel.includes(lowerQuery)) continue;

      let score = 0;
      if (lowerLabel.startsWith(lowerQuery)) {
        score = 100;
      } else {
        score = 50;
      }

      if (!grouped[item.type]) {
        grouped[item.type] = [];
      }

      if (grouped[item.type].length < MAX_RESULTS_PER_CATEGORY) {
        grouped[item.type].push({ ...item, score });
        totalCount++;
      }
    }

    // Sort each category by score
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a, b) => b.score - a.score);
    });

    return grouped;
  }, [query, getSearchableItems, searchContext]);

  const flatResults = useMemo(() => {
    const flat = [];
    // Ensure library games appear first, then settings, then index
    const typeOrder = ["library", "settings", "index"];

    typeOrder.forEach(type => {
      if (filteredResults[type]) {
        filteredResults[type].forEach(item => {
          flat.push(item);
        });
      }
    });

    // Add any other types that might exist
    Object.entries(filteredResults).forEach(([type, items]) => {
      if (!typeOrder.includes(type)) {
        items.forEach(item => {
          flat.push(item);
        });
      }
    });

    return flat;
  }, [filteredResults]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    item => {
      if (item.onSelect) {
        item.onSelect(navigate, location);
      }
      closeSearch();
      setInputValue("");
      setQuery("");
      setSelectedIndex(0);
    },
    [navigate, location, closeSearch]
  );

  const handleKeyDown = useCallback(
    e => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        setInputValue("");
        setQuery("");
        setSelectedIndex(0);
      }
    },
    [flatResults, selectedIndex, handleSelect, closeSearch]
  );

  const handleOpenChange = open => {
    if (!open) {
      closeSearch();
      setInputValue("");
      setQuery("");
      setSelectedIndex(0);
    }
  };

  const getContextLabel = () => {
    if (searchContext === "library") return t("globalSearch.placeholder.library");
    if (searchContext === "settings") return t("globalSearch.placeholder.settings");
    return t("globalSearch.placeholder.global");
  };

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifierKey = isMac ? "⌘" : "Ctrl";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only px-4 pb-0 pt-4">
          <DialogTitle>{getContextLabel()}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getContextLabel()}
            className="border-0 px-2 text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
              {modifierKey}+K
            </kbd>
          </div>
        </div>

        <ScrollArea className="max-h-[400px]" ref={scrollRef}>
          {query.trim() === "" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {searchContext === "global"
                  ? t("globalSearch.emptyState.global")
                  : searchContext === "library"
                    ? t("globalSearch.emptyState.library")
                    : t("globalSearch.emptyState.settings")}
              </p>
            </div>
          ) : flatResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("globalSearch.noResults")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("globalSearch.tryDifferent")}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(filteredResults).map(([type, items]) => {
                const Icon = CATEGORY_ICONS[type];
                const label = t(`globalSearch.categories.${type}`);
                const startIndex = flatResults.findIndex(item => item.type === type);

                return (
                  <div key={type} className="mb-2">
                    <div className="flex items-center gap-2 px-4 py-2">
                      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </span>
                      <Badge
                        variant="secondary"
                        className="ml-auto text-xs text-foreground"
                      >
                        {items.length}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item, idx) => {
                        const globalIndex = startIndex + idx;
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <div
                            key={`${type}-${item.id || idx}`}
                            ref={el => (itemRefs.current[globalIndex] = el)}
                            onClick={() => handleSelect(item)}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-foreground transition-colors",
                              isSelected
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-accent/50"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">
                                  {item.label}
                                </p>
                                {item.badge && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.badge}
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium">
                  ↑↓
                </kbd>
                {t("globalSearch.navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium">
                  ↵
                </kbd>
                {t("globalSearch.select")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium">
                  Esc
                </kbd>
                {t("common.close")}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GlobalSearch;
