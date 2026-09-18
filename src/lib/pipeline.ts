/**
 * Upload pipeline: source (photo or PDF) -> one or more recipes.
 * Per recipe: extract -> spice blend -> dish image (cropped photo or emoji) ->
 * cost estimate -> commit. Reports status so the UI can show progress.
 */
import type { Settings } from "./settings";
import { compressImage, cropRegion, type CompressedImage } from "./image";
import { extractRecipes, generateSpiceBlend, type ImagePart } from "../shared/claude";
import { generateDishImage } from "./dishImage";
import { saveRecipe, type ImageUpload } from "./recipes";
import { slugify, uniqueSlug } from "../shared/util";
import { ExtractionSchema, type Recipe, type Extraction } from "../shared/schema";
import { costByStore as computeCostByStore, type PriceBook } from "../shared/prices";
import { stapleKeysOf } from "./priceBook";

export type Stage = "queued" | "reading" | "generating" | "saving" | "done" | "needs-review" | "error";
export interface ProgressCb {
  (stage: Stage, message?: string): void;
}

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

/** Turn an uploaded file into page/photo images. */
export async function expandFile(file: File, onProgress?: ProgressCb): Promise<CompressedImage[]> {
  if (isPdf(file)) {
    onProgress?.("reading", "Loading PDF reader…");
    const { pdfToImages } = await import("./pdf"); // lazy: keeps pdf.js out of the main bundle
    onProgress?.("reading", "Rendering PDF pages…");
    return pdfToImages(file, (n, total) => onProgress?.("reading", `Rendering PDF page ${n}/${total}…`));
  }
  return [await compressImage(file)];
}

function baseSlug(ex: { dishName: string; product?: string; brand?: string }): string {
  return slugify([ex.dishName, ex.product || ex.brand].filter(Boolean).join(" ")) || "recipe";
}

async function buildAndSave(
  settings: Settings,
  ex: Extraction,
  sourceImages: CompressedImage[],
  book: PriceBook,
  existingSlugs: Set<string>,
  onProgress: ProgressCb,
): Promise<Recipe> {
  const needsReview = ex.confidence.length > 0;
  const slug = uniqueSlug(baseSlug(ex), existingSlugs);
  existingSlugs.add(slug);

  // Spice blend (best effort, only meaningful when a sachet is involved).
  let spiceBlend;
  if (ex.sachetIngredients.length > 0) {
    try {
      spiceBlend = await generateSpiceBlend(
        { apiKey: settings.anthropicApiKey, model: settings.model },
        { dishName: ex.dishName, cuisine: ex.cuisine, serves: ex.serves, sachetIngredients: ex.sachetIngredients },
      );
    } catch {
      spiceBlend = undefined;
    }
  }

  onProgress("generating", `Preparing "${ex.dishName}"…`);
  const uploads: ImageUpload[] = [];
  const imagePaths: string[] = [];
  sourceImages.forEach((c, i) => {
    const path = `recipes/images/${slug}-${i + 1}.jpg`;
    uploads.push({ path, blob: c.blob });
    imagePaths.push(path);
  });

  // Dish image: crop the finished-dish photo if present, else emoji tile.
  let dishImage: string;
  let dishImageFromPhoto = false;
  const dp = ex.dishPhoto;
  if (dp?.present && dp.box && sourceImages[dp.imageIndex]) {
    try {
      const cropped = await cropRegion(sourceImages[dp.imageIndex].blob, dp.box);
      dishImage = `recipes/images/${slug}-dish.jpg`;
      uploads.push({ path: dishImage, blob: cropped });
      dishImageFromPhoto = true;
    } catch {
      dishImage = `recipes/images/${slug}-dish.svg`;
    }
  } else {
    dishImage = `recipes/images/${slug}-dish.svg`;
  }

  const now = new Date().toISOString();
  const draft: Recipe = {
    ...ex,
    slug,
    spiceBlend,
    images: imagePaths,
    dishImage,
    dishImageFromPhoto,
    costByStore: computeCostByStore(ex.shoppingList, book),
    needsReview,
    createdAt: now,
    updatedAt: now,
  };
  if (!dishImageFromPhoto) {
    const dish = generateDishImage(draft);
    uploads.push({ path: dishImage, blob: dish.blob });
  }

  onProgress("saving", "Committing to GitHub…");
  return saveRecipe(settings, draft, uploads);
}

/**
 * Process the images of a single source. Returns every recipe found (a book
 * page can yield several). Errors become one "needs review" recipe.
 */
export async function processImages(
  settings: Settings,
  images: CompressedImage[],
  book: PriceBook,
  existingSlugs: Set<string>,
  onProgress: ProgressCb,
): Promise<Recipe[]> {
  onProgress("reading", "Reading with Claude…");
  const parts: ImagePart[] = images.map((c) => ({ mediaType: c.mediaType, base64: c.base64 }));

  let extractions: Extraction[];
  try {
    extractions = await extractRecipes(
      { apiKey: settings.anthropicApiKey, model: settings.model },
      parts,
      stapleKeysOf(book),
    );
  } catch (e) {
    const fallback = ExtractionSchema.parse({
      dishName: "Untitled recipe",
      confidence: [{ field: "all", note: `Extraction failed: ${(e as Error).message}` }],
    });
    extractions = [fallback];
  }
  if (extractions.length === 0) {
    extractions = [
      ExtractionSchema.parse({
        dishName: "Unrecognised page",
        confidence: [{ field: "all", note: "No recipe was detected on this page." }],
      }),
    ];
  }

  const saved: Recipe[] = [];
  for (const ex of extractions) {
    saved.push(await buildAndSave(settings, ex, images, book, existingSlugs, onProgress));
  }
  return saved;
}
