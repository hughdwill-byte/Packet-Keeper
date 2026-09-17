import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRecipe, saveRecipe, type Recipe } from "../lib/recipes";
import { loadSettings, hasGithubConfig } from "../lib/settings";
import type { IngredientGroup, MethodStep, NutritionRow } from "../shared/schema";

const input = "w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500";
const label = "mb-1 block text-xs font-semibold uppercase text-stone-500";

export default function EditPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const settings = useMemo(() => loadSettings(), []);
  const [r, setR] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getRecipe(slug, settings).then(setR).finally(() => setLoading(false));
  }, [slug, settings]);

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!r) return <p className="text-stone-500">Recipe not found.</p>;

  const set = (patch: Partial<Recipe>) => setR({ ...r, ...patch });

  async function save() {
    if (!r) return;
    if (!hasGithubConfig(settings)) {
      setError("Add your GitHub token in Settings first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveRecipe(settings, { ...r, needsReview: false });
      navigate(`/recipe/${r.slug}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  // ---- ingredient group helpers ----
  const groups = r.ingredientGroups;
  const setGroups = (g: IngredientGroup[]) => set({ ingredientGroups: g });
  const setMethod = (m: MethodStep[]) => set({ method: m });
  const setNutrition = (n: NutritionRow[]) => set({ nutrition: n });

  return (
    <div className="pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Edit recipe</h1>
        <Link to={`/recipe/${r.slug}`} className="text-sm text-stone-500">Cancel</Link>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        <div>
          <span className={label}>Dish name</span>
          <input className={input} value={r.dishName} onChange={(e) => set({ dishName: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Product</span><input className={input} value={r.product} onChange={(e) => set({ product: e.target.value })} /></div>
          <div><span className={label}>Brand</span><input className={input} value={r.brand} onChange={(e) => set({ brand: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Cuisine</span><input className={input} value={r.cuisine} onChange={(e) => set({ cuisine: e.target.value })} /></div>
          <div><span className={label}>Serves</span><input className={input} value={r.serves} onChange={(e) => set({ serves: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Prep time</span><input className={input} value={r.prepTime} onChange={(e) => set({ prepTime: e.target.value })} /></div>
          <div><span className={label}>Cook time</span><input className={input} value={r.cookTime} onChange={(e) => set({ cookTime: e.target.value })} /></div>
        </div>
      </div>

      {/* Ingredient groups */}
      <h2 className="mb-2 mt-6 text-lg font-bold text-brand-700">Ingredients</h2>
      {groups.map((g, gi) => (
        <div key={gi} className="mb-3 rounded-xl border border-orange-100 bg-white p-3">
          <div className="mb-2 flex gap-2">
            <input
              className={input}
              value={g.title}
              placeholder="Group heading"
              onChange={(e) => {
                const next = [...groups];
                next[gi] = { ...g, title: e.target.value };
                setGroups(next);
              }}
            />
            <button className="px-2 text-red-500" onClick={() => setGroups(groups.filter((_, i) => i !== gi))}>✕</button>
          </div>
          {g.items.map((it, ii) => (
            <div key={ii} className="mb-2 flex gap-2">
              <input
                className={`${input} w-20`}
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => {
                  const next = [...groups];
                  const items = [...g.items];
                  items[ii] = { ...it, quantity: e.target.value };
                  next[gi] = { ...g, items };
                  setGroups(next);
                }}
              />
              <input
                className={input}
                placeholder="Ingredient"
                value={it.name}
                onChange={(e) => {
                  const next = [...groups];
                  const items = [...g.items];
                  items[ii] = { ...it, name: e.target.value };
                  next[gi] = { ...g, items };
                  setGroups(next);
                }}
              />
              <button
                className="px-2 text-red-400"
                onClick={() => {
                  const next = [...groups];
                  next[gi] = { ...g, items: g.items.filter((_, i) => i !== ii) };
                  setGroups(next);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="text-sm font-medium text-brand-600"
            onClick={() => {
              const next = [...groups];
              next[gi] = { ...g, items: [...g.items, { name: "", quantity: "", note: "" }] };
              setGroups(next);
            }}
          >
            + Add ingredient
          </button>
        </div>
      ))}
      <button
        className="mb-2 text-sm font-medium text-brand-600"
        onClick={() => setGroups([...groups, { title: "New group", items: [] }])}
      >
        + Add group
      </button>

      {/* Method */}
      <h2 className="mb-2 mt-6 text-lg font-bold text-brand-700">Method</h2>
      {r.method.map((m, i) => (
        <div key={i} className="mb-2 rounded-xl border border-orange-100 bg-white p-2">
          <textarea
            className={`${input} min-h-16`}
            value={m.text}
            onChange={(e) => {
              const next = [...r.method];
              next[i] = { ...m, text: e.target.value };
              setMethod(next);
            }}
          />
          <div className="mt-1 flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs text-stone-500">
              <input
                type="checkbox"
                checked={m.source === "reconstructed"}
                onChange={(e) => {
                  const next = [...r.method];
                  next[i] = { ...m, source: e.target.checked ? "reconstructed" : "packet" };
                  setMethod(next);
                }}
              />
              reconstructed
            </label>
            <button className="text-xs text-red-400" onClick={() => setMethod(r.method.filter((_, x) => x !== i))}>
              remove
            </button>
          </div>
        </div>
      ))}
      <button
        className="mb-2 text-sm font-medium text-brand-600"
        onClick={() => setMethod([...r.method, { text: "", source: "packet" }])}
      >
        + Add step
      </button>

      {/* Nutrition */}
      <h2 className="mb-2 mt-6 text-lg font-bold text-brand-700">Nutrition</h2>
      {r.nutrition.map((n, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <input className={input} placeholder="Label" value={n.label} onChange={(e) => { const x = [...r.nutrition]; x[i] = { ...n, label: e.target.value }; setNutrition(x); }} />
          <input className={`${input} w-24`} placeholder="/serve" value={n.perServe} onChange={(e) => { const x = [...r.nutrition]; x[i] = { ...n, perServe: e.target.value }; setNutrition(x); }} />
          <input className={`${input} w-24`} placeholder="/100g" value={n.per100g} onChange={(e) => { const x = [...r.nutrition]; x[i] = { ...n, per100g: e.target.value }; setNutrition(x); }} />
          <button className="px-2 text-red-400" onClick={() => setNutrition(r.nutrition.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}
      <button className="mb-2 text-sm font-medium text-brand-600" onClick={() => setNutrition([...r.nutrition, { label: "", perServe: "", per100g: "" }])}>
        + Add row
      </button>

      {/* Sachet ingredients */}
      <h2 className="mb-2 mt-6 text-lg font-bold text-brand-700">Sachet ingredients</h2>
      <textarea
        className={`${input} min-h-16`}
        placeholder="Comma-separated"
        value={r.sachetIngredients.join(", ")}
        onChange={(e) => set({ sachetIngredients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
      />

      <button
        onClick={save}
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
