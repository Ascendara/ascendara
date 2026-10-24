/**
 * macOS Game Shortcuts
 * A shortcut is a small app bundle named after the game, with its cover as
 * the icon, whose only job is to open an ascendara://play link, the way the
 * Highball app makes Mac apps for its games. The link carries a token kept
 * on this Mac, so a web page opening the scheme can't start games.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getSettingsManager } = require("../core/settings");

const execFileAsync = promisify(execFile);
const COVER_FILES = [
  "grid.ascendara.jpg",
  "grid.ascendara.png",
  "header.ascendara.jpg",
  "header.ascendara.png",
];
const ICON_SIZES = [16, 32, 128, 256, 512];

function launchToken() {
  const settings = getSettingsManager();
  let token = settings.getSetting("shortcutLaunchToken");
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    settings.updateSetting("shortcutLaunchToken", token);
  }
  return token;
}

function isValidLaunchToken(token) {
  const expected = getSettingsManager().getSetting("shortcutLaunchToken");
  if (!expected || typeof token !== "string" || token.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A file-system-safe app name: "Half-Life: Alyx" -> "Half-Life Alyx"
 */
function appName(game) {
  return (
    String(game)
      .replace(/[/\\:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 80) || "Game"
  );
}

function infoPlist(name, bundleId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIdentifier</key><string>${escapeXml(bundleId)}</string>
  <key>CFBundleName</key><string>${escapeXml(name)}</string>
  <key>CFBundleDisplayName</key><string>${escapeXml(name)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;
}

/**
 * Cover to .icns with the system's own tools: a centered square, then the
 * standard sizes. The shortcut still works when this fails, just without icon.
 */
async function makeIcon(cover, icns) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "ascendara-icon-"));
  try {
    const base = path.join(work, "base.png");
    const iconset = path.join(work, "icon.iconset");
    await fs.ensureDir(iconset);
    await execFileAsync("/usr/bin/sips", [
      "-s",
      "format",
      "png",
      "-Z",
      "1024",
      cover,
      "--out",
      base,
    ]);
    await execFileAsync("/usr/bin/sips", ["-c", "1024", "1024", base, "--out", base]);
    for (const size of ICON_SIZES) {
      for (const scale of [1, 2]) {
        const pixels = String(size * scale);
        const name =
          scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
        await execFileAsync("/usr/bin/sips", [
          "-z",
          pixels,
          pixels,
          base,
          "--out",
          path.join(iconset, name),
        ]);
      }
    }
    await execFileAsync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", icns]);
  } finally {
    await fs.remove(work).catch(() => {});
  }
}

/**
 * Write the shortcut app for an installed game into a directory and return its path.
 */
async function createMacShortcut({ game, directory }, targetDirectory) {
  const name = appName(game);
  const app = path.join(targetDirectory, `${name}.app`);
  const contents = path.join(app, "Contents");
  const hash = crypto.createHash("sha1").update(game).digest("hex").substring(0, 12);
  // encodeURIComponent leaves ' as it is, which would end the quoted URL below
  const encoded = encodeURIComponent(game).replace(/'/g, "%27");
  const url = `ascendara://play/${encoded}?t=${launchToken()}`;

  await fs.remove(app);
  await fs.ensureDir(path.join(contents, "MacOS"));
  await fs.ensureDir(path.join(contents, "Resources"));
  await fs.writeFile(
    path.join(contents, "Info.plist"),
    infoPlist(name, `app.ascendara.shortcut.${hash}`)
  );
  const launcher = path.join(contents, "MacOS", "launch");
  await fs.writeFile(launcher, `#!/bin/sh\nexec /usr/bin/open '${url}'\n`);
  await fs.chmod(launcher, 0o755);

  const cover = (directory ? COVER_FILES : [])
    .map(file => path.join(directory, file))
    .find(file => fs.existsSync(file));
  if (cover) {
    await makeIcon(cover, path.join(contents, "Resources", "icon.icns")).catch(error =>
      console.warn(`[Shortcuts] No icon for ${game}:`, error.message)
    );
  }
  // A stable identity and no quarantine flag, as for any app built on this Mac
  await execFileAsync("/usr/bin/codesign", ["--force", "--sign", "-", app]).catch(
    () => {}
  );
  return app;
}

module.exports = { createMacShortcut, isValidLaunchToken, appName };
