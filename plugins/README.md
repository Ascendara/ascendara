# Ascendara Plugins

This folder is the official plugin list. Ascendara reads `index.json` from here
on the `development` branch and shows these plugins under **Settings → Plugins → Browse**.

Each plugin lives in its own folder, named after the plugin's id:

```
plugins/
  index.json            generated, don't edit by hand
  hide-ascend-nav/
    manifest.json
    index.js
```

## Submitting a plugin

Plugins are submitted as pull requests to `development`:

1. Build and test your plugin with **Install from folder** in Ascendara.
2. Fork this repository and create a branch from `development`.
3. Copy your plugin's folder into `plugins/`. The folder name is the plugin's id.
4. From the repository root, run:

   ```bash
   node scripts/build-plugin-index.cjs
   ```

   It only needs Node.js 22, no `yarn install`. It checks your manifest and
   adds your plugin, with a hash of every file, to `index.json`.

5. Commit your plugin's folder and `plugins/index.json`, and nothing else.
6. Open a pull request against `development` using the plugin template: add
   `?template=plugin.md` to the pull request URL, or copy
   [`.github/PULL_REQUEST_TEMPLATE/plugin.md`](../.github/PULL_REQUEST_TEMPLATE/plugin.md)
   into the description.

Automated checks validate every manifest and fail if `index.json` doesn't match
the plugin folders. A maintainer then reviews the code. Once it's merged, the
plugin appears in **Browse** for everyone within a few minutes.

### Updating a plugin

Same steps: change your files, **increase `version`** in `manifest.json`, run
the script again, and open a pull request listing what changed. Users are only
offered an update when the version goes up.

## Reviewing

- The pull request should only touch one plugin's folder and `plugins/index.json`.
- Read every file. Reject minified or obfuscated code, bundled programs, and
  permissions the plugin doesn't use.
- The `Source checks` workflow must pass. It fails if a manifest is invalid or
  `index.json` is stale.

The guide to writing plugins is at https://ascendara.app/docs/plugins/overview.
