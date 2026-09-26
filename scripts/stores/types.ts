/** Shared contract for every supermarket adapter. */
export interface Product {
  id: string;
  name: string;
  price: number; // AUD shelf price today (what you'd pay now)
  wasPrice?: number; // pre-special price if on special
  onSpecial: boolean;
  size: string; // as printed, e.g. "500g", "1L", "each"
  unitPrice?: number; // store's unit price, e.g. 2.60 ($/kg)
  unitMeasure?: string; // "kg" | "L" | "100g" | "each" | ...
  url: string;
  inStock: boolean;
}

export interface StoreAdapter {
  key: "aldi" | "coles" | "woolworths" | "iga";
  label: string;
  /** Optional setup (e.g. launch Playwright, warm cookies). */
  init?(): Promise<void>;
  search(term: string): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  /** Optional teardown. */
  close?(): Promise<void>;
}

/** Thrown when a store shows a bot-challenge / captcha so we stop it politely. */
export class BlockedError extends Error {
  constructor(store: string, detail = "") {
    super(`${store} blocked (bot challenge/captcha)${detail ? ": " + detail : ""}`);
    this.name = "BlockedError";
  }
}
