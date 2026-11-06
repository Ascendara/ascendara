// Turns a torrent record's hand-off wait (handoffWaitReason, nextHandoffAt) into the
// line shown to the user, so a ready torrent never looks frozen. Null when nothing waits.
export function describeHandoffWait(entry, now, t) {
  const reason = entry?.handoffWaitReason;
  if (!reason || entry.localDownloadStarted) return null;
  const due = Number(entry.nextHandoffAt);
  const secondsLeft = Number.isFinite(due)
    ? Math.max(0, Math.ceil((due - now) / 1000))
    : 0;
  if (reason.startsWith("waiting-for:"))
    return {
      text: t("debrid.handoff.waitingFor", { game: reason.slice(12) }),
      secondsLeft,
    };
  if (reason === "folder-has-install")
    return { text: t("debrid.handoff.folderHasInstall"), secondsLeft };
  if (reason !== "starting" && reason !== "retrying") return null;
  if (secondsLeft === 0) return { text: t("debrid.handoff.startingNow"), secondsLeft };
  return {
    text: t(
      reason === "retrying" ? "debrid.handoff.retryingIn" : "debrid.handoff.startingIn",
      { seconds: secondsLeft }
    ),
    secondsLeft,
  };
}
