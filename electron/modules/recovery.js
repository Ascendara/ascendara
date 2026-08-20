const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { app } = require("electron");
const { getSettingsManager } = require("./settings");
const { appBranch, appVersion, isWindows } = require("./config");

const MAX_RECOVERY_POINTS = 5;
const RECOVERY_ID_PATTERN = /^settings-\d{13}$/;
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/Ascendara/ascendara/releases?per_page=15";
const MAX_ROLLBACK_BYTES = 1024 * 1024 * 1024;
const ALLOWED_ROLLBACK_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function getRecoveryDirectory() {
  return path.join(app.getPath("userData"), "recovery-points");
}

function getSettingsFilePath() {
  return path.join(app.getPath("userData"), "ascendarasettings.json");
}

function getRecoveryPath(id) {
  if (!RECOVERY_ID_PATTERN.test(String(id || ""))) {
    throw new Error("Invalid recovery point identifier");
  }

  const recoveryDirectory = getRecoveryDirectory();
  const candidate = path.join(recoveryDirectory, `${id}.json`);
  const relative = path.relative(recoveryDirectory, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Recovery point path is outside the recovery directory");
  }
  return candidate;
}

async function listRecoveryPoints() {
  const recoveryDirectory = getRecoveryDirectory();
  await fs.ensureDir(recoveryDirectory);

  const entries = await fs.readdir(recoveryDirectory);
  const points = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const id = entry.slice(0, -5);
    if (!RECOVERY_ID_PATTERN.test(id)) continue;

    try {
      const payload = await fs.readJson(path.join(recoveryDirectory, entry));
      if (
        !payload?.settings ||
        typeof payload.settings !== "object" ||
        Array.isArray(payload.settings)
      ) {
        continue;
      }
      points.push({
        id,
        createdAt: payload.createdAt || null,
        appVersion: payload.appVersion || null,
        reason: payload.reason || "manual",
      });
    } catch (error) {
      console.warn(`[Recovery] Ignoring unreadable recovery point ${entry}:`, error.message);
    }
  }

  return points.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function pruneRecoveryPoints() {
  const points = await listRecoveryPoints();
  const stale = points.slice(MAX_RECOVERY_POINTS);
  await Promise.all(stale.map(point => fs.remove(getRecoveryPath(point.id)).catch(() => {})));
}

async function createRecoveryPoint(reason = "manual", version = appVersion) {
  const settingsPath = getSettingsFilePath();
  if (!(await fs.pathExists(settingsPath))) {
    throw new Error("Ascendara settings file does not exist yet");
  }

  // Read the file directly instead of using getSettings(). Sensitive fields are already
  // encrypted on disk, so the recovery copy never turns API keys into plaintext.
  const settings = await fs.readJson(settingsPath);
  const timestamp = Date.now();
  const id = `settings-${timestamp}`;
  const recoveryPath = getRecoveryPath(id);

  await fs.ensureDir(getRecoveryDirectory());
  await fs.writeJson(
    recoveryPath,
    {
      formatVersion: 1,
      id,
      createdAt: new Date(timestamp).toISOString(),
      appVersion: version || null,
      reason: String(reason || "manual").slice(0, 64),
      settings,
    },
    { spaces: 2 }
  );

  await pruneRecoveryPoints();
  return {
    id,
    createdAt: new Date(timestamp).toISOString(),
    appVersion: version || null,
    reason,
  };
}

async function restoreRecoveryPoint(id) {
  const recoveryPath = getRecoveryPath(id);
  if (!(await fs.pathExists(recoveryPath))) {
    throw new Error("Recovery point was not found");
  }

  const payload = await fs.readJson(recoveryPath);
  if (!payload?.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    throw new Error("Recovery point does not contain valid Ascendara settings");
  }

  const manager = getSettingsManager();
  const restored = manager.saveSettings(payload.settings);
  if (!restored) {
    throw new Error("Ascendara could not restore the settings recovery point");
  }

  return {
    success: true,
    id,
    settings: manager.getSettings(),
  };
}

function parseVersion(value) {
  const normalized = String(value || "").trim().replace(/^v/i, "");
  const numericParts = normalized.match(/\d+/g) || [];
  return numericParts.slice(0, 4).map(part => Number(part));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function requestJson(rawUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "api.github.com") {
      reject(new Error("Rollback release metadata must come from the GitHub API"));
      return;
    }

    const request = https.get(
      parsed,
      {
        timeout: 15000,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Ascendara/${appVersion} Recovery`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      response => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`GitHub releases request failed with HTTP ${response.statusCode}`));
          return;
        }

        let totalBytes = 0;
        const chunks = [];
        response.on("data", chunk => {
          totalBytes += chunk.length;
          if (totalBytes > 2 * 1024 * 1024) {
            request.destroy(new Error("GitHub releases response exceeded the safety limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(new Error(`Could not parse GitHub release metadata: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("GitHub releases request timed out")));
    request.on("error", reject);
  });
}

function selectWindowsInstaller(release) {
  if (!Array.isArray(release?.assets)) return null;

  const version = String(release.tag_name || "").replace(/^v/i, "");
  if (!version) return null;
  const expectedNames = new Set([
    `Ascendara Setup ${version}.exe`,
    `Ascendara.Setup.${version}.exe`,
  ]);

  // Match the release version exactly. This accepts electron-builder's normal NSIS
  // artifact name and Ascendara's historical dotted variant without ever choosing an
  // unrelated executable that happens to be attached to the same release.
  return (
    release.assets.find(asset =>
      expectedNames.has(String(asset.name || "").trim())
    ) || null
  );
}

async function getOfficialRollbackReleases() {
  if (!isWindows || appBranch !== "live") return [];

  const releases = await requestJson(GITHUB_RELEASES_URL);
  if (!Array.isArray(releases)) return [];

  return releases
    .filter(release => !release.draft && !release.prerelease)
    .map(release => ({ release, asset: selectWindowsInstaller(release) }))
    .filter(
      ({ release, asset }) =>
        asset &&
        Number(asset.size || 0) <= MAX_ROLLBACK_BYTES &&
        compareVersions(release.tag_name, appVersion) < 0
    )
    .map(({ release, asset }) => ({
      version: String(release.tag_name || "").replace(/^v/i, ""),
      name: release.name || release.tag_name,
      publishedAt: release.published_at || release.created_at || null,
      assetName: asset.name,
      size: asset.size || 0,
      hasDigest: typeof asset.digest === "string" && asset.digest.startsWith("sha256:"),
    }))
    .slice(0, 5);
}

async function findOfficialRollbackAsset(version) {
  const releases = await requestJson(GITHUB_RELEASES_URL);
  const requestedVersion = String(version || "").replace(/^v/i, "");
  const release = Array.isArray(releases)
    ? releases.find(
        item =>
          !item.draft &&
          !item.prerelease &&
          String(item.tag_name || "").replace(/^v/i, "") === requestedVersion &&
          compareVersions(item.tag_name, appVersion) < 0
      )
    : null;

  if (!release) throw new Error("Requested rollback version is not an older official release");
  const asset = selectWindowsInstaller(release);
  if (!asset?.browser_download_url) {
    throw new Error("Official release does not contain the expected Ascendara installer");
  }
  if (Number(asset.size || 0) > MAX_ROLLBACK_BYTES) {
    throw new Error("Official rollback installer exceeds the 1 GB safety limit");
  }

  return { release, asset };
}

function downloadOfficialInstaller(rawUrl, destination, expectedDigest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Rollback installer exceeded the redirect limit"));
      return;
    }

    const parsed = new URL(rawUrl);
    if (
      parsed.protocol !== "https:" ||
      !ALLOWED_ROLLBACK_DOWNLOAD_HOSTS.has(parsed.hostname)
    ) {
      reject(new Error(`Rollback installer host is not allowed: ${parsed.hostname}`));
      return;
    }

    const request = https.get(
      parsed,
      {
        timeout: 30000,
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": `Ascendara/${appVersion} Recovery`,
        },
      },
      response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, parsed).toString();
          downloadOfficialInstaller(nextUrl, destination, expectedDigest, redirectCount + 1).then(
            resolve,
            reject
          );
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Rollback installer download failed with HTTP ${response.statusCode}`));
          return;
        }

        const contentLength = Number(response.headers["content-length"] || 0);
        if (contentLength > MAX_ROLLBACK_BYTES) {
          response.resume();
          reject(new Error("Rollback installer exceeds the 1 GB safety limit"));
          return;
        }

        const hash = crypto.createHash("sha256");
        const writer = fs.createWriteStream(destination);
        let totalBytes = 0;
        let finished = false;

        const fail = error => {
          if (finished) return;
          finished = true;
          writer.destroy();
          fs.remove(destination).catch(() => {});
          reject(error);
        };

        response.on("data", chunk => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_ROLLBACK_BYTES) {
            request.destroy(new Error("Rollback installer exceeds the 1 GB safety limit"));
            return;
          }
          hash.update(chunk);
        });
        response.on("error", fail);
        writer.on("error", fail);
        writer.on("finish", () => {
          if (finished) return;
          const actualDigest = hash.digest("hex");
          const normalizedExpected = String(expectedDigest || "").replace(/^sha256:/i, "");
          if (normalizedExpected && actualDigest !== normalizedExpected.toLowerCase()) {
            fail(new Error("Rollback installer SHA-256 digest did not match the GitHub release"));
            return;
          }
          finished = true;
          resolve({ path: destination, sha256: actualDigest, size: totalBytes });
        });

        response.pipe(writer);
      }
    );

    request.on("timeout", () => request.destroy(new Error("Rollback installer download timed out")));
    request.on("error", error => {
      fs.remove(destination).catch(() => {});
      reject(error);
    });
  });
}

function launchRollbackInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    const installerProcess = spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
    });

    installerProcess.once("error", reject);
    installerProcess.once("spawn", () => {
      installerProcess.unref();
      resolve();
    });
  });
}

async function rollbackToVersion(version) {
  if (!isWindows) throw new Error("Binary rollback is currently supported on Windows only");
  if (appBranch !== "live") {
    throw new Error("Binary rollback is only available on Ascendara's live branch");
  }

  const { release, asset } = await findOfficialRollbackAsset(version);
  const normalizedVersion = String(release.tag_name || "").replace(/^v/i, "");

  await createRecoveryPoint(`before-rollback-${normalizedVersion}`, appVersion);

  const rollbackDirectory = path.join(os.tmpdir(), "ascendara-rollback");
  await fs.ensureDir(rollbackDirectory);
  const installerPath = path.join(
    rollbackDirectory,
    `Ascendara.Setup.${normalizedVersion}.exe`
  );

  await fs.remove(installerPath).catch(() => {});
  await downloadOfficialInstaller(asset.browser_download_url, installerPath, asset.digest || null);
  await launchRollbackInstaller(installerPath);

  // Only close Ascendara after Windows has confirmed that the trusted installer process
  // exists. A launch failure now returns to the UI instead of closing the working app.
  setTimeout(() => app.quit(), 250);
  return { success: true, version: normalizedVersion };
}

function registerRecoveryHandlers(ipcMain) {
  ipcMain.handle("create-settings-recovery-point", (_event, reason, version) =>
    createRecoveryPoint(reason, version)
  );

  ipcMain.handle("list-settings-recovery-points", () => listRecoveryPoints());

  ipcMain.handle("restore-settings-recovery-point", async (event, id) => {
    const result = await restoreRecoveryPoint(id);
    event.sender.send("settings-updated", result.settings);
    return result;
  });

  ipcMain.handle("list-official-rollback-versions", () => getOfficialRollbackReleases());
  ipcMain.handle("rollback-ascendara-version", (_event, version) => rollbackToVersion(version));
}

module.exports = {
  MAX_RECOVERY_POINTS,
  compareVersions,
  createRecoveryPoint,
  getOfficialRollbackReleases,
  getRecoveryDirectory,
  listRecoveryPoints,
  parseVersion,
  registerRecoveryHandlers,
  restoreRecoveryPoint,
  rollbackToVersion,
};
