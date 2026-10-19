const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ links, torbox = false, result } = {}) {
  const messages = [];
  const downloads = [];
  const source = fs.readFileSync('src/pages/big-picture/useBigPicturePage.js', 'utf8');
  const start = source.indexOf('  const handleStartDownload =');
  const end = source.indexOf('  const handlePauseDownload =', start);
  const context = {
    SEAMLESS_PROVIDERS: ['gofile', 'pixeldrain'],
    settings: {}, torboxService: { isEnabled: () => torbox },
    gameService: { findGameByGameID: async () => ({ download_links: links }) },
    hasActiveDownloads: async () => false,
    sanitizeText: value => value,
    t: key => key,
    window: { electron: { downloadFile: async (...args) => { downloads.push(args); return result; } } },
    toast: { error: text => messages.push(['error', text]), success: text => messages.push(['success', text]) },
    changeView: view => messages.push(['view', view]),
    setDownloadingGame: () => {},
    setShowExitDialog: value => messages.push(['handoff', value]),
    console: { error: () => {} },
  };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.start = handleStartDownload;', context);
  return { start: context.start, messages, downloads };
}

test('Big Picture recovers missing links from the catalog and reports backend failures', async () => {
  const harness = setup({ links: { gofile: ['https://gofile.io/d/example'] }, result: { success: false, error: 'Directory unavailable' } });
  await harness.start({ game: 'Example', gameID: 'abc' });
  assert.equal(harness.downloads.length, 1);
  assert.deepEqual(harness.messages, [['error', 'Directory unavailable']]);
});

test('missing links show an error instead of throwing', async () => {
  const harness = setup();
  await harness.start({ game: 'Example' }, 'gofile');
  assert.equal(harness.downloads.length, 0);
  assert.deepEqual(harness.messages, [['error', 'bigPicture.downloadError']]);
});

test('TorBox-only providers reach the supported desktop handoff', async () => {
  const harness = setup({ torbox: true });
  await harness.start({ game: 'Example', download_links: { '1fichier': ['https://1fichier.com/example'] } });
  assert.equal(harness.downloads.length, 0);
  assert.deepEqual(harness.messages, [['handoff', true]]);
});
