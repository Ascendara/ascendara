// Renderer half of the Electron shim, bundled into the main window's preload.
// electron/preload.js imports contextBridge/ipcRenderer from here unchanged.

import { Electroview } from "electrobun/view";
import { decode, decodeArgs, encodeArgs } from "../shared/wire.js";

const listeners = new Map();
const ipcEvent = Object.freeze({ sender: null });

const rpc = Electroview.defineRPC({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: {
      ipcEvent: ({ channel, args }) => {
        const callbacks = listeners.get(channel);
        if (!callbacks) return;
        const decoded = decodeArgs(args);
        for (const callback of [...callbacks]) {
          try {
            callback(ipcEvent, ...decoded);
          } catch (error) {
            console.error(`Error in IPC listener for "${channel}":`, error);
          }
        }
      },
    },
  },
});

new Electroview({ rpc });

function addListener(channel, listener) {
  let callbacks = listeners.get(channel);
  if (!callbacks) {
    callbacks = new Set();
    listeners.set(channel, callbacks);
  }
  callbacks.add(listener);
}

export const ipcRenderer = {
  async invoke(channel, ...args) {
    try {
      return decode(await rpc.request.ipcInvoke({ channel, args: encodeArgs(args) }));
    } catch (error) {
      throw new Error(
        `Error invoking remote method '${channel}': Error: ${error?.message || error}`
      );
    }
  },
  send(channel, ...args) {
    rpc.send.ipcSend({ channel, args: encodeArgs(args) });
  },
  on(channel, listener) {
    addListener(channel, listener);
    return ipcRenderer;
  },
  once(channel, listener) {
    const wrapper = (...args) => {
      ipcRenderer.removeListener(channel, wrapper);
      listener(...args);
    };
    addListener(channel, wrapper);
    return ipcRenderer;
  },
  removeListener(channel, listener) {
    listeners.get(channel)?.delete(listener);
    return ipcRenderer;
  },
  off(channel, listener) {
    return ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners(channel) {
    if (channel === undefined) listeners.clear();
    else listeners.delete(channel);
    return ipcRenderer;
  },
};

// The preload shares the page's world here, so exposed APIs are frozen and
// made non-writable to keep page scripts from swapping them out.
export const contextBridge = {
  exposeInMainWorld(key, api) {
    Object.defineProperty(window, key, {
      value: Object.freeze(api),
      writable: false,
      configurable: false,
      enumerable: true,
    });
  },
};

// System webviews do not expose a dropped file's path.
export const webUtils = {
  getPathForFile: file => (file && typeof file.path === "string" ? file.path : ""),
};
