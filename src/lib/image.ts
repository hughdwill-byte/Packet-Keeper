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
