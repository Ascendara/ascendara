const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadModule(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, require: name => dependencies[name],
    console, ...globals,
  });
  return module.exports;
}

test('refresh persists its destination before announcing or downloading the index', async () => {
  const handlers = {};
  const settings = { localIndex: '' };
  const notifications = [];
  let background;
  let downloaded;
  const manager = {
    getSettings: () => settings,
    updateSetting: (key, value) => { settings[key] = value; return true; },
  };
  const { registerLocalRefreshHandlers } = loadModule('electron/modules/local-refresh.js', {
    'fs-extra': {}, path,
    electron: {
      ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
      app: { getPath: () => '/appdata' },
      BrowserWindow: { getAllWindows: () => [{ webContents: {
        send: name => notifications.push([name, settings.localIndex]),
        executeJavaScript: () => {},
      } }] },
    },
    './settings': { getSettingsManager: () => manager },
    './community-index': {
      syncCommunityIndex: async destination => { downloaded = destination; },
      prefetchCovers: () => {},
    },
    './index-relay': {},
  }, { setImmediate: callback => { background = callback; } });
  registerLocalRefreshHandlers();
  await handlers['download-shared-index']({}, '/selected/index');
  assert.equal(settings.localIndex, '/selected/index');
  assert.equal(notifications[0][0], 'settings-updated');
  await background();
  assert.equal(downloaded, settings.localIndex);
  await handlers['download-shared-index']({}, '');
  await background();
  assert.equal(downloaded, '/selected/index');
});

test('changing index folders bypasses the previous folder memory cache', async () => {
  let selected = '/first';
  const reads = [];
  const source = fs.readFileSync('src/services/gameService.js', 'utf8')
    .replace(/import .*?;\n/, '')
    .replace('export default gameService;', 'globalThis.service = gameService;');
  const context = {
    console, sanitizeText: value => value,
    localStorage: { setItem: () => {} },
    window: { electron: {
      getSettings: async () => ({ localIndex: selected }),
      readLocalFile: async file => {
        reads.push(file);
        return JSON.stringify({ games: [{ game: selected }], metadata: {} });
      },
    } },
  };
  vm.runInNewContext(source, context);
  assert.equal((await context.service.getCachedData()).games[0].game, '/first');
  selected = '/second';
  assert.equal((await context.service.getCachedData()).games[0].game, '/second');
  assert.equal(reads.length, 2);
  await context.service.getCachedData();
  assert.equal(reads.length, 2);
});

test('a stale bulk settings save cannot erase the configured index path', async () => {
  const handlers = {};
  let saved = { localIndex: '/existing/index' };
  const { registerSettingsHandlers } = loadModule('electron/modules/settings.js', {
    'fs-extra': {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(saved),
      writeFileSync: (_, value) => { saved = JSON.parse(value); },
    },
    path,
    electron: {
      app: { getPath: () => '/userdata' },
      ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
    },
    './encryption': { encrypt: value => value, decrypt: value => value },
  });
  registerSettingsHandlers();
  await handlers['save-settings']({ sender: { send: () => {} } }, {
    localIndex: '', language: 'es',
  });
  assert.equal(saved.localIndex, '/existing/index');
  assert.equal(saved.language, 'es');
});

function recoveryHarness({ settings = {}, read, sync, save = true } = {}) {
  const handlers = {};
  const calls = [];
  loadModule('electron/modules/local-refresh.js', {
    'fs-extra': { readJson: async () => read ? read() : { games: [{ game: 'Example' }] } },
    path,
    electron: {
      ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
      app: { getPath: () => '/appdata' },
      BrowserWindow: { getAllWindows: () => [] },
    },
    './settings': { getSettingsManager: () => ({
      getSettings: () => settings,
      updateSetting: (key, value) => { if (save) settings[key] = value; return save; },
    }) },
    './community-index': {
      syncCommunityIndex: async (destination, options) => {
        calls.push({ destination, options });
        if (sync) await sync();
      },
      prefetchCovers: () => {},
    },
    './index-relay': {},
  }).registerLocalRefreshHandlers();
  return { handlers, settings, calls };
}

test('health checks detect missing, empty, malformed and unreadable indexes', async () => {
  const cases = [
    [{}, undefined, 'missing-path'],
    [{ localIndex: '/index' }, () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); }, 'missing'],
    [{ localIndex: '/index' }, () => ({ games: [] }), 'empty'],
    [{ localIndex: '/index' }, () => ({ games: {} }), 'empty'],
    [{ localIndex: '/index' }, () => { throw new SyntaxError('Invalid JSON'); }, 'unreadable'],
    [{ localIndex: '/index' }, () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }, 'unreadable'],
    [{ localIndex: '/index' }, undefined, 'ready'],
    [{ customSourcesMode: true }, undefined, 'custom'],
  ];
  for (const [settings, read, expected] of cases) {
    const { handlers } = recoveryHarness({ settings, read });
    assert.equal((await handlers['get-local-index-health']()).status, expected);
  }
});

test('repair initializes the default path and forces a verified download', async () => {
  const { handlers, settings, calls } = recoveryHarness();
  assert.equal((await handlers['repair-local-index']()).success, true);
  assert.equal(settings.localIndex, '/appdata/ascendara/localindex');
  assert.equal(calls[0].destination, settings.localIndex);
  assert.equal(calls[0].options.force, true);
});

test('repair reports network, persistence and invalid download failures', async () => {
  for (const options of [
    { sync: () => { throw new Error('Network unavailable'); } },
    { save: false },
    { read: () => ({ games: [] }) },
  ]) {
    const { handlers } = recoveryHarness(options);
    const result = await handlers['repair-local-index']();
    assert.equal(result.success, false);
    assert.ok(result.error);
  }
});

test('repair keeps the selected folder and does not replace a custom source', async () => {
  const selected = recoveryHarness({ settings: { localIndex: '/selected' } });
  await selected.handlers['repair-local-index']();
  assert.equal(selected.calls[0].destination, '/selected');
  const custom = recoveryHarness({ settings: { customSourcesMode: true } });
  assert.equal((await custom.handlers['repair-local-index']()).success, false);
  assert.equal(custom.calls.length, 0);
});
