import { useEffect } from "react";
import { useSearch } from "@/context/SearchContext";
import { settingsSearchData } from "@/lib/settingsSearchData";

export const useSettingsSearch = () => {
  const { registerSearchable, unregisterSearchable } = useSearch();

  useEffect(() => {
    const searchableSettings = settingsSearchData.map(setting => ({
      id: setting.id,
      type: "settings",
      label: setting.title,
      description: setting.description,
      keywords: setting.keywords,
      badge: setting.section,
      onSelect: (navigate, location) => {
        if (setting.navigate) {
          setting.navigate(navigate);
        } else if (setting.scrollTo) {
          // Settings opens the right category and scrolls, even if it is
          // already the current page
          navigate("/settings", {
            state: { scrollTo: setting.scrollTo },
          });
        }
      },
    }));

    registerSearchable("settings", searchableSettings);

    return () => {
      unregisterSearchable("settings");
    };
  }, [registerSearchable, unregisterSearchable]);
};
