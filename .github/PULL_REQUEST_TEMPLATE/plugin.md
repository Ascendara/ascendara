## Plugin

<!-- Name, version, and what the plugin does in a sentence or two. -->

## New or update

<!-- New plugin, or an update? For an update, list what changed. -->

## Permissions

<!-- Each permission in manifest.json and why the plugin needs it. Write "None" if it has none. -->

## How it was tested

<!-- The Ascendara version and OS you tested on, and what you checked. -->

## Checklist

- [ ] This pull request targets `development`
- [ ] It only changes my plugin's folder in `plugins/` and `plugins/index.json`
- [ ] I ran `node scripts/build-plugin-index.cjs` after my last change
- [ ] `version` in `manifest.json` is higher than the version already listed (for updates)
- [ ] The code is readable source, not minified or obfuscated, and bundles no programs
- [ ] I tested it with **Install from folder**, and turning it off leaves nothing behind
- [ ] It doesn't send data about the user anywhere, or that's its clear, stated purpose and the user turns it on
