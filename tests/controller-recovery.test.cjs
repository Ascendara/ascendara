const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

test('controller input resumes after focus loss and reconnection without held-button activation', () => {
  const window = new EventTarget();
  const document = new EventTarget();
  let focused = true;
  document.hasFocus = () => focused;
  document.hidden = false;
  let pad = { index: 0, connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const frames = new Map();
  let nextFrame = 0;
  const module = { exports: {} };
  const code = buildSync({ entryPoints: ['src/pages/big-picture/controllerDispatcher.js'], bundle: true, write: false, format: 'cjs' }).outputFiles[0].text;
  vm.runInNewContext(code, {
    module, exports: module.exports, window, document,
    navigator: { getGamepads: () => pad ? [pad] : [] },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const actions = [];
  const unsubscribe = module.exports.subscribeController(action => actions.push(action), () => ({ enabled: true }));
  const tick = () => {
    assert.equal(frames.size, 1);
    const [id, fn] = frames.entries().next().value;
    frames.delete(id);
    fn(nextFrame * 16);
  };
  tick();
  pad.buttons[0].pressed = true;
  tick();
  assert.deepEqual(actions, ['CONFIRM']);
  focused = false;
  window.dispatchEvent(new Event('blur'));
  tick();
  focused = true;
  window.dispatchEvent(new Event('focus'));
  tick();
  assert.equal(actions.length, 1);
  pad.buttons[0].pressed = false;
  tick();
  pad.buttons[0].pressed = true;
  tick();
  assert.equal(actions.length, 2);
  const replacement = { ...pad, index: 3, buttons: pad.buttons.map(() => ({ pressed: false })) };
  pad = null;
  window.dispatchEvent(new Event('gamepaddisconnected'));
  tick();
  pad = replacement;
  window.dispatchEvent(new Event('gamepadconnected'));
  tick();
  pad.buttons[0].pressed = true;
  tick();
  assert.equal(actions.length, 3);
  unsubscribe();
  assert.equal(frames.size, 0);
  window.dispatchEvent(new Event('focus'));
  assert.equal(frames.size, 0);
});
