export function canRetryExtraction(game) {
  const data = game.downloadingData || {};
  return Boolean(
    data.awaitingRecoveryAction ||
    ((data.error || data.stopped || data.verifyError?.length) &&
      (game.extractionSources || Number.parseFloat(data.progressCompleted) >= 100))
  );
}

export async function retryExtraction(game) {
  const data = game.downloadingData || {};
  const result = data.awaitingRecoveryAction
    ? await window.electron.extractionRecoveryAction(
        game.game,
        data.recoverableError?.requestId,
        "retry"
      )
    : await window.electron.retryExtract(game.game);
  if (!result?.success) throw new Error(result?.error || "Could not restart extraction.");
  return result;
}
