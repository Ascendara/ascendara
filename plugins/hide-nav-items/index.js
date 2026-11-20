// Hides the navigation bar buttons picked in this plugin's options. The pages
// still work if opened another way. Undone when the plugin is turned off.
const ITEMS = {
  search: "/search",
  library: "/library",
  downloads: "/downloads",
  debridDownloads: "/debriddownloads",
  profile: "/profile",
  ascend: "/ascend",
  workshop: "/workshopdownloader",
};

module.exports = {
  start(ascendara) {
    let removeStyle = null;

    const apply = settings => {
      if (removeStyle) removeStyle();
      removeStyle = null;
      const selectors = Object.entries(ITEMS)
        .filter(([key]) => settings[key])
        .map(([, route]) => `[data-nav-path="${route}"]`);
      if (selectors.length === 0) return;
      removeStyle = ascendara.addStyle(
        `${selectors.join(", ")} { display: none !important; }`
      );
    };

    apply(ascendara.settings.all());
    ascendara.settings.onChange(apply);
  },
};
