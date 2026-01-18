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
          if (location.pathname !== "/settings") {
            navigate("/settings", {
              state: { scrollTo: setting.scrollTo },
            });
          } else {
            const element = document.getElementById(setting.scrollTo);
            if (element) {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
              element.classList.add("highlight-setting");
              setTimeout(() => {
                element.classList.remove("highlight-setting");
              }, 4000);
            }
          }
        }
      },
    }));

    registerSearchable("settings", searchableSettings);

    return () => {
      unregisterSearchable("settings");
    };
  }, [registerSearchable, unregisterSearchable]);
};
