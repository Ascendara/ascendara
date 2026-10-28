// Values electrobun.config.ts substitutes for process.* in electron/preload.js,
// so no Node-style `process` global leaks into the page.

const platforms = { macos: "darwin", windows: "win32", linux: "linux" };

Object.defineProperties(globalThis, {
  __ascendaraNodePlatform: { value: platforms[window.__electrobunPlatform] || "linux" },
  __ascendaraProcessVersions: { value: Object.freeze({ electrobun: "2" }) },
  __ascendaraProcessEnv: { value: Object.freeze({}) },
});
