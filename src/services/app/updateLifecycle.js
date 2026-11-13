export const UPDATE_PHASES = Object.freeze({
  CHECKING: "checking",
  CURRENT: "current",
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  READY: "ready",
  INSTALLING: "installing",
});

export const INITIAL_UPDATE_STATUS = Object.freeze({
  isLatest: null,
  updateRequired: false,
  phase: UPDATE_PHASES.CHECKING,
  downloadProgress: 0,
});

const phaseFromSnapshot = ({ isLatest, updateRequired, downloaded, downloading }) => {
  if (updateRequired || isLatest === false) {
    if (downloaded) return UPDATE_PHASES.READY;
    if (downloading) return UPDATE_PHASES.DOWNLOADING;
    return UPDATE_PHASES.AVAILABLE;
  }
  if (isLatest === true) return UPDATE_PHASES.CURRENT;
  return UPDATE_PHASES.CHECKING;
};

export const reduceUpdateStatus = (state, event) => {
  switch (event.type) {
    case "SNAPSHOT": {
      const phase = phaseFromSnapshot({
        isLatest: event.isLatest,
        updateRequired: state.updateRequired,
        downloaded: Boolean(event.downloaded),
        downloading: Boolean(event.downloading),
      });
      return {
        ...state,
        isLatest: event.isLatest,
        phase,
        downloadProgress:
          phase === UPDATE_PHASES.READY
            ? 100
            : phase === UPDATE_PHASES.DOWNLOADING
              ? state.downloadProgress
              : 0,
      };
    }
    case "UPDATE_REQUIRED":
      return {
        ...state,
        updateRequired: true,
        phase: [
          UPDATE_PHASES.DOWNLOADING,
          UPDATE_PHASES.READY,
          UPDATE_PHASES.INSTALLING,
        ].includes(state.phase)
          ? state.phase
          : UPDATE_PHASES.AVAILABLE,
      };
    case "DOWNLOAD_PROGRESS":
      return {
        ...state,
        isLatest: false,
        phase: UPDATE_PHASES.DOWNLOADING,
        downloadProgress: Math.max(0, Math.min(100, Number(event.progress) || 0)),
      };
    case "READY":
      return {
        ...state,
        isLatest: false,
        phase: UPDATE_PHASES.READY,
        downloadProgress: 100,
      };
    case "DOWNLOAD_ERROR":
      return {
        ...state,
        phase:
          state.isLatest === false || state.updateRequired
            ? UPDATE_PHASES.AVAILABLE
            : state.phase,
        downloadProgress: 0,
      };
    case "INSTALLING":
      return state.phase === UPDATE_PHASES.READY
        ? { ...state, phase: UPDATE_PHASES.INSTALLING }
        : state;
    case "INSTALL_FAILED":
      return state.phase === UPDATE_PHASES.INSTALLING
        ? { ...state, phase: UPDATE_PHASES.READY }
        : state;
    default:
      return state;
  }
};
