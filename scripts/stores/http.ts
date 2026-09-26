/** Polite HTTP + size/price normalisation helpers shared by adapters. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const config = JSON.parse(readFileSync(join(here, "config.json"), "utf8"));

const P = config.politeness ?? {};
export const MIN_DELAY = P.minDelayMs ?? 1000;
export const MAX_DELAY = P.maxDelayMs ?? 3000;
export const REQ_TIMEOUT = P.timeoutMsPerRequest ?? 20000;
export const STORE_TIMEOUT = P.hardTimeoutMsPerStore ?? 240000;
export const MAX_RETRIES = P.maxRetries ?? 2;

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const politeDelay = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));

export interface FetchOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** fetch with timeout + up to MAX_RETRIES exponential backoff on network/5xx. */
export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQ_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-AU,en;q=0.9",
          ...opts.headers,
        },
        body: opts.body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // retry 5xx
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// ---------- size + price normalisation ----------

export type Base = "g" | "ml" | "each";

/** Parse a printed size ("1kg", "500 g", "2L", "6 pack", "each") into base units. */
export function parseSize(raw: string | undefined): { value: number; base: Base } | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/,/g, "").trim();
  // multipack like "6 x 375ml" -> total ml
  const multi = s.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)/);
  if (multi) {
    const count = parseFloat(multi[1]);
    const each = parseFloat(multi[2]);
    const unit = multi[3];
    const per = toBase(each, unit);
    if (per) return { value: per.value * count, base: per.base };
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|litre|liter|l|ml|ea|each|pk|pack|pieces?|dozen)?/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2] || "each";
  return toBase(value, unit);
}

function toBase(value: number, unit: string): { value: number; base: Base } | null {
  switch (unit) {
    case "kg": return { value: value * 1000, base: "g" };
    case "g": return { value, base: "g" };
    case "l": case "litre": case "liter": return { value: value * 1000, base: "ml" };
    case "ml": return { value, base: "ml" };
    case "dozen": return { value: value * 12, base: "each" };
    case "ea": case "each": case "pk": case "pack": case "piece": case "pieces":
      return { value, base: "each" };
    default: return null;
  }
}

/** Convert a store unitMeasure ("kg","100g","L","100ml","each") to price-per-base-unit factor. */
function unitMeasureToPerBase(unitPrice: number, unitMeasure: string | undefined): { perUnit: number; base: Base } | null {
  if (!unitMeasure) return null;
  const u = unitMeasure.toLowerCase().replace(/[^a-z0-9]/g, "");
  switch (u) {
    case "kg": return { perUnit: unitPrice / 1000, base: "g" };
    case "100g": return { perUnit: unitPrice / 100, base: "g" };
    case "g": return { perUnit: unitPrice, base: "g" };
    case "l": case "litre": return { perUnit: unitPrice / 1000, base: "ml" };
    case "100ml": return { perUnit: unitPrice / 100, base: "ml" };
    case "ml": return { perUnit: unitPrice, base: "ml" };
    case "ea": case "each": return { perUnit: unitPrice, base: "each" };
    default: return null;
  }
}

/**
 * Normalise a product's price to the amount you'd pay for the staple's `pack`.
 * Prefers the store's unit price; falls back to price ÷ parsed size.
 */
export function priceForPack(
  product: { price: number; size: string; unitPrice?: number; unitMeasure?: string },
  pack: number,
  stapleBase: Base,
): number | null {
  // 1) unit price path
  const upm = product.unitPrice ? unitMeasureToPerBase(product.unitPrice, product.unitMeasure) : null;
  if (upm && upm.base === stapleBase && upm.perUnit > 0) {
    return round2(upm.perUnit * pack);
  }
  // 2) price ÷ size path
  const size = parseSize(product.size);
  if (size && size.base === stapleBase && size.value > 0) {
    return round2((product.price / size.value) * pack);
  }
  // 3) each-based fallback: assume the product IS one unit
  if (stapleBase === "each") return round2(product.price * pack);
  // 4) last resort: if we can't reconcile units, use raw price (better than nothing)
  return round2(product.price);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

const STORE_BRANDS: Record<string, string[]> = {
  woolworths: ["woolworths", "homebrand", "essentials", "macro", "the odd bunch"],
  coles: ["coles"],
  aldi: ["aldi"],
  iga: ["black & gold", "black and gold", "community co", "iga", "farmers union"],
};
const MULTIPACK = /(\d+\s*(?:x|×)\s*\d+)|\bbulk\b|\bmulti\b|\bcarton\b|\bcase\b/i;

/** Score a candidate product against a staple; higher = better. */
export function scoreMatch(
  store: string,
  term: string,
  staple: { name: string; pack: number; base: Base },
  p: Product,
  rank: number,
): number {
  let score = 100 - rank; // relevance from search order
  const nameLc = p.name.toLowerCase();
  const termWords = term.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = termWords.filter((w) => nameLc.includes(w)).length;
  score += hits * 8;
  if (!p.inStock) score -= 40;
  if (MULTIPACK.test(p.name) || MULTIPACK.test(p.size)) score -= 25;
  if ((STORE_BRANDS[store] || []).some((b) => nameLc.includes(b))) score += 12; // home brand
  const size = parseSize(p.size);
  if (size && size.base === staple.base && staple.pack > 0) {
    const ratio = size.value / staple.pack;
    // closest to pack size wins; penalise being far off (log distance)
    score -= Math.min(30, Math.abs(Math.log2(ratio)) * 10);
  }
  return score;
}
