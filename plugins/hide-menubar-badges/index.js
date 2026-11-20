// Hides the title bar badges picked in this plugin's options. Everything is
// undone when the plugin is turned off.
const BADGES = [
  "torrent-warning",
  "big-picture",
  "public-testing",
  "experimental",
  "dev",
];

module.exports = {
  start(ascendara) {
    let removeStyle = null;

    const apply = settings => {
      if (removeStyle) removeStyle();
      removeStyle = null;
      const hidden = BADGES.filter(badge => settings[badge]);
      if (hidden.length === 0) return;
      const selectors = hidden.map(badge => `[data-menubar-badge="${badge}"]`);
      removeStyle = ascendara.addStyle(
        `${selectors.join(", ")} { display: none !important; }`
      );
    };

    apply(ascendara.settings.all());
    ascendara.settings.onChange(apply);
  },
};
