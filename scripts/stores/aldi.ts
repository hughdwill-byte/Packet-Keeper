/**
 * ALDI adapter — public product-search API (api.aldi.com.au).
 * Note: ALDI AU only lists a limited online range; many staples (esp. fresh
 * produce & meat) simply aren't sold online and will return no match.
 */
import type { StoreAdapter, Product } from "./types";
import { fetchJson, config, politeDelay } from "./http";

const API = "https://api.aldi.com.au/v3/product-search";
const SITE = "https://www.aldi.com.au";
const servicePoint = config.aldi?.servicePoint ?? "G452";
const serviceType = config.aldi?.serviceType ?? "walk-in";

function q(term: string, limit = 30): string {
  const params = new URLSearchParams({
    currency: "AUD",
    serviceType,
    q: term,
    limit: String(limit),
    offset: "0",
    sort: "relevance",
    testVariant: "A",
    servicePoint,
  });
  return `${API}?${params.toString()}`;
}

function toDollars(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  // ALDI returns price.amount in cents.
  return n > 1000 ? n / 100 : n;
}

function mapProduct(p: any): Product | null {
  if (!p) return null;
  const id = p.sku || p.productId || p.urlSlugText;
  const price = toDollars(p.price?.amount ?? p.price?.value);
  if (!id || !price) return null;
  const was = p.price?.wasPriceFormatted ? Number(String(p.price.wasPriceFormatted).replace(/[^0-9.]/g, "")) : undefined;
  return {
    id: String(id),
    name: [p.brandName, p.name].filter(Boolean).join(" ").trim() || p.name || "",
    price,
    wasPrice: was && was > price ? was : undefined,
    onSpecial: Boolean(p.price?.wasPriceFormatted) || Boolean(p.onSale),
    size: p.sellingSize || p.packagingSize || "",
    unitPrice: p.price?.comparison?.pricePerUnit ? toDollars(p.price.comparison.pricePerUnit) : undefined,
    unitMeasure: p.price?.comparison?.unit || undefined,
    url: p.urlSlugText ? `${SITE}/product/${p.urlSlugText}` : SITE,
    inStock: p.notForSale !== true,
  };
}

export const aldi: StoreAdapter = {
  key: "aldi",
  label: "ALDI",
  async search(term) {
    const data = await fetchJson<any>(q(term), {
      headers: { Origin: SITE, Referer: SITE + "/" },
    });
    const items = data?.data ?? data?.products ?? [];
    await politeDelay();
    return items.map(mapProduct).filter((x: Product | null): x is Product => !!x);
  },
  async getById(id) {
    // Re-search by SKU and match exactly (ALDI has no clean per-SKU public endpoint).
    const list = await this.search(id);
    return list.find((p) => p.id === String(id)) ?? null;
  },
};
