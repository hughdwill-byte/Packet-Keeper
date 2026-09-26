/**
 * IGA adapter — igashop.com.au storefront API. IGA is per-store, so the store
 * id is configurable in config.json. Endpoint shapes vary between IGA storefront
 * versions, so this tries a couple of known patterns and fails soft.
 */
import type { StoreAdapter, Product } from "./types";
import { fetchJson, config, politeDelay } from "./http";

const SITE = "https://www.igashop.com.au";
const storeId = config.iga?.storeId ?? "";

function mapProduct(p: any): Product | null {
  if (!p) return null;
  const id = p.sku || p.id || p.productId;
  // price fields differ across versions: priceNumeric, price, pricing.now
  const price = Number(
    p.priceNumeric ?? p.price ?? p.pricing?.now ?? p.pricing?.price ?? p.sellPrice ?? 0,
  );
  if (!id || !price) return null;
  const was = Number(p.wasPrice ?? p.pricing?.was ?? 0) || undefined;
  return {
    id: String(id),
    name: p.name || p.displayName || p.description || "",
    price,
    wasPrice: was && was > price ? was : undefined,
    onSpecial: Boolean(p.onSpecial ?? p.isOnSpecial ?? (was && was > price)),
    size: p.unitOfSize?.abbreviation
      ? `${p.unitOfSize?.size ?? ""}${p.unitOfSize.abbreviation}`
      : p.packageSize || p.size || "",
    unitPrice: p.pricePerUnit ? Number(p.pricePerUnit) : p.pricing?.unit ? Number(p.pricing.unit) : undefined,
    unitMeasure: p.unitOfMeasure || p.pricing?.unitMeasure || undefined,
    url: p.slug ? `${SITE}/product/${p.slug}` : SITE,
    inStock: p.available !== false && p.inStock !== false,
  };
}

async function tryEndpoints(term: string): Promise<any[]> {
  const encoded = encodeURIComponent(term);
  const candidates = [
    `${SITE}/api/storefront/stores/${storeId}/search?q=${encoded}&take=24`,
    `${SITE}/api/v1/stores/${storeId}/search?q=${encoded}`,
    `${SITE}/apis/ui/Search/products?searchTerm=${encoded}&storeId=${storeId}`,
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      const data = await fetchJson<any>(url, { headers: { Referer: SITE + "/" } });
      const items = data?.products ?? data?.items ?? data?.results ?? data?.data ?? [];
      if (Array.isArray(items) && items.length) return items;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export const iga: StoreAdapter = {
  key: "iga",
  label: "IGA",
  async search(term) {
    if (!storeId) throw new Error("IGA storeId not set in scripts/stores/config.json");
    const items = await tryEndpoints(term);
    await politeDelay();
    return items.map(mapProduct).filter((x: Product | null): x is Product => !!x);
  },
  async getById(id) {
    const list = await this.search(id);
    return list.find((p) => p.id === String(id)) ?? null;
  },
};
