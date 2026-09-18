/**
 * One-off local import: process ./samples/* (images or PDFs) into ./recipes/.
 *
 * Runs on your machine (Node), NOT the browser and NOT CI.
 * Reads ANTHROPIC_API_KEY + ANTHROPIC_MODEL from a local .env (git-ignored).
 * Writes recipe JSON, resized source images, dish tiles, rebuilds index.json.
 *
 * Usage:  cp .env.example .env   # add your key
 *         npm run import
 */
import "dotenv/config";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { extractRecipes } from "../src/shared/claude";
import { generateSpiceBlend } from "../src/shared/claude";
import { buildDishSvg } from "../src/shared/foodEmoji";
import { slugify, uniqueSlug } from "../src/shared/util";
import { ExtractionSchema, RecipeSchema, toIndexEntry, type Recipe, type IndexEntry } from "../src/shared/schema";
import { costByStore as computeCostByStore, type PriceBook } from "../src/shared/prices";

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
  const book = JSON.parse(await readFile(join(RECIPES_DIR, "prices.json"), "utf8")) as PriceBook;
  const stapleKeys = Object.keys(book.items);

  let files: string[];
  try {
    files = (await readdir(SAMPLES_DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  } catch {
    console.error(`✗ No ./samples directory found at ${SAMPLES_DIR}`);
    process.exit(1);
  }
  if (!files.length) {
    console.error("✗ No image files in ./samples (PDF import is supported in the web app).");
    process.exit(1);
  }

  await mkdir(IMAGES_DIR, { recursive: true });
  const existingSlugs = new Set<string>();

  for (const file of files) {
    process.stdout.write(`• ${file}: reading… `);
    const resized = await sharp(await readFile(join(SAMPLES_DIR, file)))
      .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const part = { mediaType: "image/jpeg", base64: resized.toString("base64") };

    let extractions;
    try {
      extractions = await extractRecipes({ apiKey: API_KEY, model: MODEL }, [part], stapleKeys);
    } catch (e) {
      extractions = [ExtractionSchema.parse({ dishName: `Untitled (${file})`, confidence: [{ field: "all", note: `Extraction failed: ${(e as Error).message}` }] })];
    }
    if (!extractions.length) extractions = [ExtractionSchema.parse({ dishName: `Unrecognised (${file})`, confidence: [{ field: "all", note: "No recipe detected." }] })];

    for (const ex of extractions) {
      const slug = uniqueSlug(slugify([ex.dishName, ex.product || ex.brand].filter(Boolean).join(" ")) || slugify(file), existingSlugs);
      existingSlugs.add(slug);
      let spiceBlend;
      if (ex.sachetIngredients.length) {
        try { spiceBlend = await generateSpiceBlend({ apiKey: API_KEY, model: MODEL }, ex); } catch { /* skip */ }
      }
      const imagePath = `recipes/images/${slug}-1.jpg`;
      await writeFile(join(process.cwd(), imagePath), resized);
      const dishPath = `recipes/images/${slug}-dish.svg`;
      const now = new Date().toISOString();
      const recipe: Recipe = RecipeSchema.parse({
        ...ex, slug, spiceBlend, images: [imagePath], dishImage: dishPath,
        costByStore: computeCostByStore(ex.shoppingList, book),
        needsReview: ex.confidence.length > 0, createdAt: now, updatedAt: now,
      });
      await writeFile(join(process.cwd(), dishPath), buildDishSvg(recipe), "utf8");
      await writeFile(join(RECIPES_DIR, `${slug}.json`), JSON.stringify(recipe, null, 2), "utf8");
      process.stdout.write(`"${ex.dishName}" `);
    }
    console.log("done");
  }

  // Rebuild index.json from all recipe files.
  const jsonFiles = (await readdir(RECIPES_DIR)).filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "prices.json");
  const index: IndexEntry[] = [];
  for (const f of jsonFiles) index.push(toIndexEntry(RecipeSchema.parse(JSON.parse(await readFile(join(RECIPES_DIR, f), "utf8")))));
  index.sort((a, b) => a.dishName.localeCompare(b.dishName));
  await writeFile(join(RECIPES_DIR, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`\n✓ ${index.length} recipes in ./recipes/. Commit: git add recipes && git commit -m "Import" && git push`);
}

main().catch((e) => { console.error("\n✗ Import failed:", e); process.exit(1); });
