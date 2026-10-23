/**
 * The Ascendara API every renderer request goes to. Set VITE_API_URL to point
 * a build at another server, such as a local copy of the API. The main
 * process reads the same variable in electron/modules/core/config.js.
 */
export const API_URL = (import.meta.env.VITE_API_URL || "https://api.ascendara.app").replace(
  /\/+$/,
  ""
);
