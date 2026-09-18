/** Load the estimated price book (recipes/prices.json) from the static site. */
import type { PriceBook } from "../shared/prices";

let cached: PriceBook | null = null;

export async function loadPriceBook(): Promise<PriceBook> {
  if (cached) return cached;
  const res = await fetch(`${import.meta.env.BASE_URL}recipes/prices.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load price list");
  cached = (await res.json()) as PriceBook;
  return cached;
}

export function stapleKeysOf(book: PriceBook): string[] {
  return Object.keys(book.items);
}
