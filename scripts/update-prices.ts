/**
 * Daily price updater. Prices each staple at each store, normalises to the
 * staple's pack, applies safety rules, recomputes recipe costs, and writes a
 * match report. Designed to run in GitHub Actions (open internet); in a
 * network-restricted sandbox every store will simply report "blocked".
 *
 *   npm run prices                 # update all stores
 *   npm run prices -- --stores=aldi,iga
 *   npm run prices -- --rematch    # ignore saved productIds, re-search everything
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { STORES, RecipeSchema, toIndexEntry, type Store, type IndexEntry } from "../src/shared/schema";
import { costByStore as computeCostByStore } from "../src/shared/prices";
import type { PriceBook, StorePrice, StoreStatus } from "../src/shared/prices";
import { priceForPack, scoreMatch, STORE_TIMEOUT, type Base } from "./stores/http";
import type { StoreAdapter, Product } from "./stores/types";
import { BlockedError } from "./stores/types";
import { closeBrowser } from "./stores/browser";
import { woolworths } from "./stores/woolworths";
import { coles } from "./stores/coles";
import { aldi } from "./stores/aldi";
import { iga } from "./stores/iga";

const R = join(process.cwd(), "recipes");
const OUT = join(process.cwd(), "scripts", "output");
const today = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

const ADAPTERS: Record<Store, StoreAdapter> = { woolworths, coles, aldi, iga };

const args = process.argv.slice(2);
const rematch = args.includes("--rematch");
const storesArg = args.find((a) => a.startsWith("--stores="));
const onlyStores = storesArg ? (storesArg.split("=")[1].split(",") as Store[]) : STORES;

type Row = { store: Store; key: string; staple: string; action: string; product: string; size: string; price: string; id: string };
const report: Row[] = [];

function baseOf(unit: string): Base {
  return unit === "g" ? "g" : unit === "ml" ? "ml" : "each";
}

async function priceOneStore(store: Store, book: PriceBook): Promise<StoreStatus> {
  const adapter = ADAPTERS[store];
  const prev = book.storeStatus?.[store];
  const started = Date.now();
  let anySuccess = false;
  try {
    if (adapter.init) await adapter.init();
  } catch (e) {
    const msg = e instanceof BlockedError ? e.message : `init failed: ${(e as Error).message}`;
    console.log(`  ✗ ${store}: ${msg}`);
    return { ok: false, lastSuccess: prev?.lastSuccess, error: msg };
  }

  try {
    for (const [key, item] of Object.entries(book.items)) {
      const sp: StorePrice | undefined = item.stores[store];
      if (!sp) continue;
      if (Date.now() - started > STORE_TIMEOUT) {
        console.log(`  ⏱ ${store}: hard timeout, stopping`);
        return { ok: anySuccess, lastSuccess: anySuccess ? today : prev?.lastSuccess, error: "store timeout" };
      }
      if (sp.locked) { report.push(row(store, key, item.name, "locked (kept)", sp)); continue; }
      if (key === "recipe_base") { report.push(row(store, key, item.name, "skipped (no match)", sp)); continue; }

      const term = sp.searchTerm || item.name;
      const base = baseOf(item.unit);
      try {
        let product: Product | null = null;
        if (sp.productId && !rematch) product = await adapter.getById(sp.productId);
        if (!product) {
          const results = await adapter.search(term);
          product = pickBest(store, term, item.name, item.pack, base, results);
        }
        if (!product) { report.push(row(store, key, item.name, "no match (kept)", sp)); continue; }

        const newPrice = priceForPack(product, item.pack, base);
        if (newPrice == null || newPrice <= 0) { report.push(row(store, key, item.name, "unpriceable (kept)", sp)); continue; }

        // Safety: reject >±60% swings unless the previous value was an estimate.
        if (sp.price != null && sp.source !== "estimate") {
          const delta = Math.abs(newPrice - sp.price) / sp.price;
          if (delta > 0.6) {
            report.push({ ...row(store, key, item.name, `REJECTED Δ${Math.round(delta * 100)}% (kept $${sp.price})`, sp), product: product.name, price: `$${newPrice}` });
            anySuccess = true; // we did reach the store
            continue;
          }
        }

        const wasNorm = product.wasPrice
          ? priceForPack({ ...product, price: product.wasPrice }, item.pack, base) ?? undefined
          : undefined;
        item.stores[store] = {
          ...sp,
          price: newPrice,
          product: product.name,
          productId: product.id,
          url: product.url,
          size: product.size,
          unitPrice: product.unitPrice,
          unitMeasure: product.unitMeasure,
          onSpecial: product.onSpecial,
          wasPrice: product.onSpecial ? wasNorm : undefined,
          lastChecked: today,
          source: "live",
          searchTerm: term,
        };
        anySuccess = true;
        report.push({ store, key, staple: item.name, action: product.onSpecial ? `live (special, was $${wasNorm})` : "live", product: product.name, size: product.size, price: `$${newPrice}`, id: product.id });
      } catch (e) {
        if (e instanceof BlockedError) {
          console.log(`  ✗ ${store}: ${e.message} — stopping this store`);
          return { ok: anySuccess, lastSuccess: anySuccess ? today : prev?.lastSuccess, error: e.message };
        }
        report.push(row(store, key, item.name, `error: ${(e as Error).message} (kept)`, sp));
      }
    }
  } finally {
    if (adapter.close) await adapter.close().catch(() => {});
  }
  const ok = anySuccess;
  console.log(`  ${ok ? "✓" : "✗"} ${store}: ${ok ? "updated" : "no prices"}`);
  return { ok, lastSuccess: ok ? today : prev?.lastSuccess, error: ok ? undefined : "no prices returned" };
}

function pickBest(store: Store, term: string, name: string, pack: number, base: Base, results: Product[]): Product | null {
  if (!results.length) return null;
  const scored = results.map((p, i) => ({ p, s: scoreMatch(store, term, { name, pack, base }, p, i) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].p;
}

function row(store: Store, key: string, staple: string, action: string, sp: StorePrice): Row {
  return { store, key, staple, action, product: sp.product ?? "", size: sp.size ?? "", price: sp.price != null ? `$${sp.price}` : "—", id: sp.productId ?? "" };
}

async function recomputeCosts(book: PriceBook) {
  const files = (await readdir(R)).filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "prices.json");
  const index: IndexEntry[] = [];
  for (const f of files) {
    const recipe = RecipeSchema.parse(JSON.parse(await readFile(join(R, f), "utf8")));
    recipe.costByStore = computeCostByStore(recipe.shoppingList, book);
    await writeFile(join(R, f), JSON.stringify(recipe, null, 2), "utf8");
    index.push(toIndexEntry(recipe));
  }
  index.sort((a, b) => a.dishName.localeCompare(b.dishName));
  await writeFile(join(R, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`Recomputed costs for ${files.length} recipes.`);
}

async function writeReport(book: PriceBook, statuses: Record<string, StoreStatus>) {
  await mkdir(OUT, { recursive: true });
  const lines: string[] = [`# Price match report — ${today}`, ""];
  lines.push("## Store status");
  for (const s of STORES) {
    const st = statuses[s] ?? book.storeStatus?.[s];
    lines.push(`- **${s}**: ${st?.ok ? "✅ ok" : "❌ failed"}${st?.error ? ` — ${st.error}` : ""}${st?.lastSuccess ? ` (last success ${st.lastSuccess})` : ""}`);
  }
  for (const s of STORES) {
    const rows = report.filter((r) => r.store === s);
    if (!rows.length) continue;
    lines.push("", `## ${s}`, "", "| Staple | Action | Product | Size | Price (per pack) | productId |", "|---|---|---|---|---|---|");
    for (const r of rows) lines.push(`| ${r.staple} | ${r.action} | ${esc(r.product)} | ${r.size} | ${r.price} | ${r.id} |`);
  }
  await writeFile(join(OUT, "match-report.md"), lines.join("\n"), "utf8");
  console.log(`Wrote ${join("scripts", "output", "match-report.md")}`);
}
const esc = (s: string) => s.replace(/\|/g, "\\|");

async function main() {
  const book = JSON.parse(await readFile(join(R, "prices.json"), "utf8")) as PriceBook;
  book.storeStatus = book.storeStatus ?? {};

  const statuses: Record<string, StoreStatus> = {};
  for (const store of STORES) {
    if (!onlyStores.includes(store)) continue;
    console.log(`\n=== ${store} ===`);
    statuses[store] = await priceOneStore(store, book);
    book.storeStatus[store] = statuses[store];
  }
  await closeBrowser();

  book.updatedAt = nowIso;
  book.note = "Prices auto-updated daily from live supermarket data where available; otherwise last-known/estimate. ALDI/IGA coverage is partial.";
  await writeFile(join(R, "prices.json"), JSON.stringify(book, null, 2), "utf8");

  await recomputeCosts(book);
  await writeReport(book, statuses);

  const attempted = STORES.filter((s) => onlyStores.includes(s));
  const anyOk = attempted.some((s) => statuses[s]?.ok);
  console.log(`\nDone. Stores ok: ${attempted.filter((s) => statuses[s]?.ok).join(", ") || "none"}`);
  if (!anyOk) {
    console.error("All stores failed — exiting non-zero (previous prices kept).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
