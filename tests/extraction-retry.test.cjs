const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('extraction IPC uses local CLI, additional directories, and prevents duplicate starts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ascendara-retry-'));
  try {
    const metadata = path.join(root, 'secondary', 'Example', 'Example.ascendara.json');
    await fs.outputJson(metadata, { game: 'Example', downloadingData: { error: true, progressCompleted: '100.00' } });
    const handlers = new Map();
    const spawned = [];
    const child = new EventEmitter();
    child.exitCode = child.signalCode = null;
    const module = { exports: {} };
    const stubs = {
      electron: { ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, app: {} },
      child_process: { spawn: (executable, args, options) => {
        spawned.push({ executable, args, options });
        process.nextTick(() => child.emit('spawn'));
        return child;
      } },
      './config': { isDev: true, isWindows: false, getPythonPath: () => 'python' },
      './settings': { getSettingsManager: () => ({ getSettings: () => ({
        downloadDirectory: path.join(root, 'primary'), additionalDirectories: [path.join(root, 'secondary')],
      }) }) },
      './utils': { sanitizeText: value => value, sanitizeGameName: value => value.replace(/[\\/]/g, '') },
      './downloaderRuntime': {}, './steamgrid': {},
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/modules/downloads.js'), 'utf8'), {
      require: name => stubs[name] || require(name), module, console, process,
    });
    module.exports.registerDownloadHandlers();
    const retry = handlers.get('retry-extract');
    assert.equal((await retry(null, 'Example')).success, true);
    assert.equal(spawned.length, 1);
    assert.deepEqual(Array.from(spawned[0].args).slice(1), ['--retry-extraction', metadata]);
    assert.equal(spawned[0].options.windowsHide, true);
    assert.equal((await fs.readJson(metadata)).downloadingData.extracting, true);
    assert.equal((await retry(null, 'Example')).success, false);
    assert.equal((await retry(null, '../Example')).success, false);
    assert.equal(spawned.length, 1);
  } finally {
    await fs.remove(root);
  }
});

test('UI retries live recovery or starts local extraction based on download state', async () => {
  const calls = [];
  const context = { window: { electron: {
    retryExtract: async (...args) => { calls.push(['local', ...args]); return { success: true }; },
    extractionRecoveryAction: async (...args) => { calls.push(['live', ...args]); return { success: true }; },
  } } };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/extractionRetryService.js'), 'utf8').replaceAll('export ', '');
  vm.runInNewContext(source + '\nthis.api = {canRetryExtraction, retryExtraction};', context);
  const { canRetryExtraction, retryExtraction } = context.api;
  const failed = { game: 'Example', downloadingData: { error: true, progressCompleted: '100.00' } };
  assert.equal(canRetryExtraction(failed), true);
  assert.equal(canRetryExtraction({ downloadingData: { error: true, progressCompleted: '12' } }), false);
  assert.equal(canRetryExtraction({ downloadingData: { extracting: true, progressCompleted: '100' } }), false);
  await retryExtraction(failed);
  await retryExtraction({ game: 'Example', downloadingData: { awaitingRecoveryAction: true, recoverableError: { requestId: 'request' } } });
  assert.deepEqual(calls, [['local', 'Example'], ['live', 'Example', 'request', 'retry']]);
});
