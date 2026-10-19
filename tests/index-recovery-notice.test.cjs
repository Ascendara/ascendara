const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

test('recovery warning shows a failure, allows retry, and clears only after success', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const { window } = dom;
  const { document } = window;
  global.window = window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  let attempt = 0;
  let notified = 0;
  window.electron = {
    getLocalIndexHealth: async () => ({ status: 'missing' }),
    repairLocalIndex: async () => ++attempt === 1
      ? { success: false, error: 'Network unavailable' }
      : { success: true, status: 'ready' },
  };
  const dependencies = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-router-dom': { useNavigate: () => () => {} },
    'react-i18next': { useTranslation: () => ({ t: (_, options) => options.defaultValue }) },
    'lucide-react': { AlertTriangle: () => null, Loader2: () => null },
    '@/components/ui/button': { Button: ({ children, variant, ...props }) => React.createElement('button', props, children) },
    '@/context/SettingsContext': { useSettings: () => ({ settings: {} }) },
    '@/services/gameService': { notifySourceChanged: () => { notified++; } },
  };
  const module = { exports: {} };
  const { code } = transformSync(fs.readFileSync('src/components/IndexRecoveryNotice.jsx', 'utf8'), {
    loader: 'jsx', jsx: 'automatic', format: 'cjs',
  });
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name], window, setInterval, clearInterval });
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(module.exports.default)); });
    assert.match(document.body.textContent, /game index needs attention/);
    await act(async () => { document.querySelector('button').click(); });
    assert.match(document.body.textContent, /Network unavailable/);
    assert.equal(notified, 0);
    assert.equal(document.querySelector('button').disabled, false);
    await act(async () => { document.querySelector('button').click(); });
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(notified, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
