let updateAvailable = false;

export const checkForUpdates = async () => {
  try {
    updateAvailable = await window.electron.checkForUpdates();
    return updateAvailable;
  } catch (error) {
    console.error("Error checking for updates:", error);
    return false;
  }
};

export const isUpdateAvailable = () => {
  return updateAvailable;
};
