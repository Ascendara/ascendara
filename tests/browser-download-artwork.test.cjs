const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  const requests = [];
  const context = { module: { exports: {} }, console: { log() {}, warn() {}, error() {} }, setTimeout, require(name) {
    if (name === 'axios') return { get: async url => {
      requests.push(url);
      return { data: { success: true, data: url.includes('/search/') ? [{ id: 111 }] : [] } };
    } };
    if (name === 'fs-extra') return { existsSync: () => false };
    if (name === './auth-helper') return { generateAuthHeaders: () => ({}) };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/modules/steamgrid.js'), 'utf8'), context);
  return { fetchAssets: context.module.exports.fetchGameAssets, requests };
}
test('explicit artwork selection wins over the download name', async () => {
  const { fetchAssets, requests } = load();
  await fetchAssets('My custom game name', '/unused', 222);
  assert.ok(requests.length >= 3);
  assert.ok(requests.every(url => url.includes('/game/222?')));
  assert.ok(requests.some(url => url.includes('/grids/')));
  assert.ok(requests.some(url => url.includes('/heroes/')));
  assert.ok(requests.some(url => url.includes('/logos/')));
});
test('existing callers retain automatic matching, including legacy null argument', async () => {
  for (const selection of [undefined, null]) {
    const { fetchAssets, requests } = load();
    await fetchAssets('My game', '/unused', selection);
    assert.ok(requests[0].includes('/search/autocomplete/My%20game'));
    assert.ok(requests.slice(1).every(url => url.includes('/game/111?')));
  }
});
test('invalid artwork IDs fail before any network requests', async () => {
  const { fetchAssets, requests } = load();
  for (const id of [0, -1, 1.5, '222', '../other']) await assert.rejects(fetchAssets('game', '/unused', id));
  assert.equal(requests.length, 0);
});
