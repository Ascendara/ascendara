# WinGet distribution

Package identifier: `tagoWorks.Ascendara`.

Initial submission: https://github.com/microsoft/winget-pkgs/pull/452700

The initial 11.3.3 manifests are under `manifests/t/tagoWorks/Ascendara/11.3.3`.
They reference the public GitHub release installer. The generator downloads the
installer and verifies its size and SHA-256 against GitHub's asset metadata.
The license comes from the tagged `LICENSE` file (MIT), not the stale license
field in `package.json`.

## One-time setup

1. Create a GitHub **classic** personal access token with `public_repo` scope.
   Store it as the `WINGET_TOKEN` Actions repository secret in Ascendara/ascendara.
   Do not put the token in source files or workflow inputs. WinGetCreate uses it
   to fork microsoft/winget-pkgs and submit PRs; the built-in `GITHUB_TOKEN`
   cannot write to that separate repository.
2. Push these workflow/script changes to the default branch.
3. The initial 11.3.3 PR is already submitted. To retry a later submission, run
   **Submit WinGet package** with its release tag and `submit` selected.
   Leaving `submit` off produces validated manifests as a downloadable artifact.
4. Follow the resulting microsoft/winget-pkgs PR and resolve any Microsoft
   validation/review feedback. Publication is complete only after acceptance.

Token documentation: https://github.com/microsoft/winget-create/blob/main/doc/token.md

## Subsequent releases

The build/release workflow explicitly calls the WinGet workflow after successful
publication. This is necessary because publishing with `GITHUB_TOKEN` does not
trigger a separate `release` workflow. Manually publishing a draft also triggers
the WinGet workflow. Drafts and prereleases are never submitted.

Runs for a version are serialized. The workflow skips submission if that version
is already in winget-pkgs or has an open PR. Failed submissions can be retried
using the standalone workflow without rebuilding or re-registering Ascendara.
A missing token fails the submission step with instructions; it does not undo
the published release. The validated manifest artifact remains available.

The current manifest describes the x64, per-user, default electron-builder NSIS
installer. Review this integration when adding architectures or changing installer
settings, publisher, product name, or license. The script refuses several such
changes rather than silently submitting incompatible metadata.

## Local preparation and validation

```powershell
python scripts/winget_release.py --tag 11.3.3 --check-existing
winget validate --manifest .cache/winget/manifests/t/tagoWorks/Ascendara/11.3.3
```

Before the initial submission, test installation, detection, upgrade, and
uninstallation in a disposable Windows VM. Enable local manifests there with
`winget settings --enable LocalManifestFiles` from an administrator shell, then
use `winget install --manifest <manifest-directory>`. Schema validation alone
does not test installer behavior. Do not use your development installation for
the uninstall test.

To submit locally instead of through Actions, install `wingetcreate`, then run:

```powershell
wingetcreate submit --no-open packaging/winget/manifests/t/tagoWorks/Ascendara/11.3.3
```

WinGetCreate prompts for GitHub authentication when no token is configured.
After Microsoft's acceptance and source propagation, users can run:

```powershell
winget install --id tagoWorks.Ascendara --exact
winget upgrade --id tagoWorks.Ascendara --exact
```
