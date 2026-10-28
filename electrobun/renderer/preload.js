// Preload bundle for trusted windows. electrobun.config.ts aliases "electron"
// to ./electron.js; globals.js must load first.

import "./globals.js";
import "../../electron/preload.js";
import { hideLinkStatus } from "./hide-link-status.js";

if (window.__electrobunPlatform === "windows") hideLinkStatus();
