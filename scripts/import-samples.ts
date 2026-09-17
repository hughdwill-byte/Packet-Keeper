/**
 * One-off local import: process ./samples/*.jpg into ./recipes/.
 *
 * Runs on your machine (Node), NOT in the browser and NOT in CI.
 * Reads ANTHROPIC_API_KEY + ANTHROPIC_MODEL from a local .env (git-ignored).
 * It writes recipe JSON, resized source photos, and generated dish tiles into
 * ./recipes/, then rebuilds ./recipes/index.json. Commit those with git.
 *
 * Usage:  cp .env.example .env  # fill in your key
 *         npm run import
 */
import "dotenv/config";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";

import { extractRecipe, generateSpiceBlend, type ImagePart } from "../src/shared/claude";
import { buildDishSvg } from "../src/shared/foodEmoji";
import { slugify, uniqueSlug } from "../src/shared/util";
import {
  ExtractionSchema,
  toIndexEntry,
  type Recipe,
  type IndexEntry,
} from "../src/shared/schema";

const SAMPLES_DIR = join(process.cwd(), "samples");
const RECIPES_DIR = join(process.cwd(), "recipes");
const IMAGES_DIR = join(RECIPES_DIR, "images");

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

async function main() {
  if (!API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY missing. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  let files: string[];
  try {
    files = (await readdir(SAMPLES_DIR))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();
  } catch {
    console.error(`✗ No ./samples directory found at ${SAMPLES_DIR}`);
    process.exit(1);
  }
  if (!files.length) {
    console.error("✗ No image files in ./samples");
    process.exit(1);
  }

  await mkdir(IMAGES_DIR, { recursive: true });
  const existingSlugs = new Set<string>();
  const index: IndexEntry[] = [];

  console.log(`Found ${files.length} sample photo(s). Each becomes one recipe.\n`);

  for (const file of files) {
    process.stdout.write(`• ${file}: reading… `);
    const srcPath = join(SAMPLES_DIR, file);
    const raw = await readFile(srcPath);

    // Resize/compress to ~1600px JPEG (same target as the browser).
    const resized = await sharp(raw)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const imagePart: ImagePart = {
      mediaType: "image/jpeg",
      base64: resized.toString("base64"),
    };

    // --- Extract (needs-review instead of crashing) ---
    let extraction;
    let needsReview = false;
    try {
      extraction = await extractRecipe({ apiKey: API_KEY, model: MODEL }, [imagePart]);
    } catch (e) {
      needsReview = true;
      extraction = ExtractionSchema.parse({
        dishName: `Untitled (${file})`,
        confidence: [{ field: "all", note: `Extraction failed: ${(e as Error).message}` }],
      });
    }
    if (extraction.confidence.length > 0) needsReview = true;

    const base = slugify([extraction.dishName, extraction.product || extraction.brand].filter(Boolean).join(" ")) || slugify(file);
    const slug = uniqueSlug(base, existingSlugs);
    existingSlugs.add(slug);
    process.stdout.write(`→ "${extraction.dishName}" [${slug}] `);

    // --- Spice blend ---
    process.stdout.write("spice… ");
    let spiceBlend;
    try {
      spiceBlend = await generateSpiceBlend(
        { apiKey: API_KEY, model: MODEL },
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

    // --- Write source photo + dish tile ---
    const imgExt = extname(file).toLowerCase() === ".png" ? ".jpg" : ".jpg";
    const imageRepoPath = `recipes/images/${slug}-1${imgExt}`;
    await writeFile(join(process.cwd(), imageRepoPath), resized);

    const dishRepoPath = `recipes/images/${slug}-dish.svg`;
    const now = new Date().toISOString();
    const recipe: Recipe = {
      ...extraction,
      slug,
      spiceBlend,
      images: [imageRepoPath],
      dishImage: dishRepoPath,
      needsReview,
      createdAt: now,
      updatedAt: now,
    };
    await writeFile(join(process.cwd(), dishRepoPath), buildDishSvg(recipe), "utf8");
    await writeFile(join(RECIPES_DIR, `${slug}.json`), JSON.stringify(recipe, null, 2), "utf8");

    index.push(toIndexEntry(recipe));
    console.log(needsReview ? "done ⚠ needs review" : "done ✓");
  }

  index.sort((a, b) => a.dishName.localeCompare(b.dishName));
  await writeFile(join(RECIPES_DIR, "index.json"), JSON.stringify(index, null, 2), "utf8");

  console.log(`\n✓ Wrote ${index.length} recipe(s) to ./recipes/`);
  console.log("  Review, then: git add recipes && git commit -m \"Import samples\" && git push");
}

main().catch((e) => {
  console.error("\n✗ Import failed:", e);
  process.exit(1);
});
