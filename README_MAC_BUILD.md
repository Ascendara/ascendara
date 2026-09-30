# macOS builds

Use `yarn dist-mac` on a Mac. The script builds native Python helpers, the Rust crash reporter, the achievement watcher, the production renderer, and then a DMG and ZIP in `dist/`. `yarn dist` remains the Windows build and `yarn dist-linux` remains the Linux build.

## Prerequisites

- Xcode command line tools, Node, Yarn, Python 3 with venv, and Rust/Cargo.
- Run `yarn setup-mac` to download the official macOS 7-Zip distribution into `.build-tools/macos/7zip`. Setup verifies a pinned SHA-256 checksum, the CPU architecture, and RAR decoder availability. The binary and license notices are bundled into both download helpers. Standalone UnRAR and `ASCENDARA_UNRAR_LICENSE` are no longer required for Mac builds. End users do not need Homebrew, Cargo, Python, or an archive utility installed.
- Installed JavaScript dependencies (`yarn install --frozen-lockfile`).
- The existing build-signature secret in `build.config.json` or `BUILD_SECRET`. Register the resulting `electron/build-signature.json` with the release backend using the project's release process. The repository does not include the private registration script.

```sh
brew install rust   # developer build dependency; includes Cargo
yarn setup-mac      # official 7zz with RAR support and notices
yarn dist-mac --check
yarn dist-mac --dir  # local unpacked .app
yarn dist-mac        # DMG and ZIP
```

Choose the target explicitly:

```sh
yarn dist-mac-arm64              # Apple Silicon DMG + ZIP
yarn dist-mac-intel              # Intel DMG + ZIP
yarn dist-mac-all                # both sets of artifacts
# Equivalent: yarn dist-mac --arch arm64|x64|both
yarn dist-mac --arch both --check
```

`yarn dist-mac` defaults to the running host architecture. `--arch both` produces **separate** arm64 and x64 applications/installers with architecture-specific filenames. It builds the renderer and signature once, then builds and validates every helper for each target. Python environments and PyInstaller caches are isolated per architecture, and Rust receives an explicit Apple target triple. The shared official `7zz` contains both CPU slices; PyInstaller bundles the matching slice. No arm64 helper is reused inside the Intel app.

To build both targets on an Apple Silicon Mac:

1. Install a universal2 Python from [python.org](https://www.python.org/downloads/macos/). If using separate Python installations, set `ASCENDARA_MAC_PYTHON_ARM64` and `ASCENDARA_MAC_PYTHON_X64` to their executable paths.
2. Install Rosetta 2 using `softwareupdate --install-rosetta` and review/accept Apple's license. Rosetta is needed by the **build machine** to run Intel Python and dependencies; the resulting Intel app runs natively on Intel Macs.
3. Install rustup and both Rust targets:

   ```sh
   brew install rustup
   export PATH="$(brew --prefix rustup)/bin:$PATH"
   rustup toolchain install stable --profile minimal
   rustup target add --toolchain stable aarch64-apple-darwin x86_64-apple-darwin
   ```

The build detects rustup, including its keg-only Homebrew installation, and uses the stable toolchain. `ASCENDARA_MAC_RUST_TOOLCHAIN` can select another installed rustup toolchain. A native-only build can still use Homebrew Rust without rustup. On an Intel build machine, use `--arch x64`; building arm64 helpers requires an environment capable of running arm64 Python. The preflight checks all requested targets before compiling anything.

Outputs are `dist/Ascendara-<version>-mac-arm64.{dmg,zip}` and `dist/Ascendara-<version>-mac-x64.{dmg,zip}`. `--dir` and `--release` work with each target and with `--arch both`.

For a distribution release, install your Developer ID Application certificate in the keychain, set `ASCENDARA_MAC_SIGN_IDENTITY`, and provide either `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, or `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. Then run:

```sh
yarn dist-mac --release
```

Release mode requires signing and notarization credentials and enables forced code signing. The identity is also passed to PyInstaller to sign embedded onefile payloads. Local builds do not request notarization. See the [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/) and [PyInstaller macOS signing documentation](https://pyinstaller.org/en/v6.6.0/feature-notes.html#macos-binary-code-signing).

## Runtime support and remaining limits

- Packaged downloads, translations, local refresh, notifications, and the game handler use native helpers in `Contents/Resources`. Finder launches include Homebrew and Wine paths. The achievement watcher reads macOS settings and monitors Ascendara Wine prefixes.
- Native executable files and `.app` bundles can be selected for games. Windows `.exe` games require a working Wine installation; compatibility remains game-dependent. Proton/UMU features remain Linux-only. The catalogue is not converted into native Mac games.
- Ludusavi is detected at `~/.ascendara/ludusavi` or on PATH on macOS. Install a native macOS Ludusavi binary; the Linux CDN binary is not used on Mac.
- Steam Workshop's existing SteamCMD installer, Windows dependency installers, Defender exclusions, and the Windows uninstaller do not run on macOS. Launcher discovery supports Steam on Mac; other launcher integrations still depend on Windows metadata.
- Automatic updates and branch switches require a macOS release feed and installer implementation. Until those exist, install the desired DMG manually. Mac handlers reject Windows/AppImage update payloads.
- Torrent downloads still require qBittorrent with its Web UI configured, as in the existing implementation.

## Validation

Run `yarn test`, `yarn test-mac-extraction`, and `yarn build`. The extraction tests require the downloader’s Python requirements (`.build_venv_mac/arm64/bin/python3 -m unittest discover -s tests -p 'test_macos*.py'` after a build also works). Set `ASCENDARA_RAR_TEST_FIXTURE` to a local RAR5 test archive to include the optional RAR extraction test. Tests cover resource paths, architecture-independent helper naming, tool/language storage, platform packaging schema, and rejection of incompatible update payloads.

Before publishing, test the actual signed app from Finder on each supported architecture: onboarding, deep links, download/extraction/resume, native and Wine game launches, stopping games/playtime, notifications, translations, achievement monitoring, and Ludusavi backups. Verify the app using `codesign --verify --deep --strict` and `spctl --assess --type execute`. These live workflows and Apple notarization cannot be established by the unit tests alone.

The Mac extraction setup was verified with the downloader’s real extraction worker using ZIP, 7z, and RAR5 fixtures. The build preflight passes with Cargo and the project-local official 7-Zip distribution. An unsigned Apple Silicon `.app`, DMG, and ZIP were built successfully, and the compiled downloader passed its CLI startup smoke test. Both packaged download helpers contain `7zz` and license notices. Signing, notarization, backend build registration, Intel builds, and live app testing remain separate release checks.

## Extraction tool choice

The official macOS `7zz` supports both Intel and Apple Silicon and includes RAR decoders. The downloader already handles ordinary ZIP files in Python and uses 7-Zip for 7z, RAR, and ZIP methods requiring it. The bundled tool takes priority over PATH installations, since some distributions omit RAR codecs. An installed UnRAR remains an optional existing fallback/preferred RAR path in development; it is not required by the Mac package.

Ascendara uses 7-Zip, licensed under the GNU LGPL with BSD portions and the unRAR restriction. Its complete distribution notices are shipped in `Contents/Resources/licenses/7zip` and inside the helpers. Source and upstream downloads are available at [7-zip.org](https://www.7-zip.org/download.html); the pinned release is [26.03](https://github.com/ip7z/7zip/releases/tag/26.03). Updating the pinned version requires updating both URL and SHA-256 in `scripts/setup_macos_tools.py` and rerunning extraction tests.
