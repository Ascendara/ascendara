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

async function hasBackup(directory) {
  return fs.pathExists(locations(directory).ready);
}

async function prepare(directory) {
  const { root, backup, ready } = locations(directory);
  await recover(directory);
  await finish(directory);
  if ((await fs.pathExists(root)) && !(await fs.pathExists(ready))) {
    await fs.remove(root);
  }
  if (await fs.pathExists(root)) {
    throw new Error(
      "A previous update backup exists. Cancel the previous update before starting another."
    );
  }
  const metadata = path.join(directory, `${path.basename(directory)}.ascendara.json`);
  const info = await fs.readJson(metadata);
  if (info.downloadingData || info.isRunning) {
    throw new Error(
      "Stop the game and finish or cancel its current download before updating."
    );
  }
  await fs.mkdirp(root);
  try {
    // Never hard-link: helpers overwrite files in place. Copy completion is the
    // boundary before which no updater may touch the installed game.
    await fs.copy(directory, backup, { dereference: false, errorOnExist: true });
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
    if (!(await fs.pathExists(ready))) await fs.remove(root);
    throw error;
  }
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
  if (!(await fs.pathExists(path.join(root, "restoring.json")))) return;
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
  const info = await fs.readJson(
    path.join(directory, `${path.basename(directory)}.ascendara.json`)
  );
  if (!info.downloadingData) await fs.remove(locations(directory).root);
}

module.exports = { prepare, restore, finish, hasBackup, recoverLibrary };
