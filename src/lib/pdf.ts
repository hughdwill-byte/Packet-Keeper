/** Render a PDF's pages to compressed JPEG images in the browser (pdf.js). */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { compressImage, type CompressedImage } from "./image";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 30;

export async function pdfToImages(
  file: Blob,
  onPage?: (n: number, total: number) => void,
): Promise<CompressedImage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const total = Math.min(doc.numPages, MAX_PAGES);
  const out: CompressedImage[] = [];
  for (let i = 1; i <= total; i++) {
    onPage?.(i, total);
    const page = await doc.getPage(i);
    // Render at a scale that gets the long edge near ~1600px for legibility.
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.85),
    );
    // Re-run through compressImage to cap size + get base64 consistently.
    out.push(await compressImage(blob));
  }
  return out;
}
