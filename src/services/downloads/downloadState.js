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
