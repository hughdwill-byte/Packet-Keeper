/**
 * IGA adapter (igashop.com.au). IGA is per-store and its storefront API differs
 * between versions, so instead of guessing an endpoint we drive the real store
 * page with Playwright and CAPTURE whatever JSON the site itself requests during
 * a search. Set your store in scripts/stores/config.json → iga.storeUrl.
 */
import type { StoreAdapter, Product } from "./types";
import { BlockedError } from "./types";
import { newContext, looksBlocked } from "./browser";
import { config, politeDelay } from "./http";
import type { BrowserContext, Page } from "playwright";

const HOME = "https://www.igashop.com.au";
const storeUrl: string = config.iga?.storeUrl || "";
let ctx: BrowserContext | null = null;
let page: Page | null = null;

async function ensurePage(): Promise<Page> {
  if (page) return page;
  ctx = await newContext();
  page = await ctx.newPage();
  const target = storeUrl || HOME;
  const res = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  const body = await page.content();
  if ((res && res.status() >= 400) || looksBlocked(body)) throw new BlockedError("IGA", "store page");
  await politeDelay();
  return page;
}

/** Recursively find the largest array of product-shaped objects in any JSON. */
function deepFindProducts(node: unknown, best: any[] = []): any[] {
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === "object");
    const productish = objs.filter((o: any) => nameOf(o) && priceOf(o) != null);
    if (productish.length > best.length) best = productish;
    for (const x of node) best = deepFindProducts(x, best);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) best = deepFindProducts(v, best);
  }
  return best;
}
const nameOf = (o: any): string => o.name || o.displayName || o.description || o.title || "";
function priceOf(o: any): number | null {
  const cands = [o.priceNumeric, o.price, o.sellPrice, o.pricing?.now, o.pricing?.price, o.unitPrice];
  for (const c of cands) {
    const n = typeof c === "string" ? Number(c.replace(/[^0-9.]/g, "")) : Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function mapProduct(o: any): Product | null {
  const id = o.sku || o.id || o.productId || o.code;
  const price = priceOf(o);
  if (!id || !price) return null;
  const was = Number(o.wasPrice ?? o.pricing?.was ?? 0) || undefined;
  const size =
    (o.unitOfSize?.size != null ? `${o.unitOfSize.size}${o.unitOfSize.abbreviation || ""}` : "") ||
    o.packageSize || o.size || o.sellSize || "";
  return {
    id: String(id),
    name: nameOf(o),
    price,
    wasPrice: was && was > price ? was : undefined,
    onSpecial: Boolean(o.onSpecial ?? o.isOnSpecial ?? (was && was > price)),
    size,
    unitPrice: o.pricePerUnit ? Number(o.pricePerUnit) : o.pricing?.unit ? Number(o.pricing.unit) : undefined,
    unitMeasure: o.unitOfMeasure || o.pricing?.unitMeasure || undefined,
    url: o.slug ? `${HOME}/product/${o.slug}` : storeUrl || HOME,
    inStock: o.available !== false && o.inStock !== false,
  };
}

export const iga: StoreAdapter = {
  key: "iga",
  label: "IGA",
  async init() {
    if (!storeUrl) throw new Error("IGA storeUrl not set in scripts/stores/config.json (see comment).");
    await ensurePage();
    console.log(`    IGA store: ${config.iga?.storeName || storeUrl}`);
  },
  async search(term) {
    const p = await ensurePage();
    const captured: any[] = [];
    const onResp = async (resp: import("playwright").Response) => {
      try {
        const ct = resp.headers()["content-type"] || "";
        if (!ct.includes("json") || resp.status() !== 200) return;
        const json = await resp.json();
        const found = deepFindProducts(json);
        if (found.length) captured.push(...found);
      } catch {
        /* ignore non-JSON / opaque */
      }
    };
    p.on("response", onResp);
    try {
      // Prefer the site's own search: type into a search box if present…
      const base = storeUrl || HOME;
      let triggered = false;
      const input = await p.$('input[type="search"], input[name*="search" i], input[placeholder*="search" i]');
      if (input) {
        await input.fill(term);
        await input.press("Enter");
        triggered = true;
      }
      if (!triggered) {
        await p.goto(`${base.replace(/\/$/, "")}/search?q=${encodeURIComponent(term)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      }
      // Give the site a moment to fire its product XHRs.
      await p.waitForTimeout(3500);
      if (looksBlocked(await p.content())) throw new BlockedError("IGA", "search page");
    } finally {
      p.off("response", onResp);
    }
    await politeDelay();
    // De-dup by id and map.
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const o of captured) {
      const m = mapProduct(o);
      if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
    }
    return out;
  },
  async getById(id) {
    const list = await this.search(id);
    return list.find((p) => p.id === String(id)) ?? null;
  },
  async close() {
    await ctx?.close().catch(() => {});
    ctx = null;
    page = null;
  },
};
