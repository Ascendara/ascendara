# Automated builds and releases

## First test: no release and no registration

1. Commit the changes (including the newly tracked `scripts/register_build.py`) and push your working branch. Do not push a version tag for this test.
2. GitHub must have the workflow on the default branch before it appears in the Actions manual-run UI. Once it is there, open **Actions → Build and release Ascendara → Run workflow** and select your working branch.
3. Leave **release** and **publish** unchecked. No secrets are required for this compilation test. Without `BUILD_SECRET`, each job creates an ephemeral random key; these builds will not be authorized by the backend. Firebase and private API features are unavailable unless configured.
4. Wait for `prepare`, all four `build` jobs, and `verify`. The `release` job must be skipped. Download `windows-x64`, `linux-x64`, `mac-arm64`, and `mac-x64` from that run. Artifacts expire after 14 days.
5. Install and smoke-test each artifact on the matching OS/CPU before the first official release. Check launching, downloads/extraction, game launch, notifications, and achievement watching.

Equivalent CLI, after the workflow exists on the default branch:

```sh
gh workflow run release.yml --ref YOUR_BRANCH -f release=false -f publish=false
gh run list --workflow release.yml
gh run watch RUN_ID
gh run download RUN_ID --dir downloaded-builds
```

These commands are instructions for the maintainer; implementation validation does not run them.

## Pipeline

`build.yml` performs an unprivileged renderer build and offline automation tests on main pushes and pull requests. It has no release credentials or publishing step.

`release.yml` runs only on manual dispatch and version tag pushes. Every tag must equal `package.json.version` exactly, with no `v` prefix (the macOS updater downloads from that tag name); release tags use stable `x.y.z` versions. Branch dispatches can only build artifacts. Tag dispatches with `release=false` are also build-only. Pushing a version tag creates a **registered draft** after all checks; it never publishes. A dispatch with `release=true, publish=false` creates a **registered draft**, not a public release.

The four matrix entries build concurrently with `fail-fast: false`:

| Target      | Runner           | Existing entry point                      | Output                                             |
| ----------- | ---------------- | ----------------------------------------- | -------------------------------------------------- |
| Windows x64 | `windows-latest` | `yarn dist --skip-registration`           | Existing NSIS `.exe` name; blockmap when generated |
| Linux x64   | `ubuntu-22.04`   | `yarn dist-linux --skip-registration`     | Existing x64 `.AppImage` name                      |
| macOS arm64 | `macos-15`       | `yarn dist-mac-arm64 --skip-registration` | `Ascendara-VERSION-mac-arm64.dmg` and `.zip`       |
| macOS Intel | `macos-15-intel` | `yarn dist-mac-intel --skip-registration` | `Ascendara-VERSION-mac-x64.dmg` and `.zip`         |

The [GitHub runner catalog](https://github.com/actions/runner-images) documents the native Mac CPU labels. Windows intentionally follows the requested `windows-latest`; Linux and Mac OS versions are selected explicitly. Node 22.14.0, Python 3.12.10, Yarn 1.22.22, Rust 1.90.0, and PyInstaller 6.16.0 are selected explicitly. Existing Yarn/Cargo locks are enforced. Yarn downloads, pip downloads, and Cargo registry/git/target data are cached separately by target. Existing Python requirements retain their version ranges, so Python dependency resolution and hosted images are not bit-for-bit reproducible. Inspect dependency changes when renewing pins.

Existing scripts still build Vite, use its relative base paths, copy renderer assets, generate the HMAC build identity, package with Electron Builder, clean temporary assets, and normally register local builds. CI explicitly defers registration. All builder invocations use `--publish never`. Windows cleanup only removes known generated paths. Windows now propagates its exit code; Linux CI rejects the unpacked fallback; registration errors now fail local scripts as well.

Each job verifies required resources before packaging, checks helper executable formats/CPU targets and permissions in the packaged application, and reads `electron/build-signature.json` from **app.asar** to compare it with the registration record. Only top-level installers, optional blockmaps, and a manifest of SHA-256 checksums/provenance/signature are uploaded. Build directories, configuration files, `.env`, and logs are not uploaded. Artifact contents naturally contain the application's runtime configuration.

## Native helper inventory

| Helper              | Windows                               | Linux                               | macOS                             |
| ------------------- | ------------------------------------- | ----------------------------------- | --------------------------------- |
| Downloader          | PyInstaller EXE                       | PyInstaller ELF                     | PyInstaller Mach-O per CPU        |
| GameHandler         | PyInstaller EXE                       | PyInstaller ELF                     | PyInstaller Mach-O per CPU        |
| CrashReporter       | Cargo release EXE                     | Cargo release ELF                   | Cargo release per Rust target     |
| NotificationHelper  | PyInstaller windowed EXE, PyQt6       | PyInstaller, PyQt6                  | PyInstaller, PyQt6                |
| AchievementWatcher  | existing `pkg` Node 18 Windows target | existing `pkg` Node 18 Linux target | `pkg` Node 18 matching native CPU |
| LocalRefresh        | PyInstaller EXE                       | PyInstaller ELF                     | PyInstaller Mach-O per CPU        |
| TorrentHandler      | PyInstaller EXE                       | PyInstaller ELF                     | PyInstaller Mach-O per CPU        |
| LanguageTranslation | Not a Windows packaging resource      | PyInstaller ELF                     | PyInstaller Mach-O per CPU        |

Windows compilation is now checked in as `scripts/build_windows_helpers.py`. The historical batch scripts/specs are ignored and **absent from this checkout**; their exact switches could not be compared. The only local specs found were generated Mac specs, matching the existing Mac builder recipe. All Python sources, requirements, Cargo configuration/build.rs, watcher scripts, and Electron Builder resources were inspected. No tracked native shell/batch build recipes exist.

Windows outputs go to the exact `binaries/NAME/dist/NAME.exe` paths; CrashReporter uses `target/release`. The checked-in UnRAR DLL and Windows-only `unrar` Python wrapper support downloader RAR extraction. The runner's 7-Zip EXE, DLL, and license are bundled for Downloader/TorrentHandler. Missing imports in the checked-in requirements are made explicit (Windows UnRAR wrapper/toasts, LocalRefresh BeautifulSoup, and NotificationHelper requests). Missing files fail immediately; install 7-Zip x64 on a custom Windows host if needed.

Linux retains its dedicated venv, bundles distro UnRAR plus its license and p7zip's native `7z`/`7z.so` plus copyright notices. The workflow installs `unrar`, `p7zip-full`, `libfuse2`, and FLTK/X11/OpenGL development dependencies. The historical nonexistent `AscendaraGofileHelper.py` entry was removed: Gofile is now an imported module in Downloader, not a packaged extra executable. Missing required scripts/dependency installs fail immediately. The p7zip paths are Ubuntu/Debian paths; other local distributions may require adapting them.

Mac retains checksum-verified official 7-Zip 26.03 setup, per-CPU Python venvs, Rust targets, staging directories, and `lipo` checks. Generated Electron Builder configuration points at the verified staging binaries rather than stale default helper paths. No helper cache or compiled binary is shared across OS/CPU targets. `dist-mac`, `dist-mac-all`, and cross-CPU local Python/toolchain overrides remain available.

## Secrets and variables

Set these in **Settings → Secrets and variables → Actions**. Names below match the source application/build tools; `ADMIN_POST_KEY` changes the old script constant into an environment input. No production credentials should be committed.

| GitHub Secret                             | Requirement and use                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUILD_SECRET`                            | Required for release mode; existing HMAC signature key. Build-only runs can use an ephemeral key. Never embedded.                                                      |
| `ADMIN_POST_KEY`                          | Required for release stage only; existing raw Authorization header for `/admin/register-build`. Prefer an environment secret on `release`. Never embedded.             |
| `ASCENDARA_SECRET_SEED`                   | Required for official release mode; existing API request-signing seed, written as `SECRET_SEED` in `electron/config.prod.js`. This is a recoverable client credential. |
| `REACT_APP_AUTHORIZATION`                 | Optional existing legacy Electron configuration, mapped to `AUTHORIZATION`; packaged if supplied.                                                                      |
| `REACT_APP_ASCENDARA_API_KEY`             | Optional existing legacy analytics configuration, mapped to `ASCENDARA_API_KEY`; packaged if supplied.                                                                 |
| `REACT_APP_IMAGE_KEY`                     | Optional existing legacy Electron configuration, mapped to `IMAGE_KEY`; packaged if supplied.                                                                          |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`    | Optional Windows certificate in base64 PFX form and its password.                                                                                                      |
| `CSC_LINK`, `CSC_KEY_PASSWORD`            | Optional Mac Developer ID Application certificate in base64 P12 form and its password.                                                                                 |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` | Optional Apple notarization account and app-specific password. Supply both plus the team variable.                                                                     |

| GitHub Variable                     | Requirement and use                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `REACT_APP_DISCKEY`                 | Optional public Discord client ID, mapped to existing `DISCKEY` runtime field.   |
| `VITE_FIREBASE_API_KEY`             | Optional public Firebase web API identifier.                                     |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Optional Firebase auth domain.                                                   |
| `VITE_FIREBASE_PROJECT_ID`          | Optional Firebase project ID.                                                    |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Optional Firebase storage bucket.                                                |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional Firebase sender ID.                                                     |
| `VITE_FIREBASE_APP_ID`              | Optional Firebase web app ID.                                                    |
| `VITE_FIREBASE_MEASUREMENT_ID`      | Optional Firebase measurement ID.                                                |
| `ASCENDARA_MAC_SIGN_IDENTITY`       | Required with Mac certificate: installed Developer ID Application identity name. |
| `APPLE_TEAM_ID`                     | Required with notarization credentials: Apple developer team ID.                 |

Firebase fields are supplied together for the intended Firebase project; without them the existing development behavior disables Firebase. **Vite embeds all used `VITE_*` values in the renderer. Never place server credentials there.** The Firebase web API identifier is not a private server key; Firebase rules must enforce access.

The local `.env` also names `VITE_STRIPE_PUBLISHABLE_KEY`, and local production configuration contains `FIREBASE_*` fields, but there are no consumers of those names in the checked-in application. They are not required pipeline inputs.

No `.env` is generated in CI. Vite loads `.env` locally; Electron calls dotenv at runtime. `generate_build_signature.js` reads exported `BUILD_SECRET`, falling back to ignored `build.config.json` for local builds; it does not read `.env`. Registration reads exported `ADMIN_POST_KEY`. Python helpers need no build credentials. Their APPDATA/HOME/TEMP and `GF_USERAGENT` variables are runtime settings. Existing local-only overrides are `ASCENDARA_UNRAR_LICENSE`, `ASCENDARA_MAC_PYTHON_ARM64`, `ASCENDARA_MAC_PYTHON_X64`, `ASCENDARA_MAC_RUST_TOOLCHAIN`, and the Mac script's Apple API-key notarization alternatives `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`; the workflow uses the Apple ID method.

The previously ignored local registration script contained a hardcoded admin credential. Replace/rotate it through your backend administration process before first use. The implementation removes it from the script and does not change any production credential.

## Signing

Windows uses Electron Builder's [standard certificate environment inputs](https://www.electron.build/v26/docs/features/code-signing/). Without signing inputs it produces unsigned installers. A hardware-token or cloud-signing certificate needs its vendor-specific integration; this workflow supports exportable PFX credentials. Do not assume arbitrary PyInstaller resources receive an individual Authenticode signature merely because the enclosing installer is signed.

For Apple signing, export Developer ID Application plus private key as P12, base64-encode it into `CSC_LINK`, set its password and `ASCENDARA_MAC_SIGN_IDENTITY`. The import action installs the identity in a temporary keychain **before PyInstaller runs**, so onefile payloads can be signed before embedding. An always-run cleanup step deletes the temporary signing keychain. Builder retains `hardenedRuntime: true` and lists native helpers as additional binaries to sign.

With the full Apple ID/password/team combination, CI passes the existing `--release` flag, requires signing, and enables [Electron Builder notarization](https://www.electron.build/v26/docs/notarization/). Partial notarization credentials fail. Without a certificate, Mac artifacts are unsigned/ad hoc development builds and may require local Gatekeeper handling. Signing without notarization is allowed when no notarization credentials are supplied. Validate signed builds on a clean Mac before distribution.

## Official release procedure

1. Configure repository build/signing secrets and public variables. Create a GitHub environment named `release`; restrict it to protected version tags and optionally require maintainers to approve it. Put `ADMIN_POST_KEY` there. Build secrets must be repository-level because matrix jobs do not use the release environment.
2. Protect main and release tags against untrusted writers. Only trusted code may run credential-bearing manual/tag builds. PR jobs have no release capability.
3. Complete the first build-only run and smoke tests. Update `package.json.version`, commit, and push through your normal review process.
4. When ready for production registration/publication, create and push the matching tag, for example `11.3.4` **only after** setting package version to `11.3.4`. Tag pushes create a registered draft after all checks and any environment approval. Review the draft, then publish it manually in GitHub.
5. To request a registered draft via manual dispatch instead, select an already existing matching tag and use `release=true, publish=false`. A newly pushed tag already triggers the draft release path: do not also dispatch a competing release run. Publishing in one step is only possible from a manual dispatch with `release=true, publish=true`. An existing successful draft can be reviewed and published manually in GitHub.

Release concurrency is keyed by Git ref, with cancellation disabled. The release stage rechecks all four manifests and installer checksums, refuses any existing release for the tag, creates one new draft, uploads assets without `--clobber`, confirms the remote names/sizes, registers each of the four distinct build identities once, then publishes (or keeps the requested draft). Failure before registration never registers an incomplete build. Failure during registration leaves a draft; it cannot expose a successful public release.

The backend contract is unchanged: POST `https://api.ascendara.app/admin/register-build`, raw `Authorization: ADMIN_POST_KEY`, JSON `{buildId, signature, version, timestamp}`, HTTP 200 success. Each OS/CPU build has a distinct identity. The existing HMAC signs timestamp/random/version, **not installer bytes**; compatibility is preserved by matching the packaged identity, while separate SHA-256 manifests validate final installer bytes. No signing/admin secrets are in these manifests.

There is no documented backend registration query, rollback, or idempotency key. Exactly-once behavior across network ambiguity cannot be guaranteed. Consequently, this implementation does not retry registration and refuses to resume any existing release. If a timeout occurs, inspect backend logs/records for the manifest build IDs before deciding which registrations remain. Reconcile and publish the existing draft manually after all four identities are confirmed; do not delete it and blindly rerun. A fresh build-only run is safe but produces different identities.

## Troubleshooting and limits

- All four matrix jobs continue reporting diagnostics if one fails. Inspect the failed step's live Actions log; incomplete installers are not uploaded as successful artifacts. Build/verify jobs only have `contents: read`; only the release job has `contents: write` and the backend admin key.
- Missing resources fail before packaging. Missing/corrupt installer outputs, wrong versions, or different packaged signatures fail before any release side effect.
- Linux AppImage generation must succeed in CI; the local unpacked fallback is not accepted. Check disk space and FUSE/X11/FLTK packages first.
- Rust FLTK uses upstream bundled libraries via Cargo; availability of those downloads and native runner compatibility need the first hosted run. Cargo is locked; a dependency failure is fatal.
- Watcher preserves the existing archived `pkg` 5.8.1 and Node 18 targets. Upstream cached runtime downloads, especially macOS arm64, need validation on hosted runners; if unavailable, the smallest practical follow-up is a tested maintained `pkg` replacement and updated watcher lockfile. That migration is intentionally not silently substituted.
- Windows batch parity cannot be certified without the missing original scripts. Compare any privately retained scripts with the new checked-in recipe before production; inspect icons, extraction tools, and hidden imports in particular.
- The Windows runner's 7-Zip version and existing checked-in UnRAR DLL remain external/native inputs. Required binaries/licenses fail fast if absent. Hosted runner compilation and installation smoke tests are necessary to validate them.
- Native builds were not run across all hosted OSes during local implementation. Local tests validate safety/control flow, not NSIS/DMG/AppImage installation, signing certificates, notarization service access, or backend acceptance.
- Node's existing `yarn test` points at `tests/*.test.cjs`, but no such tracked tests are present in this checkout. Automation adds Python offline tests, run with `python -m unittest discover -s tests -p 'test_build_automation.py'`. Workflow YAML is validated with actionlint.

Manual work remaining: review/merge the implementation, configure credentials/environment protection, reconcile any old exposed admin credential, smoke-test the first native artifacts, and resolve any actual runner-specific failure. Routine subsequent releases require a version change and matching tag push.
