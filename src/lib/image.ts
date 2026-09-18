/** Browser-side image resize/compress before sending to Claude or saving. */
import { blobToBase64 } from "./base64";

export interface CompressedImage {
  blob: Blob;
  base64: string; // raw base64 (no data: prefix)
  mediaType: "image/jpeg";
  width: number;
  height: number;
}

const MAX_DIM = 1600;
const QUALITY = 0.82;

async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke after decode; the drawn canvas keeps the pixels.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const img = await fileToImage(file);
  let { width, height } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      QUALITY,
    );
  });

  const base64 = await blobToBase64(blob);
  return { blob, base64, mediaType: "image/jpeg", width, height };
}

/**
 * Crop a sub-region (given as 0..1 fractions) out of an image blob and return a
 * square-ish JPEG suitable for a dish tile. Used when Claude spots a finished-
 * dish photo on a page.
 */
export async function cropRegion(
  file: Blob,
  box: { x: number; y: number; w: number; h: number },
): Promise<Blob> {
  const img = await fileToImage(file);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const sx = clamp(box.x) * img.width;
  const sy = clamp(box.y) * img.height;
  const sw = Math.max(1, clamp(box.w) * img.width);
  const sh = Math.max(1, clamp(box.h) * img.height);

  const target = 800;
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");
  // Cover-fit the crop into a square tile.
  const scale = Math.max(target / sw, target / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, sx, sy, sw, sh, (target - dw) / 2, (target - dh) / 2, dw, dh);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}
