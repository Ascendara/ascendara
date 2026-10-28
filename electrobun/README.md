# Electrobun runtime

Ascendara ships on [Electrobun](https://electrobun.dev) 2.x: a Bun main process
and the system webview (WebKit on macOS, WebView2 on Windows; Chromium/CEF on
Linux). The main process in `electron/` is unchanged Node-style CommonJS. This
folder adapts it.

```
electrobun/
  main.js            Bun entry: finds the app tree, maps require("electron"), starts electron/app.js
  shim/              Electron APIs on top of Electrobun (app, BrowserWindow, ipcMain, session,
                     dialog, shell, Tray, safeStorage, powerSaveBlocker, ...)
  renderer/          preload bundle: contextBridge + ipcRenderer over Electroview RPC
  shared/wire.js     structured-clone-like encoding for IPC values over JSON RPC
  resources.json     helper binaries and assets copied per platform
```

## Commands

```sh
yarn start      # dev build against this checkout, Vite on :5173
yarn package    # quick local stable package in .electrobun/artifacts (missing helpers allowed)
yarn dist       # / dist-mac / dist-linux: full release builds with helpers and signature
```

Hutch (Electrobun's toolchain) is fetched by the pinned `electrobun` npm bootstrap
on first use; the SDK is projected into `.hutch/devkit`.

## How the main process runs

`scripts/electrobun/stage-app.cjs` fills `.electrobun/stage`, copied into the
app as `app/ascendara`:

- packaged: `electron/` with the built UI, a trimmed `package.json`, only the
  npm packages `electron/` requires, and `resources/` (becomes
  `process.resourcesPath`)
- dev: `dev-root.json` pointing back at the checkout

The tree is not bundled, so `__dirname` paths, lazy requires and the helper
binaries behave as they did under Electron. `app.getPath("userData")` resolves
to the same folder Electron used, so existing settings and libraries carry over.

## Differences from Electron

- `session.webRequest` hooks are ignored. Server time sync still runs on its
  timer; the ad-host block in provider windows relies on the DOM sweep.
- Navigation cannot be cancelled before it happens; a vetoed `will-navigate`
  is undone by loading the previous URL. IPC from non-app origins is still
  rejected by `isTrustedIpcSender`.
- Downloads in webviews save to the Downloads folder; a cancelled
  `will-download` item is deleted once it settles.
- `executeJavaScript` reports results through the host-message bridge.
- Popups cannot keep `window.opener`, so Firebase Google sign-in uses its
  redirect flow in the main window.
- Dropped files have no path; the Library opens the add-game dialog instead.
- `safeStorage` keeps an AES-GCM key in the Keychain, DPAPI or libsecret and
  still decrypts values Electron wrote.
- Windows and Linux register `ascendara://` and login items through the
  registry and XDG files; macOS uses `urlSchemes` in `electrobun.config.ts`.
- Updates come from `release.baseUrl` (latest GitHub release) through
  Electrobun's updater. There is no portable Windows build.
