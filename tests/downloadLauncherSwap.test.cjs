const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/pages/Download.jsx"),
  "utf8"
);

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertSwapAfterSuccessfulStart(block, label) {
  const download = block.indexOf("await window.electron.downloadFile(");
  const refused = block.indexOf("if (result?.success === false)", download);
  const swap = block.indexOf("await consumePendingLauncherSwap(", download);

  assert.notEqual(download, -1, `${label}: missing download start`);
  assert.notEqual(refused, -1, `${label}: missing failed-start check`);
  assert.notEqual(swap, -1, `${label}: missing launcher-swap finalization`);
  assert.ok(download < refused, `${label}: refusal must be checked after the start attempt`);
  assert.ok(
    refused < swap,
    `${label}: imported launcher entry must survive until the start is accepted`
  );
}

test("immediate local torrent launcher swap is consumed only after start succeeds", () => {
  const block = sliceBetween(
    "const startOrQueueLocalTorrent = async torrentLink =>",
    "if (isTorrentRequest)"
  );
  assertSwapAfterSuccessfulStart(block, "local torrent");
});

test("immediate non-torrent launcher swap is consumed only after start succeeds", () => {
  const block = sliceBetween(
    "const urlToUse = directUrl || inputLink;",
    "// Notify webapp that download started immediately"
  );
  assertSwapAfterSuccessfulStart(block, "direct download");
});
