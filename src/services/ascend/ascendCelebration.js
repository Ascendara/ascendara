// Assets and coordination for the post-checkout celebration: the app logo
// flies to the center and morphs into the Ascend crown before the welcome tour.

export const ASCEND_MORPH_URL = "https://www.ascendara.app/ascend_morph.gif";
export const ASCEND_CROWN_URL = "https://www.ascendara.app/ascend.png";

let preloadPromise = null;

const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Decodes every GIF frame up front, scaled to the size it is drawn at, so
// playback never waits on the decoder. Falls back to a blob URL for an <img>
// when WebCodecs' ImageDecoder is unavailable.
const decodeMorph = async (buffer, size) => {
  if (typeof window.ImageDecoder !== "function") {
    return { blobUrl: URL.createObjectURL(new Blob([buffer], { type: "image/gif" })) };
  }
  const decoder = new window.ImageDecoder({ data: buffer, type: "image/gif" });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const count = decoder.tracks.selectedTrack.frameCount;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        const bitmap = await createImageBitmap(image, {
          resizeWidth: size,
          resizeHeight: size,
          resizeQuality: "high",
        });
        // VideoFrame duration is in microseconds; GIFs are 40ms at minimum
        frames.push({ bitmap, ms: Math.max(20, (image.duration || 40000) / 1000) });
      } finally {
        image.close();
      }
    }
    return { frames };
  } finally {
    decoder.close();
  }
};

/**
 * Starts fetching and decoding the celebration assets. Safe to call repeatedly;
 * the work happens once. Resolves to { frames | blobUrl, crown } or null.
 */
export function preloadAscendCelebration(size = 512) {
  if (!preloadPromise) {
    preloadPromise = Promise.all([
      fetch(ASCEND_MORPH_URL)
        .then(response => {
          if (!response.ok) throw new Error(`Morph GIF ${response.status}`);
          return response.arrayBuffer();
        })
        .then(buffer => decodeMorph(buffer, size)),
      loadImage(ASCEND_CROWN_URL).then(img => img.decode?.().then(() => img) ?? img),
    ])
      .then(([morph, crown]) => ({ ...morph, crown }))
      .catch(error => {
        console.error("Unable to load the Ascend celebration:", error);
        preloadPromise = null;
        return null;
      });
  }
  return preloadPromise;
}

// Frees the decoded frames once played; the next preload decodes them again.
export function releaseAscendCelebration() {
  const pending = preloadPromise;
  preloadPromise = null;
  pending?.then(assets => {
    assets?.frames?.forEach(frame => frame.bitmap.close());
    if (assets?.blobUrl) URL.revokeObjectURL(assets.blobUrl);
  });
}

let activeRun = null;

/** Marks the celebration as playing. Call the returned function when it ends. */
export function beginAscendCelebration() {
  let resolve;
  const run = new Promise(r => (resolve = r));
  activeRun = run;
  return () => {
    if (activeRun === run) activeRun = null;
    resolve();
  };
}

/** Resolves once no celebration is playing (immediately if none is). */
export const whenAscendCelebrationDone = () => activeRun ?? Promise.resolve();

export const isAscendCelebrationActive = () => activeRun !== null;
