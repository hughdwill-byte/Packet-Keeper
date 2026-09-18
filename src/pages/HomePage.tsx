import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadIndex, searchIndex, type RecipeIndex } from "../lib/recipes";
import { assetUrl } from "../lib/assets";
import { loadSettings } from "../lib/settings";
import { STORES, STORE_LABELS, type Store } from "../shared/schema";
import { formatAUD } from "../shared/prices";

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-brand-500 bg-brand-600 text-white" : "border-orange-200 bg-white text-stone-600"
      }`}
    >
      {label}
    </button>
  );
}

export default function HomePage() {
  const settings = useMemo(() => loadSettings(), []);
  const [index, setIndex] = useState<RecipeIndex | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [store, setStore] = useState<Store>(settings.preferredStore);
  const [sort, setSort] = useState<"name" | "cost">("name");
  const [showFilters, setShowFilters] = useState(false);

  const [dishTypes, setDishTypes] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [diets, setDiets] = useState<string[]>([]);
  const [excludeAllergens, setExcludeAllergens] = useState<string[]>([]);

  useEffect(() => {
    loadIndex().then(setIndex).catch((e) => setError((e as Error).message));
  }, []);

  const facets = useMemo(() => {
    const src = index ?? [];
    return {
      dishTypes: uniqSorted(src.map((e) => e.dishType)),
      cuisines: uniqSorted(src.map((e) => e.cuisine)),
      diets: uniqSorted(src.flatMap((e) => e.dietary)),
      allergens: uniqSorted(src.flatMap((e) => e.allergens)),
    };
  }, [index]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const results = useMemo(() => {
    if (!index) return [];
    let out = searchIndex(index, query);
    if (dishTypes.length) out = out.filter((e) => dishTypes.includes(e.dishType));
    if (cuisines.length) out = out.filter((e) => cuisines.includes(e.cuisine));
    if (diets.length) out = out.filter((e) => diets.every((d) => e.dietary.includes(d)));
    if (excludeAllergens.length)
      out = out.filter((e) => !excludeAllergens.some((a) => e.allergens.includes(a)));
    const cost = (e: (typeof out)[number]) => e.costByStore?.[store] ?? 0;
    out = [...out].sort((a, b) =>
      sort === "cost" ? (cost(a) || 1e9) - (cost(b) || 1e9) : a.dishName.localeCompare(b.dishName),
    );
    return out;
  }, [index, query, dishTypes, cuisines, diets, excludeAllergens, sort, store]);

  const activeFilterCount = dishTypes.length + cuisines.length + diets.length + excludeAllergens.length;

  return (
    <div>
      <div className="mb-3 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ingredient…"
          className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
        />
        <div className="flex gap-2">
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as Store)}
            className="flex-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm"
            aria-label="Store for prices"
          >
            {STORES.map((s) => (
              <option key={s} value={s}>{STORE_LABELS[s]} prices</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "name" | "cost")}
            className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm"
            aria-label="Sort"
          >
            <option value="name">A–Z</option>
            <option value="cost">Cheapest</option>
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${
              activeFilterCount ? "border-brand-500 text-brand-700" : "border-orange-200 text-stone-600"
            }`}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 space-y-3 rounded-2xl border border-orange-100 bg-white p-3">
          {facets.dishTypes.length > 0 && (
            <FacetRow title="Dish type" values={facets.dishTypes} active={dishTypes} onToggle={(v) => toggle(dishTypes, setDishTypes, v)} />
          )}
          {facets.cuisines.length > 0 && (
            <FacetRow title="Cuisine" values={facets.cuisines} active={cuisines} onToggle={(v) => toggle(cuisines, setCuisines, v)} />
          )}
          {facets.diets.length > 0 && (
            <FacetRow title="Diet" values={facets.diets} active={diets} onToggle={(v) => toggle(diets, setDiets, v)} />
          )}
          {facets.allergens.length > 0 && (
            <FacetRow title="Exclude allergens" values={facets.allergens} active={excludeAllergens} onToggle={(v) => toggle(excludeAllergens, setExcludeAllergens, v)} />
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setDishTypes([]); setCuisines([]); setDiets([]); setExcludeAllergens([]); }}
              className="text-sm font-medium text-brand-600"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {index === null && <p className="text-stone-500">Loading recipes…</p>}

      {index !== null && index.length === 0 && (
        <div className="mt-10 text-center text-stone-500">
          <p className="mb-2 text-5xl">📷</p>
          <p className="font-medium">No recipes yet.</p>
          <p className="text-sm">Tap <span className="font-bold text-brand-600">+</span> to add a packet, photo, or PDF.</p>
          <p className="mt-4 text-sm"><Link to="/settings" className="font-medium text-brand-600 underline">Add your keys in Settings</Link>.</p>
        </div>
      )}

      {index !== null && index.length > 0 && results.length === 0 && (
        <p className="text-stone-500">No matches.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {results.map((r) => {
          const cost = r.costByStore?.[store] ?? 0;
          return (
            <Link
              key={r.slug}
              to={`/recipe/${r.slug}`}
              className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm active:scale-[0.98]"
            >
              <div className="aspect-square w-full bg-orange-100">
                {r.dishImage ? (
                  <img src={assetUrl(r.dishImage)} alt={r.dishName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl">🍽️</div>
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-sm font-semibold leading-tight">{r.dishName}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-stone-500">{r.dishType || r.cuisine || ""}</span>
                  {cost > 0 && <span className="text-xs font-bold text-green-700">~{formatAUD(cost)}</span>}
                </div>
                {r.needsReview && (
                  <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">needs review</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {results.length > 0 && (
        <p className="mt-4 text-center text-[11px] text-stone-400">
          Costs are rough estimates using {STORE_LABELS[store]} price guide — core ingredients only.
        </p>
      )}
    </div>
  );
}

function FacetRow({ title, values, active, onToggle }: { title: string; values: string[]; active: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-stone-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Chip key={v} label={v} active={active.includes(v)} onClick={() => onToggle(v)} />
        ))}
      </div>
    </div>
  );
}
