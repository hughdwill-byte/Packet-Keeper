/**
 * IndexedDB cache so browsing is fast and works offline. Mirrors the recipe
 * index and full recipes fetched from the repo.
 */
import { get, set, del, createStore } from "idb-keyval";
import type { Recipe, RecipeIndex } from "../shared/schema";

const store = createStore("packet-keeper-db", "recipes");
const INDEX_KEY = "__index__";

export async function cacheGetIndex(): Promise<RecipeIndex | null> {
  return (await get(INDEX_KEY, store)) ?? null;
}

export async function cacheSetIndex(index: RecipeIndex): Promise<void> {
  await set(INDEX_KEY, index, store);
}

export async function cacheGetRecipe(slug: string): Promise<Recipe | null> {
  return (await get(`recipe:${slug}`, store)) ?? null;
}

export async function cacheSetRecipe(recipe: Recipe): Promise<void> {
  await set(`recipe:${recipe.slug}`, recipe, store);
}

export async function cacheDeleteRecipe(slug: string): Promise<void> {
  await del(`recipe:${slug}`, store);
}
