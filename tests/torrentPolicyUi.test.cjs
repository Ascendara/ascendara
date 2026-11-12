const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = relative =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("Debrid settings route destructive torrent changes through the shared source guard", () => {
  const source = read("src/components/DebridSettings.jsx");

  assert.match(
    source,
    /function Overview\([^)]*\)\s*\{\s*const \{ settings, setSettings \} = useTorrentSafeSettings\(\)/
  );
  assert.match(
    source,
    /function ServiceCard\([^)]*\)\s*\{\s*const \{ settings, setSettings \} = useTorrentSafeSettings\(\)/
  );
  assert.match(source, /wouldDisableActiveTorrentSource\(current, next\)/);
  assert.match(source, /const disconnected = await setSettings/);
  assert.match(source, /if \(!disconnected\) return;/);
});

test("Downloads surfaces expose a disabled-torrent queue block instead of generic waiting", () => {
  const downloads = read("src/pages/Downloads.jsx");
  const bigPicture = read("src/pages/big-picture/DownloadsSurface.jsx");

  assert.match(downloads, /getQueueBlockReason\(item, settings\)/);
  assert.match(downloads, /torrentBlocked[\s\S]*download\.toast\.torrentDisabled/);
  assert.match(
    bigPicture,
    /getQueueBlockReason\(queue\[0\], settings\) === TORRENT_DISABLED_CODE/
  );
  assert.match(
    bigPicture,
    /getQueueBlockReason\(item, settings\) === TORRENT_DISABLED_CODE/
  );
});
