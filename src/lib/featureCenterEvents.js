export const FEATURE_CENTER_EVENTS = Object.freeze({
  system: "ascendara:open-system-center",
  profiles: "ascendara:open-game-profiles",
  collections: "ascendara:open-smart-collections",
});

export function openFeatureCenter(eventName, detail = {}) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}
