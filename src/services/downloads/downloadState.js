// A download that is paused, queued, stopped, failed or waiting on the user is
// not moving data, even when its downloading flag is still set.
export function isDownloadHalted(data) {
  return Boolean(
    data?.stopped ||
    data?.paused ||
    data?.waiting ||
    data?.error ||
    data?.awaitingRecoveryAction ||
    data?.pendingManualInstall ||
    data?.verifyError?.length
  );
}

// True when the last active download stopped because the user paused it. The
// queue should start the next game only when a slot frees up on its own
// (finished, failed, cancelled), not because the user paused one.
export function freedByPause(previousGames, currentGames) {
  const current = new Map(currentGames.map(game => [game.game, game.downloadingData]));
  return previousGames.some(
    game =>
      game.downloadingData?.downloading &&
      !isDownloadHalted(game.downloadingData) &&
      current.get(game.game)?.stopped
  );
}
