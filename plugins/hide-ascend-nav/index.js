// Hides the Ascend button in the navigation bar. The style is removed
// automatically when the plugin is turned off.
module.exports = {
  start(ascendara) {
    ascendara.addStyle('[data-nav-path="/ascend"] { display: none !important; }');
  },
};
