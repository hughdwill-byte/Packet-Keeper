/**
 * Upload pipeline: photo(s) -> extract -> spice blend -> dish image -> commit.
 * One recipe at a time, reporting status so the UI can show progress.
 */
import type { Settings } from "./settings";
import { compressImage } from "./image";
import { extractRecipe, generateSpiceBlend, type ImagePart } from "../shared/claude";
import { generateDishImage } from "./dishImage";
import { saveRecipe, type ImageUpload } from "./recipes";
import { slugify, uniqueSlug } from "../shared/util";
import { ExtractionSchema, type Recipe, type Extraction } from "../shared/schema";

export type Stage = "queued" | "reading" | "generating" | "saving" | "done" | "needs-review" | "error";

export interface ProgressCb {
  (stage: Stage, message?: string): void;
}

function baseSlug(ex: { dishName: string; product?: string; brand?: string }): string {
  const parts = [ex.dishName, ex.product || ex.brand].filter(Boolean);
  return slugify(parts.join(" ")) || "recipe";
}

/**
 * Run the whole pipeline for one recipe (one or more photos of one packet).
 * `existingSlugs` is mutated to reserve the chosen slug.
 */
export async function processRecipe(
  settings: Settings,
  files: File[],
  existingSlugs: Set<string>,
  onProgress: ProgressCb,
): Promise<Recipe> {
  onProgress("reading", "Compressing photos…");
  const compressed = await Promise.all(files.map((f) => compressImage(f)));
  const imageParts: ImagePart[] = compressed.map((c) => ({
    mediaType: c.mediaType,
    base64: c.base64,
  }));

  // --- Extraction (milestone 3). Zod failure -> needs review, never crash. ---
  onProgress("reading", "Reading the packet with Claude…");
  let extraction: Extraction;
  let needsReview = false;
  try {
    extraction = await extractRecipe(
      { apiKey: settings.anthropicApiKey, model: settings.model },
      imageParts,
    );
  } catch (e) {
    needsReview = true;
    extraction = ExtractionSchema.parse({
      dishName: "Untitled packet",
      confidence: [{ field: "all", note: `Extraction failed: ${(e as Error).message}` }],
    });
  }
  if (extraction.confidence.length > 0) needsReview = true;

  const slug = uniqueSlug(baseSlug(extraction), existingSlugs);
  existingSlugs.add(slug);

  // --- Spice blend (milestone 4). Best effort. ---
  let spiceBlend;
  try {
    spiceBlend = await generateSpiceBlend(
      { apiKey: settings.anthropicApiKey, model: settings.model },
      {
        dishName: extraction.dishName,
        cuisine: extraction.cuisine,
        serves: extraction.serves,
        sachetIngredients: extraction.sachetIngredients,
      },
    );
  } catch {
    spiceBlend = undefined;
  }

  // --- Save source photos + generated dish image (milestone 5). ---
  onProgress("generating", "Drawing the dish tile…");
  const now = new Date().toISOString();
  const uploads: ImageUpload[] = [];
  const imagePaths: string[] = [];
  compressed.forEach((c, i) => {
    const path = `recipes/images/${slug}-${i + 1}.jpg`;
    uploads.push({ path, blob: c.blob });
    imagePaths.push(path);
  });

  const draft: Recipe = {
    ...extraction,
    slug,
    spiceBlend,
    images: imagePaths,
    dishImage: `recipes/images/${slug}-dish.svg`,
    needsReview,
    createdAt: now,
    updatedAt: now,
  };
  const dish = generateDishImage(draft);
  uploads.push({ path: draft.dishImage, blob: dish.blob });

  // --- Commit everything (milestone 2 storage). ---
  onProgress("saving", "Committing to GitHub…");
  const saved = await saveRecipe(settings, draft, uploads);

  onProgress(needsReview ? "needs-review" : "done");
  return saved;
}
