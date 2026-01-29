const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// REPLACE WITH A KEY FOR TESTING
const SGDB_API_KEY = "STEAMGRIDDB_API_KEY";
const BASE_URL = "https://www.steamgriddb.com/api/v2";

async function fetchGameAssets(gameName, gameDir) {
  // First: check if we already have everything
  const expectedFiles = [
    "grid.ascendara.jpg",
    "hero.ascendara.jpg",
    "logo.ascendara.png",
  ];

  // Verify if all files already exist
  const allExist = expectedFiles.every(file => {
    const base = file.split(".")[0]; // 'grid', 'hero', 'logo'
    return (
      fs.existsSync(path.join(gameDir, base + ".ascendara.jpg")) ||
      fs.existsSync(path.join(gameDir, base + ".ascendara.png")) ||
      fs.existsSync(path.join(gameDir, base + ".ascendara.jpeg"))
    );
  });

  if (allExist) {
    return true;
  }
  const headers = { Authorization: `Bearer ${SGDB_API_KEY}` };
  let gameId = null;

  try {
    const cleanName = gameName
      .replace(/ v[\d\.]+.*$/i, "")
      .replace(/ premium edition/i, "")
      .trim();
    console.log(`[SteamGrid] Searching for: "${cleanName}"`);

    const searchRes = await axios.get(
      `${BASE_URL}/search/autocomplete/${encodeURIComponent(cleanName)}`,
      { headers }
    );

    if (searchRes.data.success && searchRes.data.data.length > 0) {
      gameId = searchRes.data.data[0].id;
      console.log(`[SteamGrid] Found GameID ${gameId}`);
    }

    if (!gameId) return false;

    // Definition of types (without extension in the filename for now)
    const downloads = [
      {
        type: "grids",
        dimensions: ["600x900"],
        baseName: "grid.ascendara",
        styles: "alternate",
      },
      {
        type: "heroes",
        dimensions: ["1920x620", "3840x1240"],
        baseName: "hero.ascendara",
        styles: "alternate",
      },
      { type: "logos", baseName: "logo.ascendara", styles: "official" },
    ];

    for (const item of downloads) {
      // 1. Check if the file already exists (with any extension)
      const extensions = [".jpg", ".jpeg", ".png"];
      let alreadyExists = false;
      for (const ext of extensions) {
        if (fs.existsSync(path.join(gameDir, item.baseName + ext))) {
          alreadyExists = true;
          break;
        }
      }
      if (alreadyExists) continue;

      // 2. Craft the request
      let url = `${BASE_URL}/${item.type}/game/${gameId}?styles=${item.styles}&sort=score`;
      if (item.dimensions) url += `&dimensions=${item.dimensions.join(",")}`;
      if (item.type !== "logos") url += `&mimes=image/jpeg,image/png`;

      try {
        const res = await axios.get(url, { headers });

        if (res.data.success && res.data.data.length > 0) {
          const imageUrl = res.data.data[0].url;

          // 3. Detect extension and craft final name
          let ext = path.extname(imageUrl).split("?")[0];
          if (!ext) ext = ".jpg"; // Fallback

          const finalFileName = item.baseName + ext;
          const finalFilePath = path.join(gameDir, finalFileName);

          // 4. Download
          const writer = fs.createWriteStream(finalFilePath);
          const response = await axios({
            url: imageUrl,
            method: "GET",
            responseType: "stream",
          });

          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          console.log(`[SteamGrid] Downloaded ${finalFileName}`);
        }
      } catch (e) {
        console.warn(`[SteamGrid] Failed to get ${item.type}: ${e.message}`);
      }
    }
    return true;
  } catch (error) {
    console.error(`[SteamGrid] Error:`, error.message);
    return false;
  }
}

module.exports = { fetchGameAssets };
