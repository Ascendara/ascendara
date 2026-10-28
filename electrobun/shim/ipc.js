// ipcMain on top of Electrobun RPC. Every trusted window gets one RPC instance
// whose single request ("ipcInvoke") and message ("ipcSend") carry Electron's
// channel name and arguments, so the 280+ existing handlers keep their shape.

import { EventEmitter } from "node:events";
import { decodeArgs, encode } from "../shared/wire.js";

const handlers = new Map();

class IpcMain extends EventEmitter {
  handle(channel, listener) {
    if (handlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    }
    handlers.set(channel, listener);
  }

  handleOnce(channel, listener) {
    this.handle(channel, (event, ...args) => {
      handlers.delete(channel);
      return listener(event, ...args);
    });
  }

  removeHandler(channel) {
    handlers.delete(channel);
  }
}

export const ipcMain = new IpcMain();
ipcMain.setMaxListeners(0);

export function createIpcEvent(webContents) {
  return {
    sender: webContents,
    senderFrame: webContents?.mainFrame ?? null,
    frameId: 0,
    processId: 0,
    returnValue: undefined,
    reply: (channel, ...args) => webContents?.send(channel, ...args),
  };
}

export async function dispatchInvoke(webContents, channel, rawArgs) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for '${channel}'`);
  const result = await handler(createIpcEvent(webContents), ...decodeArgs(rawArgs));
  return encode(result);
}

export function dispatchSend(webContents, channel, rawArgs) {
  ipcMain.emit(channel, createIpcEvent(webContents), ...decodeArgs(rawArgs));
}
