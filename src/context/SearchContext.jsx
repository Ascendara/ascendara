import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const SearchContext = createContext();

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
};

export const SearchProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchContext, setSearchContext] = useState("global");
  const registryRef = useRef({
    library: [],
    settings: [],
    index: [],
  });

  const registerSearchable = useCallback((type, items) => {
    if (!Array.isArray(items)) {
      items = [items];
    }
    registryRef.current[type] = items;
  }, []);

  const unregisterSearchable = useCallback(type => {
    registryRef.current[type] = [];
  }, []);

  const getSearchableItems = useCallback((context = "global") => {
    if (context === "library") {
      return registryRef.current.library;
    } else if (context === "settings") {
      return registryRef.current.settings;
    } else if (context === "index") {
      return registryRef.current.index;
    } else {
      return [
        ...registryRef.current.library,
        ...registryRef.current.settings,
        ...registryRef.current.index,
      ];
    }
  }, []);

  const openSearch = useCallback((context = "global") => {
    setSearchContext(context);
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = {
    isOpen,
    searchContext,
    openSearch,
    closeSearch,
    registerSearchable,
    unregisterSearchable,
    getSearchableItems,
  };

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
};
