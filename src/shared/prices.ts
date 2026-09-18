/**
 * Cost engine. Pure functions over a PriceBook (recipes/prices.json), shared by
 * the browser app and scripts. Prices are ESTIMATES, refreshed periodically —
 * never scraped live (see README). The browser fetches prices.json; Node reads it.
 */
import type { ShoppingItem, Store } from "./schema";
import { STORES } from "./schema";

export interface StorePrice {
  price: number | null; // AUD; null = not stocked / unknown at this store
  product: string; // suggested product name to buy
}
export interface StapleItem {
  name: string;
  pack: number; // pack size in `unit`
  unit: string; // g | ml | each
  category?: string;
  stores: Record<Store, StorePrice>;
}
export interface PriceBook {
  updatedAt: string;
  note?: string;
  items: Record<string, StapleItem>;
}

function priceFor(book: PriceBook, key: string, store: Store): { item: StapleItem; sp: StorePrice } | null {
  const item = book.items[key];
  if (!item) return null;
  const sp = item.stores[store];
  if (!sp || sp.price == null) return null;
  return { item, sp };
}

/**
 * Proportional cost-to-make (you use part of a pack) for one store.
 * Optional lines (extra veg, to-serve, upgrades) are excluded by default.
 */
export function recipeCost(
  list: ShoppingItem[],
  book: PriceBook,
  store: Store,
  opts: { includeOptional?: boolean } = {},
): { total: number; unknown: string[] } {
  let total = 0;
  const unknown: string[] = [];
  for (const it of list) {
    if (it.optional && !opts.includeOptional) continue;
    const hit = it.stapleKey ? priceFor(book, it.stapleKey, store) : null;
    if (!hit || hit.item.pack <= 0) {
      unknown.push(it.name);
      continue;
    }
    total += (it.quantity / hit.item.pack) * (hit.sp.price as number);
  }
  return { total: Math.round(total * 100) / 100, unknown };
}

/** Cost across all stores (used to precompute costByStore at save time). */
export function costByStore(list: ShoppingItem[], book: PriceBook): Record<Store, number> {
  const out = {} as Record<Store, number>;
  for (const s of STORES) out[s] = recipeCost(list, book, s).total;
  return out;
}

export interface ShoppingLine {
  name: string;
  product: string;
  buyQuantity: number; // packs to buy
  packLabel: string; // e.g. "500g"
  lineCost: number;
  optional: boolean;
  unknown: boolean;
}

/** A concrete shopping list for one store: whole packs to buy + total spend. */
export function buildShoppingList(
  list: ShoppingItem[],
  book: PriceBook,
  store: Store,
  opts: { includeOptional?: boolean } = {},
): { lines: ShoppingLine[]; total: number } {
  const lines: ShoppingLine[] = [];
  let total = 0;
  for (const it of list) {
    if (it.optional && !opts.includeOptional) continue;
    const hit = it.stapleKey ? priceFor(book, it.stapleKey, store) : null;
    if (!hit || hit.item.pack <= 0) {
      lines.push({
        name: it.name,
        product: "—",
        buyQuantity: 0,
        packLabel: "",
        lineCost: 0,
        optional: it.optional,
        unknown: true,
      });
      continue;
    }
    const packs = Math.max(1, Math.ceil(it.quantity / hit.item.pack));
    const lineCost = Math.round(packs * (hit.sp.price as number) * 100) / 100;
    total += lineCost;
    lines.push({
      name: it.name,
      product: hit.sp.product,
      buyQuantity: packs,
      packLabel: `${hit.item.pack}${hit.item.unit === "each" ? "" : hit.item.unit}`,
      lineCost,
      optional: it.optional,
      unknown: false,
    });
  }
  return { lines, total: Math.round(total * 100) / 100 };
}

export function formatAUD(n: number): string {
  return `$${n.toFixed(2)}`;
}
