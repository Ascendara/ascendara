const path = require("path");
const fs = require("fs").promises;

/**
 * Loads the user settings from Ascendara's settings file.
 * @returns {Promise<Object>} Parsed settings object, or {} on error.
 */
async function getSettings() {
  try {
    const appData = process.env.APPDATA;
    const settingsPath = path.join(appData, "ascendara", "ascendarasettings.json");
    const data = await fs.readFile(settingsPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(
        "Settings file not found. This is normal on first run. Using default settings."
      );
    } else {
      console.error("Error reading settings file:", error);
    }
    return {};
  }
}

module.exports = {
  getSettings,
};
