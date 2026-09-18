import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRecipe, saveRecipe, deleteRecipe, type Recipe } from "../lib/recipes";
import { assetUrl } from "../lib/assets";
import { loadSettings, hasClaudeConfig, hasGithubConfig } from "../lib/settings";
import { generateDishImage } from "../lib/dishImage";
import { extractRecipes, generateSpiceBlend, type ImagePart } from "../shared/claude";
import { blobToBase64 } from "../lib/base64";
import { loadPriceBook, stapleKeysOf } from "../lib/priceBook";
import { buildShoppingList, costByStore as computeCostByStore, formatAUD, type PriceBook } from "../shared/prices";
import { STORES, STORE_LABELS, type Store } from "../shared/schema";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-bold text-brand-700">{title}</h2>
      {children}
    </section>
  );
}

export default function RecipePage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const settings = useMemo(() => loadSettings(), []);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [book, setBook] = useState<PriceBook | null>(null);
  const [store, setStore] = useState<Store>(settings.preferredStore);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getRecipe(slug, settings).then(setRecipe).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
    loadPriceBook().then(setBook).catch(() => setBook(null));
  }, [slug, settings]);

  const canWrite = hasGithubConfig(settings);
  const canClaude = hasClaudeConfig(settings);

  const shopping = useMemo(() => {
    if (!recipe || !book) return null;
    return buildShoppingList(recipe.shoppingList, book, store, { includeOptional });
  }, [recipe, book, store, includeOptional]);

  async function fetchImageParts(r: Recipe): Promise<ImagePart[]> {
    const parts: ImagePart[] = [];
    for (const path of r.images) {
      const res = await fetch(assetUrl(path));
      if (!res.ok) continue;
      parts.push({ mediaType: "image/jpeg", base64: await blobToBase64(await res.blob()) });
    }
    return parts;
  }

  async function regenerateImage() {
    if (!recipe) return;
    setBusy("Regenerating dish image…"); setError("");
    try {
      const dish = generateDishImage(recipe);
      const path = `recipes/images/${recipe.slug}-dish.svg`;
      const saved = await saveRecipe(settings, { ...recipe, dishImage: path, dishImageFromPhoto: false }, [{ path, blob: dish.blob }]);
      setRecipe(saved);
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  async function rerunExtraction() {
    if (!recipe) return;
    setBusy("Re-reading the recipe…"); setError("");
    try {
      const parts = await fetchImageParts(recipe);
      if (!parts.length) throw new Error("No source photos available to re-read.");
      const keys = book ? stapleKeysOf(book) : [];
      const list = await extractRecipes({ apiKey: settings.anthropicApiKey, model: settings.model }, parts, keys);
      const ex = list[0];
      if (!ex) throw new Error("No recipe detected in the photos.");
      let spiceBlend = recipe.spiceBlend;
      if (ex.sachetIngredients.length) {
        try {
          spiceBlend = await generateSpiceBlend(
            { apiKey: settings.anthropicApiKey, model: settings.model },
            { dishName: ex.dishName, cuisine: ex.cuisine, serves: ex.serves, sachetIngredients: ex.sachetIngredients },
          );
        } catch { /* keep */ }
      }
      const merged: Recipe = {
        ...recipe, ...ex, spiceBlend,
        costByStore: book ? computeCostByStore(ex.shoppingList, book) : recipe.costByStore,
        needsReview: ex.confidence.length > 0,
      };
      setRecipe(await saveRecipe(settings, merged));
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  async function doDelete() {
    if (!recipe) return;
    setBusy("Deleting…");
    try { await deleteRecipe(settings, recipe.slug); navigate("/"); }
    catch (e) { setError((e as Error).message); setBusy(""); }
  }

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!recipe)
    return (
      <div className="text-center text-stone-500">
        <p className="mb-2">Recipe not found.</p>
        <Link to="/" className="text-brand-600 underline">Back to recipes</Link>
      </div>
    );

  const cost = recipe.costByStore?.[store] ?? 0;

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border border-orange-100 bg-white">
        {recipe.dishImage && (
          <img src={assetUrl(recipe.dishImage)} alt={recipe.dishName} className="aspect-square w-full object-cover" />
        )}
        <div className="p-3">
          <h1 className="text-xl font-extrabold leading-tight">{recipe.dishName}</h1>
          <p className="text-sm text-stone-500">{[recipe.brand, recipe.product, recipe.cuisine].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {recipe.dishType && <span className="rounded-full bg-brand-100 px-2 py-1 font-medium text-brand-700">{recipe.dishType}</span>}
            {recipe.serves && <span className="rounded-full bg-orange-100 px-2 py-1">Serves {recipe.serves}</span>}
            {recipe.prepTime && <span className="rounded-full bg-orange-100 px-2 py-1">Prep {recipe.prepTime}</span>}
            {recipe.cookTime && <span className="rounded-full bg-orange-100 px-2 py-1">Cook {recipe.cookTime}</span>}
            {recipe.dietary.map((d) => <span key={d} className="rounded-full bg-green-100 px-2 py-1 text-green-700">{d}</span>)}
            {recipe.allergens.map((a) => <span key={a} className="rounded-full bg-red-50 px-2 py-1 text-red-700">contains {a}</span>)}
          </div>
          {recipe.needsReview && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">⚠️ Some fields were cut off or unreadable — check and edit.</p>
          )}
        </div>
      </div>

      {busy && <p className="mb-3 rounded-lg bg-blue-50 p-2 text-sm text-blue-700">{busy}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {/* Cost + shopping list */}
      <Section title="Cost & shopping list">
        <div className="rounded-2xl border border-orange-100 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <select value={store} onChange={(e) => setStore(e.target.value as Store)} className="flex-1 rounded-lg border border-orange-200 px-3 py-2 text-sm">
              {STORES.map((s) => <option key={s} value={s}>{STORE_LABELS[s]}</option>)}
            </select>
            {cost > 0 && (
              <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">~{formatAUD(cost)} to make</span>
            )}
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs text-stone-500">
            <input type="checkbox" checked={includeOptional} onChange={(e) => setIncludeOptional(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            include optional extras (veg / to serve / upgrades)
          </label>
          {!book && <p className="text-sm text-stone-500">Price list unavailable.</p>}
          {shopping && shopping.lines.length === 0 && <p className="text-sm text-stone-500">No shopping items recorded for this recipe.</p>}
          {shopping && shopping.lines.length > 0 && (
            <>
              <ul className="divide-y divide-orange-50">
                {shopping.lines.map((l, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-1.5 text-sm">
                    <span className={l.optional ? "text-stone-500" : ""}>
                      {l.unknown ? (
                        <span>{l.name} <span className="text-[10px] uppercase text-amber-600">price n/a</span></span>
                      ) : (
                        <>
                          {l.product}
                          {l.buyQuantity > 1 && <span className="text-stone-500"> ×{l.buyQuantity}</span>}
                          {l.optional && <span className="ml-1 text-[10px] uppercase text-stone-400">optional</span>}
                        </>
                      )}
                    </span>
                    {!l.unknown && <span className="whitespace-nowrap font-medium">{formatAUD(l.lineCost)}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-orange-100 pt-2 text-sm font-bold">
                <span>Estimated shop total</span>
                <span className="text-green-700">{formatAUD(shopping.total)}</span>
              </div>
              <p className="mt-1 text-[10px] text-stone-400">
                Whole packs at {STORE_LABELS[store]} estimated prices. A guide only — check in store.
              </p>
            </>
          )}
        </div>
      </Section>

      {recipe.confidence.length > 0 && (
        <Section title="Check these">
          <ul className="space-y-1 text-sm text-amber-800">
            {recipe.confidence.map((c, i) => <li key={i}>• <b>{c.field}:</b> {c.note}</li>)}
          </ul>
        </Section>
      )}

      {recipe.ingredientGroups.length > 0 && (
        <Section title="Ingredients">
          {recipe.ingredientGroups.map((g, gi) => (
            <div key={gi} className="mb-3">
              <h3 className="text-sm font-semibold text-stone-700">{g.title}</h3>
              <ul className="mt-1 space-y-1">
                {g.items.map((it, ii) => (
                  <li key={ii} className="flex gap-2 text-sm">
                    <span className="text-brand-500">•</span>
                    <span>{it.quantity && <b>{it.quantity} </b>}{it.name}{it.note && <span className="text-stone-500"> ({it.note})</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {recipe.method.length > 0 && (
        <Section title="Method">
          <ol className="space-y-2">
            {recipe.method.map((m, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                <span className={m.source === "reconstructed" ? "rounded bg-violet-50 px-1 italic text-violet-800" : ""}>
                  {m.text}
                  {m.source === "reconstructed" && <span className="ml-1 text-[10px] font-medium uppercase text-violet-500">reconstructed</span>}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {recipe.spiceBlend && recipe.spiceBlend.items.length > 0 && (
        <Section title="Make it without the sachet">
          <p className="mb-2 text-xs italic text-stone-500">{recipe.spiceBlend.note || "Homemade blend — an estimate based on the sachet ingredients."}</p>
          <ul className="space-y-1">
            {recipe.spiceBlend.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-brand-500">•</span><span>{it.quantity && <b>{it.quantity} </b>}{it.name}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] font-medium uppercase text-amber-600">Estimate</p>
        </Section>
      )}

      {recipe.nutrition.length > 0 && (
        <Section title="Nutrition">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-stone-500"><th className="py-1">Per</th><th className="py-1">Serve</th><th className="py-1">100g</th></tr></thead>
            <tbody>
              {recipe.nutrition.map((n, i) => (
                <tr key={i} className="border-t border-orange-50"><td className="py-1 font-medium">{n.label}</td><td className="py-1">{n.perServe}</td><td className="py-1">{n.per100g}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {recipe.sachetIngredients.length > 0 && (
        <Section title="Sachet ingredients"><p className="text-sm text-stone-600">{recipe.sachetIngredients.join(", ")}</p></Section>
      )}

      {recipe.images.length > 0 && (
        <Section title="Original photos">
          <div className="grid grid-cols-3 gap-2">
            {recipe.images.map((p, i) => (
              <a key={i} href={assetUrl(p)} target="_blank" rel="noreferrer">
                <img src={assetUrl(p)} alt={`Source ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-6 space-y-2">
        <div className="flex gap-2">
          <Link to={`/recipe/${recipe.slug}/edit`} className="flex-1 rounded-xl bg-brand-600 py-3 text-center font-semibold text-white">Edit</Link>
          <button onClick={regenerateImage} disabled={!canWrite || !!busy} className="flex-1 rounded-xl border border-brand-300 py-3 font-semibold text-brand-700 disabled:opacity-40">Emoji image</button>
        </div>
        <button onClick={rerunExtraction} disabled={!canWrite || !canClaude || !!busy} className="w-full rounded-xl border border-stone-300 py-3 font-semibold text-stone-700 disabled:opacity-40">Re-run extraction from photos</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} disabled={!canWrite || !!busy} className="w-full rounded-xl py-3 font-semibold text-red-600 disabled:opacity-40">Delete recipe</button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-800">Delete “{recipe.dishName}” for good? This commits a deletion to the repo.</p>
            <div className="flex gap-2">
              <button onClick={doDelete} className="flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white">Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-stone-300 py-2 font-semibold">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
