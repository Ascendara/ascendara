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
  const [registryVersion, setRegistryVersion] = useState(0);
  const registryRef = useRef({
    library: [],
    settings: [],
    index: [],
    commands: [],
  });

  const registerSearchable = useCallback((type, items) => {
    if (!Array.isArray(items)) {
      items = [items];
    }
    registryRef.current[type] = items;
    setRegistryVersion(current => current + 1);
  }, []);

  const unregisterSearchable = useCallback(type => {
    registryRef.current[type] = [];
    setRegistryVersion(current => current + 1);
  }, []);

  const getSearchableItems = useCallback(
    (context = "global") => {
      if (context === "library") {
        return registryRef.current.library;
      } else if (context === "settings") {
        return registryRef.current.settings;
      } else if (context === "index") {
        return registryRef.current.index;
      } else if (context === "commands") {
        return registryRef.current.commands;
      } else {
        return [
          ...registryRef.current.commands,
          ...registryRef.current.library,
          ...registryRef.current.settings,
          ...registryRef.current.index,
        ];
      }
    },
    [registryVersion]
  );

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
