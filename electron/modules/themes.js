/**
 * Themes Module
 * Handles custom theme management
 */

const fs = require("fs-extra");
const path = require("path");
const { ipcMain, dialog, app } = require("electron");
const { getSettingsManager } = require("./settings");

/**
 * Register theme-related IPC handlers
 */
function registerThemeHandlers() {
  const settingsManager = getSettingsManager();

  // Save custom theme to settings
  ipcMain.handle("save-custom-theme-colors", async (_, customTheme) => {
    try {
      console.log("Saving custom theme:", JSON.stringify(customTheme));

      const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
      const existingSettings = fs.readJsonSync(filePath);
      existingSettings.customTheme = customTheme;
      fs.writeJsonSync(filePath, existingSettings, { spaces: 2 });

      settingsManager.settings = existingSettings;

      return true;
    } catch (error) {
      console.error("Error saving custom theme:", error);
      return false;
    }
  });

  // Export custom theme to JSON file
  ipcMain.handle("export-custom-theme", async (_, customTheme) => {
    try {
      const result = await dialog.showSaveDialog({
        title: "Export Custom Theme",
        defaultPath: "ascendaratheme.json",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const themeData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        customTheme: customTheme,
      };

      await fs.writeJson(result.filePath, themeData, { spaces: 2 });
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error("Error exporting custom theme:", error);
      return { success: false, error: error.message };
    }
  });

  // Import custom theme from JSON file
  ipcMain.handle("import-custom-theme", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Import Custom Theme",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const themeData = await fs.readJson(filePath);

      // Validate the imported data
      if (
        !themeData.customTheme ||
        !Array.isArray(themeData.customTheme) ||
        themeData.customTheme.length === 0
      ) {
        return { success: false, error: "Invalid theme file format" };
      }

      const customColors = themeData.customTheme[0];
      const requiredKeys = [
        "background",
        "foreground",
        "primary",
        "secondary",
        "muted",
        "mutedForeground",
        "accent",
        "accentForeground",
        "border",
        "input",
        "ring",
        "card",
        "cardForeground",
        "popover",
        "popoverForeground",
      ];

      const hasAllKeys = requiredKeys.every(key => customColors.hasOwnProperty(key));
      if (!hasAllKeys) {
        return { success: false, error: "Theme file is missing required color values" };
      }

      return { success: true, customTheme: themeData.customTheme };
    } catch (error) {
      console.error("Error importing custom theme:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerThemeHandlers,
};
