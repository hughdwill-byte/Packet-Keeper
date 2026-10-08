/**
 * "Plan to shop": pick dishes -> one consolidated, tickable shopping list.
 * The session (chosen dishes, store, ticked items) persists in localStorage so
 * you can build it at home and tick items off in the aisle.
 */
import type { Recipe, ShoppingItem, Store } from "../shared/schema";

const SESSION_KEY = "packet-keeper-shop-v1";
const CHECKED_KEY = "packet-keeper-shop-checked-v1";

export interface ShopSession {
  slugs: Record<string, number>; // slug -> batch count (×1, ×2…)
  store: Store;
  includeOptional: boolean;
}

export function loadSession(fallbackStore: Store): ShopSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return { slugs: {}, store: fallbackStore, includeOptional: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { slugs: {}, store: fallbackStore, includeOptional: false };
}

export function saveSession(s: ShopSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadChecked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export function saveChecked(c: Record<string, boolean>): void {
  try {
    localStorage.setItem(CHECKED_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export interface MergedItem {
  key: string; // stable id for the ticked state (stapleKey or normalized name)
  item: ShoppingItem; // summed quantity across dishes
  dishes: string[]; // which selected dishes need it
}

/** Merge the shopping lists of several recipes, summing quantities per staple. */
export function consolidate(recipes: Recipe[], counts: Record<string, number>): MergedItem[] {
  const map = new Map<string, MergedItem>();
  for (const r of recipes) {
    const count = Math.max(1, counts[r.slug] || 1);
    for (const it of r.shoppingList) {
      const key = it.stapleKey || it.name.trim().toLowerCase();
      const prev = map.get(key);
      if (prev) {
        prev.item.quantity += it.quantity * count;
        prev.item.optional = prev.item.optional && it.optional; // core wins
        if (!prev.dishes.includes(r.dishName)) prev.dishes.push(r.dishName);
      } else {
        map.set(key, { key, item: { ...it, quantity: it.quantity * count }, dishes: [r.dishName] });
      }
    }
  }
  return [...map.values()];
}
