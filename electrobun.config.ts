import { fileURLToPath } from "node:url";
import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json";

// Signing and notarization are opt-in so local builds work without certificates.
const sign = process.env.ASCENDARA_CODESIGN === "1";

export default {
	app: {
		name: "Ascendara",
		identifier: "com.tagoworks.ascendara",
		version: pkg.version,
		description: pkg.description,
		// macOS only; Windows and Linux are registered at runtime by the shim.
		urlSchemes: ["ascendara"],
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "electrobun/main.js",
		},
		views: {
			// Trusted windows load this as their preload script.
			preload: {
				entrypoint: "electrobun/renderer/preload.js",
				format: "iife",
				alias: {
					electron: fileURLToPath(new URL("./electrobun/renderer/electron.js", import.meta.url)),
				},
				define: {
					"process.platform": "globalThis.__ascendaraNodePlatform",
					"process.versions": "globalThis.__ascendaraProcessVersions",
					"process.env": "globalThis.__ascendaraProcessEnv",
				},
			},
		},
		copy: {
			".electrobun/stage": "ascendara",
		},
		// build/ is Vite's output folder.
		buildFolder: ".electrobun/build",
		artifactFolder: ".electrobun/artifacts",
		watch: ["electron", "electrobun"],
		watchIgnore: [".electrobun/**", "build/**"],
		mac: {
			bundleCEF: false,
			codesign: sign,
			notarize: sign,
			icons: ".electrobun/icon.iconset",
			entitlements: {
				"com.apple.security.cs.allow-jit": true,
				"com.apple.security.cs.allow-unsigned-executable-memory": true,
				"com.apple.security.cs.disable-library-validation": true,
			},
		},
		win: {
			bundleCEF: false,
			icon: "readme/logo/ico/ascendara_256x.ico",
		},
		// GTK WebKit cannot layer webviews reliably, so Linux ships Chromium.
		linux: {
			bundleCEF: true,
			defaultRenderer: "cef",
			icon: "readme/logo/png/ascendara_512x.png",
		},
	},
	runtime: {
		// Ascendara keeps running in the tray when its window closes.
		exitOnLastWindowClosed: false,
	},
	// The updater reads {baseUrl}/{channel}-{os}-{arch}-update.json; ci_build.py
	// uploads those files unrenamed to each GitHub release.
	release: {
		baseUrl:
			process.env.ASCENDARA_RELEASE_BASE_URL ||
			"https://github.com/Ascendara/ascendara/releases/latest/download",
	},
} satisfies ElectrobunConfig;
