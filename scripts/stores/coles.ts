/**
 * Coles adapter — product data is in the server-rendered __NEXT_DATA__ of
 * coles.com.au pages, behind Imperva. Uses Playwright with a warm-up homepage
 * visit and slow sequential navigation. Stops the store on a challenge page.
 */
import type { StoreAdapter, Product } from "./types";
import { BlockedError } from "./types";
import { newContext, looksBlocked } from "./browser";
import { politeDelay } from "./http";
import type { BrowserContext, Page } from "playwright";

const BASE = "https://www.coles.com.au";
let ctx: BrowserContext | null = null;
let page: Page | null = null;
let warmed = false;

async function ensurePage(): Promise<Page> {
  if (page && warmed) return page;
  if (!ctx) ctx = await newContext();
  if (!page) page = await ctx.newPage();
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const body = await page.content();
  if ((res && res.status() >= 400) || looksBlocked(body)) throw new BlockedError("Coles", "homepage");
  warmed = true;
  await politeDelay();
  return page;
}

async function nextData(url: string): Promise<any> {
  const p = await ensurePage();
  const res = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const html = await p.content();
  if ((res && res.status() >= 400) || looksBlocked(html)) throw new BlockedError("Coles", url);
  const json = await p.$eval("#__NEXT_DATA__", (el) => el.textContent).catch(() => null);
  if (!json) throw new BlockedError("Coles", "no __NEXT_DATA__ (likely challenged)");
  return JSON.parse(json);
}

function mapProduct(p: any): Product | null {
  if (!p || p._type === "SINGLE_TILE") return null;
  const id = p.id ?? p.productId;
  const pricing = p.pricing ?? {};
  const price = Number(pricing.now ?? pricing.price ?? 0);
  if (!id || !price) return null;
  const was = Number(pricing.was ?? 0) || undefined;
  const unitStr: string = pricing.comparable || ""; // e.g. "$2.60 per 1kg"
  const um = unitStr.match(/\$([0-9.]+)\s*per\s*([0-9]*\s*[a-zA-Z]+)/);
  return {
    id: String(id),
    name: [p.brand, p.name].filter(Boolean).join(" ").trim() || p.name || "",
    price,
    wasPrice: was && was > price ? was : undefined,
    onSpecial: Boolean(pricing.onSpecial ?? (was && was > price)),
    size: p.size || "",
    unitPrice: um ? Number(um[1]) : undefined,
    unitMeasure: um ? um[2].replace(/\s/g, "") : undefined,
    url: `${BASE}/product/${id}`,
    inStock: p.availability !== false && pricing.now != null,
  };
}

function extractProducts(data: any): any[] {
  const pp = data?.props?.pageProps ?? {};
  const results = pp.searchResults ?? pp.results ?? {};
  return results.results ?? results.products ?? pp.products ?? [];
}

export const coles: StoreAdapter = {
  key: "coles",
  label: "Coles",
  async init() {
    await ensurePage();
  },
  async search(term) {
    const data = await nextData(`${BASE}/search/products?q=${encodeURIComponent(term)}`);
    return extractProducts(data).map(mapProduct).filter((x: Product | null): x is Product => !!x);
  },
  async getById(id) {
    try {
      const data = await nextData(`${BASE}/product/${id}`);
      const pd = data?.props?.pageProps?.product ?? data?.props?.pageProps?.productData;
      const mapped = pd ? mapProduct(pd) : null;
      if (mapped) return mapped;
    } catch (e) {
      if (e instanceof BlockedError) throw e;
    }
    const list = await this.search(id);
    return list.find((p) => p.id === String(id)) ?? null;
  },
  async close() {
    await ctx?.close().catch(() => {});
    ctx = null;
    page = null;
    warmed = false;
  },
};
