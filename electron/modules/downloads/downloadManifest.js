const path = require("path");

function validateFileList(value) {
  if (
    !value ||
    !/^[a-z0-9:_-]+$/i.test(value.transferId || "") ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.length > 10000
  )
    throw new Error("Invalid debrid download file list.");
  const names = new Set();
  const files = value.files.map(file => {
    const url = new URL(file.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Invalid debrid download URL.");
    const filename = file.filename?.replaceAll("\\", "/");
    const parts = filename?.split("/");
    if (
      !filename ||
      path.posix.isAbsolute(filename) ||
      parts.some(
        part =>
          !part ||
          [".", ".."].includes(part) ||
          /[<>:"|?*]/.test(part) ||
          [...part].some(char => char.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) ||
          part.toLowerCase().startsWith(".ascendara") ||
          part.toLowerCase().endsWith(".ascendara.json")
      ) ||
      names.has(filename.toLowerCase())
    )
      throw new Error("Invalid or conflicting debrid filename.");
    names.add(filename.toLowerCase());
    if (file.size != null && (!Number.isSafeInteger(file.size) || file.size < 0))
      throw new Error("Invalid debrid file size.");
    return { url: url.href, filename, size: file.size ?? null };
  });
  return { transferId: value.transferId, files };
}

module.exports = { validateFileList };
