/**
 * High-level recipe operations.
 *
 * Reads (browsing) come from a fast IndexedDB cache, refreshed from the public
 * static copy of /recipes served with the site (no token, no rate limit).
 * Writes commit to the repo through the GitHub Contents API and update the
 * cache immediately so new recipes show up before the next Pages deploy.
 */
import {
  RecipeSchema,
  IndexSchema,
  toIndexEntry,
  type Recipe,
  type RecipeIndex,
} from "../shared/schema";
import type { Settings } from "./settings";
import * as gh from "./github";
import { blobToBase64 } from "./base64";
import {
  cacheGetIndex,
  cacheSetIndex,
  cacheGetRecipe,
  cacheSetRecipe,
  cacheDeleteRecipe,
} from "./cache";

const INDEX_PATH = "recipes/index.json";
const recipePath = (slug: string) => `recipes/${slug}.json`;

function publicUrl(path: string): string {
  // Served alongside the built site at /<base>/recipes/...
  return `${import.meta.env.BASE_URL}${path}?t=${Date.now()}`;
}

/** Load the recipe index: static copy first, falling back to cache. */
export async function loadIndex(): Promise<RecipeIndex> {
  try {
    const res = await fetch(publicUrl(INDEX_PATH), { cache: "no-store" });
    if (res.ok) {
      const parsed = IndexSchema.safeParse(await res.json());
      if (parsed.success) {
        await cacheSetIndex(parsed.data);
        return parsed.data;
      }
    }
  } catch {
    /* offline or not deployed yet — fall through to cache */
  }
  return (await cacheGetIndex()) ?? [];
}

/** Load one full recipe: cache, then static copy, then Contents API. */
export async function getRecipe(slug: string, settings?: Settings): Promise<Recipe | null> {
  const cached = await cacheGetRecipe(slug);
  if (cached) return cached;

  try {
    const res = await fetch(publicUrl(recipePath(slug)), { cache: "no-store" });
    if (res.ok) {
      const parsed = RecipeSchema.safeParse(await res.json());
      if (parsed.success) {
        await cacheSetRecipe(parsed.data);
        return parsed.data;
      }
    }
  } catch {
    /* fall through */
  }

  if (settings && gh) {
    const file = await gh.getFile(settings, recipePath(slug));
    if (file) {
      const parsed = RecipeSchema.safeParse(JSON.parse(file.content));
      if (parsed.success) {
        await cacheSetRecipe(parsed.data);
        return parsed.data;
      }
    }
  }
  return null;
}

/** Authoritative index read for read-modify-write (Contents API). */
async function readIndexFromRepo(s: Settings): Promise<{ index: RecipeIndex; sha?: string }> {
  const file = await gh.getFile(s, INDEX_PATH);
  if (!file || !file.content.trim()) return { index: [], sha: file?.sha };
  const parsed = IndexSchema.safeParse(JSON.parse(file.content));
  return { index: parsed.success ? parsed.data : [], sha: file.sha };
}

async function writeIndex(s: Settings, index: RecipeIndex, sha: string | undefined, msg: string) {
  const sorted = [...index].sort((a, b) => a.dishName.localeCompare(b.dishName));
  await gh.putTextFile(s, INDEX_PATH, JSON.stringify(sorted, null, 2), msg, sha);
  await cacheSetIndex(sorted);
}

export interface ImageUpload {
  path: string; // repo-relative, e.g. recipes/images/foo-1.jpg
  blob: Blob;
}

/**
 * Save (create or update) a recipe: commit its images, the recipe JSON, and the
 * updated index. Images already committed under recipe.images are left alone.
 */
export async function saveRecipe(
  s: Settings,
  recipe: Recipe,
  newImages: ImageUpload[] = [],
): Promise<Recipe> {
  const validated = RecipeSchema.parse({ ...recipe, updatedAt: new Date().toISOString() });

  // 1. Commit any new binary/text images.
  for (const img of newImages) {
    const base64 = await blobToBase64(img.blob);
    await gh.putFile(s, img.path, base64, `Add image ${img.path}`);
  }

  // 2. Commit the recipe JSON.
  const existingSha = (await gh.getSha(s, recipePath(validated.slug))) ?? undefined;
  await gh.putTextFile(
    s,
    recipePath(validated.slug),
    JSON.stringify(validated, null, 2),
    `Save recipe: ${validated.dishName}`,
    existingSha,
  );

  // 3. Update the index.
  const { index, sha } = await readIndexFromRepo(s);
  const next = index.filter((e) => e.slug !== validated.slug);
  next.push(toIndexEntry(validated));
  await writeIndex(s, next, sha, `Update index for ${validated.dishName}`);

  await cacheSetRecipe(validated);
  return validated;
}

/** Delete a recipe and its images, then update the index. */
export async function deleteRecipe(s: Settings, slug: string): Promise<void> {
  const recipe = await getRecipe(slug, s);
  const imagePaths = new Set<string>();
  if (recipe) {
    recipe.images.forEach((p) => imagePaths.add(p));
    if (recipe.dishImage) imagePaths.add(recipe.dishImage);
  }
  for (const p of imagePaths) {
    try {
      await gh.deleteFile(s, p, `Delete image ${p}`);
    } catch {
      /* best effort; keep going */
    }
  }
  await gh.deleteFile(s, recipePath(slug), `Delete recipe: ${slug}`);

  const { index, sha } = await readIndexFromRepo(s);
  await writeIndex(
    s,
    index.filter((e) => e.slug !== slug),
    sha,
    `Remove ${slug} from index`,
  );
  await cacheDeleteRecipe(slug);
}

/** Full-text-ish search over the index (name, product, cuisine, ingredients). */
export function searchIndex(index: RecipeIndex, query: string): RecipeIndex {
  const q = query.trim().toLowerCase();
  if (!q) return index;
  return index.filter((e) => {
    const hay = [e.dishName, e.product, e.cuisine, ...e.ingredientNames]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export type { Recipe, RecipeIndex };
