// Hides parts of the game cards in Search picked in this plugin's options.
// Undone when the plugin is turned off.
const PARTS = [
  "rating",
  "views",
  "features",
  "tags",
  "specs",
  "source",
  "verified",
  "recently-updated",
  "mac-compat",
];

module.exports = {
  start(ascendara) {
    let removeStyle = null;

    const apply = settings => {
      if (removeStyle) removeStyle();
      removeStyle = null;
      const selectors = PARTS.filter(part => settings[part]).map(
        part => `[data-game-card] [data-card-part="${part}"]`
      );
      if (selectors.length === 0) return;
      removeStyle = ascendara.addStyle(
        `${selectors.join(", ")} { display: none !important; }`
      );
    };

    apply(ascendara.settings.all());
    ascendara.settings.onChange(apply);
  },
};
