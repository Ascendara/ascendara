import { getGamepadInput } from "./gamepad";
import { readNavigationInput } from "./controllerNavigation";

// One poll per animation frame, regardless of how many screens/dialogs are mounted.
const consumers = new Set();
const observers = new Set();
let frame = null;
let owner = null;
let running = false;

function tick(now) {
  frame = null;
  running = true;
  try {
    const input = getGamepadInput();
    let nextOwner = null;
    for (const consumer of consumers) {
      const options = consumer.getOptions();
      if (options.enabled !== false &&
          (!nextOwner || options.priority >= nextOwner.getOptions().priority)) {
        nextOwner = consumer;
      }
    }
    const changed = owner !== nextOwner;
    owner = nextOwner;
    for (const consumer of consumers) {
      const options = consumer.getOptions();
      const blocked = document.hidden || consumer !== owner || options.blocked || changed;
      const action = readNavigationInput(input, consumer.state, now, blocked);
      if (action) consumer.onAction(action);
    }
    for (const observer of observers) observer(input);
  } finally {
    running = false;
    if (consumers.size || observers.size) frame = requestAnimationFrame(tick);
  }
}

function start() {
  if (frame === null && !running) frame = requestAnimationFrame(tick);
}

function stopIfIdle() {
  if (consumers.size || observers.size) return;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  owner = null;
}

export function subscribeController(onAction, getOptions) {
  const consumer = { onAction, getOptions, state: {} };
  consumers.add(consumer);
  start();
  return () => { consumers.delete(consumer); stopIfIdle(); };
}

export function observeController(observer) {
  observers.add(observer);
  start();
  return () => { observers.delete(observer); stopIfIdle(); };
}
