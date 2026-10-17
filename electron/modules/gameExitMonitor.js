// The helper reports duration before backups/cleanup. Older helpers fall back
// to their process lifetime, except elevated launches that cannot be monitored.
function createGameExitMonitor({ elevated = false, now = Date.now } = {}) {
  const startedAt = now();
  let pending = "";
  let durationMs = null;
  return {
    write(chunk) {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop().slice(-4096);
      for (const line of lines) {
        const match = /^ASCENDARA_SESSION_DURATION_MS:(\d+)$/.exec(line);
        if (match) durationMs = Number(match[1]);
      }
    },
    result({ stopped = false, failed = false } = {}) {
      const elapsed = durationMs ?? (elevated ? null : now() - startedAt);
      return {
        durationMs: elapsed,
        quickExit: !stopped && !failed && elapsed !== null && elapsed >= 0 && elapsed < 5000,
      };
    },
  };
}

module.exports = { createGameExitMonitor };
