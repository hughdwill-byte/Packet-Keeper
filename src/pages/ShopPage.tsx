import { useEffect, useMemo, useState } from "react";
import { loadSettings } from "../lib/settings";
import { loadIndex, getRecipe, searchIndex, type RecipeIndex, type Recipe } from "../lib/recipes";
import { loadPriceBook } from "../lib/priceBook";
import { shoppingLineFor, formatAUD, type PriceBook } from "../shared/prices";
import { STORES, STORE_LABELS, type Store } from "../shared/schema";
import { trolleySearchUrl } from "../shared/util";
import {
  loadSession, saveSession, loadChecked, saveChecked, consolidate,
  type ShopSession, type MergedItem,
} from "../lib/shop";

export default function ShopPage() {
  const settings = useMemo(() => loadSettings(), []);
  const [index, setIndex] = useState<RecipeIndex | null>(null);
  const [book, setBook] = useState<PriceBook | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [session, setSession] = useState<ShopSession>(() => loadSession(settings.preferredStore));
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadChecked());
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadIndex().then(setIndex).catch((e) => setError((e as Error).message)); }, []);
  useEffect(() => { loadPriceBook().then(setBook).catch(() => setBook(null)); }, []);
  useEffect(() => { saveSession(session); }, [session]);
  useEffect(() => { saveChecked(checked); }, [checked]);

  // Load full recipes for selected dishes.
  useEffect(() => {
    const slugs = Object.keys(session.slugs);
    const missing = slugs.filter((s) => !recipes[s]);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map((s) => getRecipe(s, settings).then((r) => [s, r] as const))).then((pairs) => {
      if (cancelled) return;
      setRecipes((prev) => {
        const next = { ...prev };
        for (const [s, r] of pairs) if (r) next[s] = r;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [session.slugs, recipes, settings]);

  const selectedRecipes = useMemo(
    () => Object.keys(session.slugs).map((s) => recipes[s]).filter(Boolean) as Recipe[],
    [session.slugs, recipes],
  );

  const merged: MergedItem[] = useMemo(
    () => (book ? consolidate(selectedRecipes, session.slugs) : []),
    [selectedRecipes, session.slugs, book],
  );

  const rows = useMemo(() => {
    if (!book) return [];
    return merged
      .filter((m) => session.includeOptional || !m.item.optional)
      .map((m) => ({ m, line: shoppingLineFor(m.item, book, session.store), done: !!checked[m.key] }))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1; // unchecked first
        if (a.m.item.optional !== b.m.item.optional) return a.m.item.optional ? 1 : -1;
        return a.line.name.localeCompare(b.line.name);
      });
  }, [merged, book, session.store, session.includeOptional, checked]);

  const totals = useMemo(() => {
    let remaining = 0, all = 0, left = 0;
    for (const r of rows) {
      all += r.line.lineCost;
      if (!r.done) { remaining += r.line.lineCost; left++; }
    }
    return { remaining: Math.round(remaining * 100) / 100, all: Math.round(all * 100) / 100, left };
  }, [rows]);

  const setCount = (slug: string, n: number) => {
    setSession((s) => {
      const slugs = { ...s.slugs };
      if (n <= 0) delete slugs[slug]; else slugs[slug] = n;
      return { ...s, slugs };
    });
  };
  const toggleCheck = (key: string) => setChecked((c) => ({ ...c, [key]: !c[key] }));
  const clearAll = () => { setSession((s) => ({ ...s, slugs: {} })); setChecked({}); };

  const chooser = index ? searchIndex(index, query) : [];
  const selectedCount = Object.keys(session.slugs).length;

  return (
    <div className="pb-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Shop</h1>
        <select
          value={session.store}
          onChange={(e) => setSession((s) => ({ ...s, store: e.target.value as Store }))}
          className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm"
          aria-label="Store"
        >
          {STORES.map((s) => <option key={s} value={s}>{STORE_LABELS[s]}</option>)}
        </select>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {/* Selected dishes */}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(session.slugs).map(([slug, n]) => {
            const name = recipes[slug]?.dishName || index?.find((e) => e.slug === slug)?.dishName || slug;
            return (
              <span key={slug} className="flex items-center gap-1 rounded-full bg-orange-100 py-1 pl-3 pr-1 text-sm">
                <span className="font-medium">{name}</span>
                <button onClick={() => setCount(slug, n - 1)} className="h-6 w-6 rounded-full text-stone-500" aria-label="fewer">–</button>
                <span className="w-4 text-center text-xs font-bold">{n}</span>
                <button onClick={() => setCount(slug, n + 1)} className="h-6 w-6 rounded-full text-brand-600" aria-label="more">+</button>
                <button onClick={() => setCount(slug, 0)} className="h-6 w-6 rounded-full text-red-400" aria-label="remove">✕</button>
              </span>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setPicking((v) => !v)}
        className="mb-3 w-full rounded-xl border border-brand-300 py-2.5 font-semibold text-brand-700"
      >
        {picking ? "Done choosing" : selectedCount ? "+ Add / change dishes" : "+ Choose dishes to cook"}
      </button>

      {picking && (
        <div className="mb-4 rounded-2xl border border-orange-100 bg-white p-3">
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="mb-2 w-full rounded-lg border border-orange-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {chooser.map((e) => {
              const on = !!session.slugs[e.slug];
              return (
                <button
                  key={e.slug}
                  onClick={() => setCount(e.slug, on ? 0 : 1)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${on ? "bg-brand-600 text-white" : "bg-orange-50"}`}
                >
                  <span className="truncate">{e.dishName}</span>
                  <span>{on ? "✓" : "+"}</span>
                </button>
              );
            })}
            {index && chooser.length === 0 && <p className="p-2 text-sm text-stone-500">No matches.</p>}
          </div>
        </div>
      )}

      {selectedCount === 0 ? (
        <div className="mt-8 text-center text-stone-500">
          <p className="mb-2 text-5xl">🧺</p>
          <p className="font-medium">Pick the dishes you're cooking.</p>
          <p className="text-sm">They'll combine into one tickable shopping list.</p>
        </div>
      ) : (
        <>
          <label className="mb-2 flex items-center gap-2 text-xs text-stone-500">
            <input type="checkbox" checked={session.includeOptional} onChange={(e) => setSession((s) => ({ ...s, includeOptional: e.target.checked }))} className="h-4 w-4 accent-brand-600" />
            include optional extras (veg / to serve / upgrades)
          </label>

          {!book && <p className="text-sm text-stone-500">Loading prices…</p>}
          {selectedRecipes.length < selectedCount && <p className="text-sm text-stone-500">Loading recipes…</p>}

          <ul className="divide-y divide-orange-50 rounded-2xl border border-orange-100 bg-white">
            {rows.map(({ m, line, done }) => (
              <li key={m.key} className="flex items-start gap-3 p-3">
                <input type="checkbox" checked={done} onChange={() => toggleCheck(m.key)} className="mt-0.5 h-5 w-5 flex-none accent-green-600" />
                <div className={`min-w-0 flex-1 ${done ? "text-stone-400 line-through" : ""}`}>
                  <p className="text-sm font-medium">
                    {line.unknown ? m.item.name : line.product}
                    {line.buyQuantity > 1 && <span className="text-stone-500"> ×{line.buyQuantity}</span>}
                    {m.item.optional && <span className="ml-1 text-[10px] uppercase text-stone-400">optional</span>}
                  </p>
                  <p className="truncate text-[11px] text-stone-400">
                    for {m.dishes.join(", ")}
                    {" · "}
                    <a href={trolleySearchUrl(m.item.name)} target="_blank" rel="noreferrer" className="text-brand-600 underline">check ↗</a>
                  </p>
                </div>
                {!line.unknown ? <span className={`whitespace-nowrap text-sm font-medium ${done ? "text-stone-400 line-through" : ""}`}>{formatAUD(line.lineCost)}</span>
                  : <span className="text-[10px] uppercase text-amber-600">price n/a</span>}
              </li>
            ))}
          </ul>

          <div className="sticky bottom-16 mt-3 space-y-2 bg-orange-50/95 py-2 backdrop-blur">
            <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
              <span><b>{totals.left}</b> left · {rows.length} items</span>
              <span>Left: <b className="text-green-700">{formatAUD(totals.remaining)}</b> / {formatAUD(totals.all)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setChecked({})} className="flex-1 rounded-xl border border-stone-300 py-2.5 text-sm font-semibold text-stone-600">Untick all</button>
              <button onClick={clearAll} className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600">Clear list</button>
            </div>
            <p className="text-center text-[10px] text-stone-400">
              {STORE_LABELS[session.store]} estimated prices — whole packs. Your ticks are saved on this device.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
