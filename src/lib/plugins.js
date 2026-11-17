// Runs enabled community plugins in the page. A plugin's script sets
// module.exports = { start(ascendara), stop() } and can change anything in the
// app. The `ascendara` object it receives makes common changes easy to undo and
// reaches the main process for files, downloads and programs.
import { toast } from "sonner";

const running = new Map();
const failures = new Map();
const eventHandlers = new Set();
let gameActions = [];
const gameActionListeners = new Set();
let subscribed = false;

const cleanError = error =>
  new Error(
    String(error?.message || error).replace(
      /^Error invoking remote method '[^']+': (Error: )?/,
      ""
    )
  );

function setGameActions(next) {
  gameActions = next;
  for (const listener of gameActionListeners) listener();
}

// For useSyncExternalStore in the game screen.
export function subscribeGameActions(listener) {
  gameActionListeners.add(listener);
  return () => gameActionListeners.delete(listener);
}

export function getGameActions() {
  return gameActions;
}

function createApi(source, cleanups) {
  const { id } = source;
  const electron = window.electron;
  const call = (method, ...args) =>
    electron.plugins.call(id, method, ...args).catch(error => {
      throw cleanError(error);
    });
  const onCleanup = cleanup => {
    cleanups.push(cleanup);
    return cleanup;
  };
  const storageKey = key => `plugin:${id}:${key}`;

  return {
    id,
    version: source.version,
    appVersion: source.appVersion,
    platform: source.platform,
    dataPath: source.dataPath,
    permissions: source.permissions,

    addStyle(css) {
      const style = document.createElement("style");
      style.dataset.plugin = id;
      style.textContent = css;
      document.head.appendChild(style);
      return onCleanup(() => style.remove());
    },
    onNavigate(callback) {
      const notify = () => callback(window.location.hash.replace(/^#/, "") || "/");
      window.addEventListener("hashchange", notify);
      notify();
      return onCleanup(() => window.removeEventListener("hashchange", notify));
    },
    navigate(route) {
      window.location.hash = route.startsWith("/") ? route : `/${route}`;
    },
    onCleanup,
    log: (...args) => console.log(`[Plugin ${id}]`, ...args),
    toast(message, type = "info") {
      (toast[type] || toast)(message);
    },

    storage: {
      get(key, fallback = null) {
        try {
          const value = localStorage.getItem(storageKey(key));
          return value === null ? fallback : JSON.parse(value);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        localStorage.setItem(storageKey(key), JSON.stringify(value));
      },
      remove(key) {
        localStorage.removeItem(storageKey(key));
      },
    },

    files: {
      read: file => call("files.read", file),
      write: (file, text) => call("files.write", file, text),
      exists: file => call("files.exists", file),
      list: (folder = ".") => call("files.list", folder),
      remove: file => call("files.remove", file),
    },

    async download(url, to, { onProgress } = {}) {
      const downloadId = crypto.randomUUID();
      const handler = event => {
        if (event.type === "download-progress" && event.downloadId === downloadId)
          onProgress({ received: event.received, total: event.total });
      };
      if (onProgress) eventHandlers.add(handler);
      try {
        return await call("download", url, to, downloadId);
      } finally {
        eventHandlers.delete(handler);
      }
    },
    extract: (archive, to) => call("extract", archive, to),

    async run(program, args = [], { cwd, onExit } = {}) {
      const pid = await call("run", program, args, { cwd });
      if (onExit) {
        const handler = event => {
          if (event.type !== "process-exit" || event.pid !== pid) return;
          eventHandlers.delete(handler);
          onExit(event.code);
        };
        eventHandlers.add(handler);
        onCleanup(() => eventHandlers.delete(handler));
      }
      return { pid, kill: () => call("kill", pid) };
    },
    exec: (program, args = [], options = {}) => call("exec", program, args, options),
    openPath: target => call("openPath", target),

    games: {
      directory: game => call("games.directory", game),
      onLaunch(callback) {
        return onCleanup(
          electron.onGameLaunchSuccess((_event, data) => callback(data?.game))
        );
      },
      onExit(callback) {
        return onCleanup(electron.onGameClosed((_event, data) => callback(data?.game)));
      },
    },

    gameScreen: {
      // Adds an item to the game page's Manage menu. `onClick` and `when`
      // receive the game the page is showing.
      addAction({ label, onClick, when }) {
        if (typeof label !== "string" || typeof onClick !== "function")
          throw new Error("addAction needs a label and an onClick function");
        const action = {
          key: `${id}:${crypto.randomUUID()}`,
          pluginId: id,
          label,
          when,
          async run(game) {
            try {
              await onClick(game);
            } catch (error) {
              console.error(`[Plugin ${id}]`, error);
              toast.error(`${source.name}: ${error.message}`);
            }
          },
        };
        setGameActions([...gameActions, action]);
        return onCleanup(() =>
          setGameActions(gameActions.filter(item => item !== action))
        );
      },
    },
  };
}

function startPlugin(source) {
  if (source.error) {
    failures.set(source.id, source.error);
    return;
  }
  const cleanups = [];
  try {
    const module = { exports: {} };
    new Function(
      "module",
      "exports",
      `${source.code}\n//# sourceURL=ascendara-plugin://${source.id}.js`
    )(module, module.exports);
    const plugin = module.exports;
    const api = createApi(source, cleanups);
    if (source.style) api.addStyle(source.style);
    const started = plugin.start?.(api);
    // An async start that fails later still reports its error.
    if (started?.catch)
      started.catch(error => {
        failures.set(source.id, error.message);
        console.error(`[Plugins] ${source.name} failed to start`, error);
      });
    running.set(source.id, { plugin, cleanups });
    console.log(`[Plugins] Started ${source.name} ${source.version}`);
  } catch (error) {
    runCleanups(cleanups);
    failures.set(source.id, error.message);
    console.error(`[Plugins] ${source.name} failed to start`, error);
  }
}

function runCleanups(cleanups) {
  for (const cleanup of cleanups.reverse()) {
    try {
      cleanup();
    } catch (error) {
      console.error("[Plugins] Cleanup failed", error);
    }
  }
}

function stopPlugin(id) {
  const entry = running.get(id);
  if (!entry) return;
  running.delete(id);
  try {
    entry.plugin.stop?.();
  } catch (error) {
    console.error(`[Plugins] ${id} failed to stop`, error);
  }
  runCleanups(entry.cleanups);
}

export async function loadPlugins() {
  const plugins = window.electron?.plugins;
  if (!plugins) return;
  if (!subscribed) {
    subscribed = true;
    plugins.onEvent(event => {
      for (const handler of [...eventHandlers]) handler(event);
    });
    // Another window changed the plugin set.
    plugins.onReload(() => reloadPlugins(false));
  }
  for (const source of await plugins.sources())
    if (!running.has(source.id)) startPlugin(source);
}

// Stops every plugin and starts the enabled ones again, e.g. after a toggle.
export async function reloadPlugins(notifyOtherWindows = true) {
  for (const id of [...running.keys()]) stopPlugin(id);
  failures.clear();
  await loadPlugins();
  if (notifyOtherWindows) await window.electron?.plugins?.changed();
}

export function pluginFailure(id) {
  return failures.get(id);
}
