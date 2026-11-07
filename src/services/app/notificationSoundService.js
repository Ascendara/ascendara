// Plays the achievement and notification sounds inside the window. Toasts drawn
// by the notification helper play their own sound; this covers previews in
// settings and system notifications on macOS and Linux.
let current = null;

// Loudest output at 100%, kept well under the system level so notifications
// never startle. Squaring the slider value matches how loudness is heard;
// a straight line makes everything above ~20% sound about the same. Keep in
// sync with sound_gain in AscendaraNotificationHelper.py.
const MAX_GAIN = 0.4;
const soundGain = volume => MAX_GAIN * (Math.max(0, Math.min(100, volume)) / 100) ** 2;

// profile previews that built-in profile instead of the configured sound
export const playNotificationSound = async (kind, volume, profile) => {
  try {
    if (volume === undefined) {
      const settings = await window.electron.getSettings();
      if (settings?.notificationSounds === false) return;
      volume = settings?.notificationSoundVolume ?? 70;
    }
    const src = await window.electron.getNotificationSound(kind, profile);
    if (!src) return;
    current?.pause();
    current = new Audio(src);
    current.volume = soundGain(volume);
    await current.play();
  } catch (error) {
    console.error("Failed to play notification sound:", error);
  }
};

window.electron?.onPlayNotificationSound?.(kind => playNotificationSound(kind));
