/**
 * Download a URL to a file with progress, writing to a .part file first so an
 * interrupted download never leaves a truncated executable behind.
 */

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

/**
 * @param {string} url - File to download
 * @param {{directory: string, filename: string, onProgress?: (progress: {percent: number, transferredBytes: number, totalBytes: number}) => void}} options
 * @returns {Promise<string>} - Path of the downloaded file
 */
async function downloadFile(url, { directory, filename, onProgress }) {
  const destination = path.join(directory, filename);
  const partial = `${destination}.part`;
  await fs.promises.mkdir(directory, { recursive: true });

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const totalBytes = parseInt(response.headers.get("content-length"), 10) || 0;
  let transferredBytes = 0;
  const body = Readable.fromWeb(response.body);
  body.on("data", chunk => {
    transferredBytes += chunk.length;
    onProgress?.({
      percent: totalBytes ? transferredBytes / totalBytes : 0,
      transferredBytes,
      totalBytes,
    });
  });

  try {
    await pipeline(body, fs.createWriteStream(partial));
    if (totalBytes && fs.statSync(partial).size !== totalBytes) {
      throw new Error("The download ended before the whole file arrived");
    }
    await fs.promises.rename(partial, destination);
  } catch (error) {
    await fs.promises.rm(partial, { force: true });
    throw error;
  }
  return destination;
}

module.exports = { downloadFile };
