const fs = require("fs-extra");
const path = require("path");

function locations(directory) {
  const root = path.join(
    path.dirname(directory),
    ".ascendara-updates",
    path.basename(directory)
  );
  return {
    root,
    backup: path.join(root, "original"),
    ready: path.join(root, "ready.json"),
  };
}

// A completed download can leave an all-false downloadingData behind; only
// flags that mean work is pending or in progress should block an update.
function isBusy(data) {
  return Boolean(
    data &&
    (data.downloading ||
      data.extracting ||
      data.verifying ||
      data.updating ||
      data.waiting ||
      data.paused ||
      data.stopped ||
      data.pendingManualInstall ||
      data.awaitingRecoveryAction ||
      data.error ||
      data.verifyError?.length)
  );
}

// fs.copy copies a directory's entries concurrently, which fills the libuv
// threadpool with multi-GB copies and stalls every other fs call in the main
// process. Copy one entry at a time so the app stays responsive.
async function copyTree(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    await fs.symlink(await fs.readlink(source), destination);
  } else if (stat.isDirectory()) {
    await fs.mkdir(destination);
    for (const name of await fs.readdir(source)) {
      await copyTree(path.join(source, name), path.join(destination, name));
    }
  } else {
    await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

async function hasBackup(directory) {
  return fs.pathExists(locations(directory).ready);
}

function metadataPath(directory) {
  return path.join(directory, `${path.basename(directory)}.ascendara.json`);
}

async function readIdle(directory) {
  const info = await fs.readJson(metadataPath(directory));
  if (isBusy(info.downloadingData) || info.isRunning) {
    throw new Error(
      "Stop the game and finish or cancel its current download before updating."
    );
  }
  return info;
}

// Full-copy backup for updates whose helper writes straight into the game
// folder (torrents). onCopyStarted fires once the game is marked as updating,
// so callers can return to the UI while the copy runs.
async function prepare(directory, onCopyStarted = () => {}) {
  const { root, backup, ready } = locations(directory);
  await recover(directory);
  await finish(directory);
  if (await fs.pathExists(root)) {
    throw new Error(
      "A previous update backup exists. Cancel the previous update before starting another."
    );
  }
  const metadata = metadataPath(directory);
  const info = await readIdle(directory);
  await fs.mkdirp(root);
  try {
    await fs.writeJson(
      metadata,
      {
        ...info,
        downloadingData: { updating: true, backingUp: true, progressCompleted: "0.00" },
      },
      { spaces: 4 }
    );
    onCopyStarted();
    // Never hard-link: helpers overwrite files in place. Copy completion is the
    // boundary before which no updater may touch the installed game.
    await copyTree(directory, backup);
    await fs.writeJson(path.join(backup, path.basename(metadata)), info, { spaces: 4 });
    await fs.writeJson(ready, { game: path.basename(directory) });
    await fs.writeJson(
      metadata,
      {
        ...info,
        downloadingData: { updating: true, downloading: true, progressCompleted: "0.00" },
      },
      { spaces: 4 }
    );
  } catch (error) {
    if (!(await fs.pathExists(ready))) {
      await fs.remove(root);
      await fs.writeJson(metadata, info, { spaces: 4 });
    }
    throw error;
  }
}

function stagingFolders(directory) {
  return fs
    .readdir(directory)
    .then(names =>
      names
        .filter(
          name => name === ".ascendara-downloads" || name.startsWith(".ascendara-stage-")
        )
        .map(name => path.join(directory, name))
    );
}

// Updates through AscendaraDownloader need no copy: it downloads and extracts
// into staging folders and only touches the game in _install_payload, which
// moves replaced files into the stage's rollback folder and restores them on
// failure or stop. Returns the metadata to restore if the update is cancelled.
async function beginInPlace(directory) {
  const { root } = locations(directory);
  await recover(directory);
  await finish(directory);
  if (await fs.pathExists(root)) {
    throw new Error(
      "A previous update backup exists. Cancel the previous update before starting another."
    );
  }
  const info = await readIdle(directory);
  const previous = { ...info };
  delete previous.downloadingData;
  delete previous.extractionSources;
  await fs.writeJson(
    metadataPath(directory),
    {
      ...previous,
      downloadingData: { updating: true, downloading: true, progressCompleted: "0.00" },
    },
    { spaces: 4 }
  );
  return previous;
}

// Call only after the downloader has exited. A rollback folder that is still
// present means the downloader died mid-install and could not restore the
// replaced files, so nothing is deleted and the game stays marked as broken.
async function abandonInPlace(directory, previous, deleteStaging) {
  const staging = await stagingFolders(directory);
  for (const folder of staging) {
    if (await fs.pathExists(path.join(folder, "rollback"))) {
      throw new Error(
        `The update was interrupted while installing. Replaced files are kept in ${folder}.`
      );
    }
  }
  if (deleteStaging) {
    for (const folder of staging) await fs.remove(folder);
  }
  const metadata = metadataPath(directory);
  const current = await fs.readJson(metadata);
  const restored = { ...current, ...previous };
  // Play stats may have changed since the update started; keep the newer ones.
  for (const key of ["playTime", "launchCount", "lastPlayed", "favorite"]) {
    if (key in current) restored[key] = current[key];
  }
  delete restored.downloadingData;
  delete restored.extractionSources;
  await fs.writeJson(metadata, restored, { spaces: 4 });
}

async function restore(directory) {
  const { root, backup, ready } = locations(directory);
  if (!(await fs.pathExists(ready))) return false;
  // Keep the abandoned update (including any newly created saves) for recovery.
  // Rename on the same volume avoids needing another full copy to cancel.
  const abandoned = path.join(root, `cancelled-${Date.now()}`);
  if (!(await fs.pathExists(backup))) {
    throw new Error(`Update backup is missing: ${backup}`);
  }
  await fs.writeJson(path.join(root, "restoring.json"), true);
  await fs.rename(directory, abandoned);
  try {
    await fs.rename(backup, directory);
  } catch (error) {
    await fs.rename(abandoned, directory);
    throw error;
  }
  await fs.remove(ready);
  // Retain cancelled files outside the library instead of deleting user data.
  await fs.rename(root, `${root}-cancelled-${Date.now()}`);
  return true;
}

async function recover(directory) {
  const { root, backup, ready } = locations(directory);
  if (!(await fs.pathExists(path.join(root, "restoring.json")))) {
    // The app closed mid-copy: the game was never touched, so drop the partial
    // backup and the backingUp marker.
    if ((await fs.pathExists(root)) && !(await fs.pathExists(ready))) {
      await fs.remove(root);
      const metadata = metadataPath(directory);
      const info = await fs.readJson(metadata).catch(() => null);
      if (info?.downloadingData?.backingUp) {
        delete info.downloadingData;
        await fs.writeJson(metadata, info, { spaces: 4 });
      }
    }
    return;
  }
  if ((await fs.pathExists(directory)) && (await fs.pathExists(backup))) {
    await restore(directory);
    return;
  }
  if (!(await fs.pathExists(directory)) && (await fs.pathExists(backup))) {
    await fs.rename(backup, directory);
  }
  if (!(await fs.pathExists(backup)) && (await fs.pathExists(directory))) {
    await fs.remove(ready);
    await fs.rename(root, `${root}-cancelled-${Date.now()}`);
  }
}

async function recoverLibrary(library, withOperation = (_name, action) => action()) {
  const root = path.join(library, ".ascendara-updates");
  if (!(await fs.pathExists(root))) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      try {
        await withOperation(entry.name, () => recover(path.join(library, entry.name)));
      } catch (error) {
        if (error.message !== "Another download operation is still in progress.")
          throw error;
      }
    }
  }
}

async function finish(directory) {
  if (!(await hasBackup(directory))) return;
  if (await fs.pathExists(path.join(locations(directory).root, "restoring.json"))) return;
  const info = await fs.readJson(metadataPath(directory));
  if (!isBusy(info.downloadingData)) await fs.remove(locations(directory).root);
}

module.exports = {
  prepare,
  beginInPlace,
  abandonInPlace,
  restore,
  finish,
  hasBackup,
  recoverLibrary,
};
