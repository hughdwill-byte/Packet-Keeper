/**
 * Woolworths adapter. Uses the /apis/ui/Search/products JSON API, executed
 * inside a warmed-up Playwright page so Akamai cookies + fingerprint are valid.
 */
import type { StoreAdapter, Product } from "./types";
import { BlockedError } from "./types";
import { newContext, looksBlocked } from "./browser";
import { politeDelay } from "./http";
import type { BrowserContext, Page } from "playwright";

const BASE = "https://www.woolworths.com.au";

let ctx: BrowserContext | null = null;
let page: Page | null = null;

async function ensurePage(): Promise<Page> {
  if (page) return page;
  ctx = await newContext();
  page = await ctx.newPage();
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const body = await page.content();
  if ((res && res.status() >= 400) || looksBlocked(body)) throw new BlockedError("Woolworths", "homepage");
  await politeDelay();
  return page;
}

/** Run a fetch inside the page (same-origin, real cookies). */
async function apiFetch(pathOrUrl: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const p = await ensurePage();
  const result = await p.evaluate(
    async ([url, method, body]) => {
      const r = await fetch(url as string, {
        method: (method as string) || "GET",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: body ? (body as string) : undefined,
        credentials: "include",
      });
      const text = await r.text();
      return { status: r.status, text };
    },
    [pathOrUrl.startsWith("http") ? pathOrUrl : BASE + pathOrUrl, init?.method ?? "GET", init?.body ? JSON.stringify(init.body) : ""],
  );
  if (result.status === 403 || looksBlocked(result.text)) throw new BlockedError("Woolworths", `status ${result.status}`);
  if (result.status >= 400) throw new Error(`Woolworths HTTP ${result.status}`);
  try {
    return JSON.parse(result.text);
  } catch {
    throw new Error("Woolworths: non-JSON response");
  }
}

function mapProduct(raw: any): Product | null {
  const p = raw?.Products?.[0] ?? raw; // search nests variants under Products[]
  if (!p || p.Stockcode == null) return null;
  const price = Number(p.Price ?? p.InstorePrice ?? 0);
  if (!price) return null;
  return {
    id: String(p.Stockcode),
    name: p.DisplayName || p.Name || "",
    price,
    wasPrice: p.WasPrice ? Number(p.WasPrice) : undefined,
    onSpecial: Boolean(p.IsOnSpecial),
    size: p.PackageSize || p.Unit || "",
    unitPrice: p.CupPrice ? Number(p.CupPrice) : undefined,
    unitMeasure: p.CupMeasure || undefined,
    url: p.UrlFriendlyName ? `${BASE}/shop/productdetails/${p.Stockcode}/${p.UrlFriendlyName}` : `${BASE}/shop/productdetails/${p.Stockcode}`,
    inStock: p.IsInStock !== false,
  };
}

export const woolworths: StoreAdapter = {
  key: "woolworths",
  label: "Woolworths",
  async init() {
    await ensurePage();
  },
  async search(term) {
    const data = await apiFetch("/apis/ui/Search/products", {
      method: "POST",
      body: {
        SearchTerm: term,
        PageSize: 24,
        PageNumber: 1,
        SortType: "TraderRelevance",
        Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
        IsSpecial: false,
        GpBoost: 0,
        GroupEdmVariants: true,
      },
    });
    const groups = data?.Products ?? [];
    return groups.map(mapProduct).filter((x: Product | null): x is Product => !!x);
  },
  async getById(id) {
    try {
      const data = await apiFetch(`/apis/ui/product/detail/${id}`);
      const p = data?.Product ?? data;
      const mapped = mapProduct(p);
      if (mapped) return mapped;
    } catch {
      /* fall through to search-by-stockcode */
    }
    const list = await this.search(id);
    return list.find((p) => p.id === String(id)) ?? null;
  },
  async close() {
    await ctx?.close().catch(() => {});
    ctx = null;
    page = null;
  },
};
