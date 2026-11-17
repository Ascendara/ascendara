# Ascendara Plugins

This folder is the official plugin list. Ascendara reads `index.json` from here
on GitHub and shows these plugins under **Settings → Plugins → Browse**.

Each plugin lives in its own folder, named after the plugin's id:

```
plugins/
  index.json            generated, don't edit by hand
  hide-ascend-nav/
    manifest.json
    index.js
```

## Submitting a plugin

1. Build and test your plugin locally with **Install from folder**.
2. Post it in the plugin submissions channel on the
   [Ascendara Discord](https://discord.gg/ap6W3xMTKW) with a link to its source.
3. A maintainer reviews the code, adds the folder here, and regenerates the index.

Updates go through the same review. Bump `version` in `manifest.json` for every
change, or users won't be offered the update.

## For maintainers

After adding or changing a plugin folder:

```bash
node scripts/build-plugin-index.cjs
```

This validates every manifest and pins each file by SHA-256. Ascendara refuses
files that don't match, so users always get the version that was reviewed.
`npm test` fails if `index.json` is out of date.

The guide to writing plugins is at https://ascendara.app/docs/plugins/overview.
