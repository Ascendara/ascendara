// Create two audio elements per sound for gapless looping
const createAudioPair = src => ({
  a: new Audio(src),
  b: new Audio(src),
  current: "a",
});

const sounds = {
  ascend1: createAudioPair("/sounds/ascend1.mp3"),
  ascend2: createAudioPair("/sounds/ascend2.mp3"),
  ascend3: createAudioPair("/sounds/ascend3.mp3"),
  ascend4: createAudioPair("/sounds/ascend4.mp3"),
};

// Preload all sounds
Object.values(sounds).forEach(pair => {
  pair.a.preload = "auto";
  pair.b.preload = "auto";
});

let currentSound = null;
let currentSoundName = null;
let loopTimeout = null;
let targetVolume = 0.3;

const stopLoopTimeout = () => {
  if (loopTimeout) {
    clearTimeout(loopTimeout);
    loopTimeout = null;
  }
};

// Gapless loop: start next audio well before current ends, crossfade smoothly
const scheduleGaplessLoop = (soundName, volume) => {
  stopLoopTimeout();

  const pair = sounds[soundName];
  if (!pair || !currentSound) return;

  const audio = currentSound;
  const fadeDuration = 0.5; // 500ms crossfade for smoother transition
  const scheduleTime = Math.max(0, audio.duration - fadeDuration - 0.2);

  const checkAndLoop = () => {
    if (!currentSound || currentSoundName !== soundName) return;

    if (audio.currentTime >= scheduleTime) {
      // Switch to the other audio element
      const nextKey = pair.current === "a" ? "b" : "a";
      const nextAudio = pair[nextKey];

      // Start next audio immediately at low volume
      nextAudio.volume = 0;
      nextAudio.currentTime = 0;
      nextAudio.play().catch(() => {});

      // Smooth crossfade with more steps
      const steps = 20;
      const stepDuration = (fadeDuration * 1000) / steps;
      let step = 0;

      const fadeInterval = setInterval(() => {
        step++;
        const progress = step / steps;
        // Use easing for smoother transition
        const eased = progress * progress * (3 - 2 * progress); // smoothstep
        audio.volume = Math.max(0, volume * (1 - eased));
        nextAudio.volume = Math.min(volume, volume * eased);

        if (step >= steps) {
          clearInterval(fadeInterval);
          audio.pause();
          audio.currentTime = 0;
          audio.volume = volume;
          pair.current = nextKey;
          currentSound = nextAudio;
          // Schedule next loop
          scheduleGaplessLoop(soundName, volume);
        }
      }, stepDuration);
    } else {
      // Check more frequently for precise timing
      loopTimeout = setTimeout(checkAndLoop, 20);
    }
  };

  loopTimeout = setTimeout(
    checkAndLoop,
    Math.max(0, (scheduleTime - audio.currentTime) * 1000 - 200)
  );
};

export const soundService = {
  play: (soundName, volume = 0.3, loop = false) => {
    const pair = sounds[soundName];
    if (!pair) return;

    stopLoopTimeout();

    // Stop any currently playing sound
    if (currentSound) {
      currentSound.pause();
      currentSound.currentTime = 0;
    }

    const audio = pair[pair.current];
    audio.volume = volume;
    audio.loop = false; // We handle looping ourselves
    audio.currentTime = 0;
    audio.play().catch(err => console.log("Audio play failed:", err));
    currentSound = audio;
    currentSoundName = soundName;
    targetVolume = volume;

    if (loop) {
      // Wait for duration to be available, then schedule loop
      const waitForDuration = () => {
        if (audio.duration && !isNaN(audio.duration)) {
          scheduleGaplessLoop(soundName, volume);
        } else {
          setTimeout(waitForDuration, 50);
        }
      };
      waitForDuration();
    }
  },

  stop: () => {
    stopLoopTimeout();
    if (currentSound) {
      currentSound.pause();
      currentSound.currentTime = 0;
      currentSound = null;
      currentSoundName = null;
    }
  },

  fadeOut: (duration = 1000) => {
    stopLoopTimeout();
    if (!currentSound) return;

    const audio = currentSound;
    const startVolume = audio.volume;
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = startVolume / steps;

    let step = 0;
    const fadeInterval = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVolume - volumeStep * step);

      if (step >= steps) {
        clearInterval(fadeInterval);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = startVolume;
        currentSound = null;
        currentSoundName = null;
      }
    }, stepDuration);
  },

  crossfadeTo: (soundName, volume = 0.3, loop = false, fadeDuration = 500) => {
    const pair = sounds[soundName];
    if (!pair) return;

    stopLoopTimeout();

    const newAudio = pair[pair.current];

    if (currentSound && currentSound !== newAudio) {
      const oldAudio = currentSound;
      const startVolume = oldAudio.volume;
      const steps = 10;
      const stepDuration = fadeDuration / steps;
      const volumeStep = startVolume / steps;

      // Start new sound quietly
      newAudio.volume = 0;
      newAudio.loop = false;
      newAudio.currentTime = 0;
      newAudio.play().catch(err => console.log("Audio play failed:", err));

      let step = 0;
      const fadeInterval = setInterval(() => {
        step++;
        // Fade out old
        oldAudio.volume = Math.max(0, startVolume - volumeStep * step);
        // Fade in new
        newAudio.volume = Math.min(volume, (volume / steps) * step);

        if (step >= steps) {
          clearInterval(fadeInterval);
          oldAudio.pause();
          oldAudio.currentTime = 0;
          oldAudio.volume = startVolume;
        }
      }, stepDuration);

      currentSound = newAudio;
      currentSoundName = soundName;
      targetVolume = volume;

      if (loop) {
        // Wait for duration and crossfade to complete
        setTimeout(() => {
          const waitForDuration = () => {
            if (newAudio.duration && !isNaN(newAudio.duration)) {
              scheduleGaplessLoop(soundName, volume);
            } else {
              setTimeout(waitForDuration, 50);
            }
          };
          waitForDuration();
        }, fadeDuration);
      }
    } else {
      soundService.play(soundName, volume, loop);
    }
  },

  isPlaying: () => {
    return currentSound && !currentSound.paused;
  },
};

export default soundService;
