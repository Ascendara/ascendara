import { GIFEncoder, applyPalette, quantize } from "gifenc";

const MAX_FRAMES = 300;
// GIF delays are in hundredths of a second and most viewers treat < 20ms as 100ms
const MIN_FRAME_DELAY_MS = 20;

const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

async function openAnimatedDecoder(file) {
  if (typeof window.ImageDecoder !== "function") return null;
  if (!["image/gif", "image/webp"].includes(file.type)) return null;
  if (!(await window.ImageDecoder.isTypeSupported(file.type))) return null;
  const decoder = new window.ImageDecoder({
    data: await file.arrayBuffer(),
    type: file.type,
  });
  await decoder.tracks.ready;
  if ((decoder.tracks.selectedTrack?.frameCount || 1) > 1) return decoder;
  decoder.close();
  return null;
}

async function cropAnimated(decoder, crop, width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingQuality = "high";
  const gif = GIFEncoder();
  const frameCount = Math.min(decoder.tracks.selectedTrack.frameCount, MAX_FRAMES);
  try {
    for (let index = 0; index < frameCount; index++) {
      const { image } = await decoder.decode({ frameIndex: index });
      context.clearRect(0, 0, width, height);
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        width,
        height
      );
      const delay = Math.max(
        MIN_FRAME_DELAY_MS,
        Math.round((image.duration || 0) / 1000)
      );
      image.close();

      const { data } = context.getImageData(0, 0, width, height);
      const palette = quantize(data, 256, { format: "rgba4444", oneBitAlpha: true });
      const transparentIndex = palette.findIndex(color => color[3] === 0);
      gif.writeFrame(applyPalette(data, palette, "rgba4444"), width, height, {
        palette,
        delay,
        repeat: 0,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(transparentIndex, 0),
      });
      // Keep the dialog responsive while long GIFs encode
      await yieldToBrowser();
    }
  } finally {
    decoder.close();
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

async function cropStill(file, crop, width, height) {
  const bitmap = await createImageBitmap(file);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/webp",
      0.92
    )
  );
}

/**
 * Crops an image to the given source rectangle and scales it to width x height.
 * Animated GIF/WebP files stay animated (re-encoded as GIF); everything else
 * becomes a WebP.
 * @param {File} file
 * @param {{x: number, y: number, width: number, height: number}} crop - source pixels
 * @param {{still: {width: number, height: number}, animated: {width: number, height: number}}} sizes
 * @returns {Promise<File>}
 */
export async function cropImage(file, crop, sizes) {
  const decoder = await openAnimatedDecoder(file);
  const { width, height } = decoder ? sizes.animated : sizes.still;
  const blob = decoder
    ? await cropAnimated(decoder, crop, width, height)
    : await cropStill(file, crop, width, height);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.${decoder ? "gif" : "webp"}`, { type: blob.type });
}
