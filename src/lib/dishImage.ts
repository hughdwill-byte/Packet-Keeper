/**
 * generateDishImage(recipe) — the single seam for "make a picture of the dish".
 * Free + offline: renders a matching food emoji onto a gradient SVG tile.
 * Swappable later for a real image provider without touching callers.
 */
import { buildDishSvg, type DishLike } from "../shared/foodEmoji";

export interface GeneratedImage {
  blob: Blob;
  ext: "svg";
  mediaType: "image/svg+xml";
}

export function generateDishImage(recipe: DishLike): GeneratedImage {
  const svg = buildDishSvg(recipe);
  return {
    blob: new Blob([svg], { type: "image/svg+xml" }),
    ext: "svg",
    mediaType: "image/svg+xml",
  };
}
