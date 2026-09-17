import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRecipe, saveRecipe, deleteRecipe, type Recipe } from "../lib/recipes";
import { assetUrl } from "../lib/assets";
import { loadSettings, hasClaudeConfig, hasGithubConfig } from "../lib/settings";
import { generateDishImage } from "../lib/dishImage";
import { extractRecipe, generateSpiceBlend, type ImagePart } from "../shared/claude";
import { blobToBase64 } from "../lib/base64";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getRecipe(slug, settings)
      .then((r) => setRecipe(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [slug, settings]);

  const canWrite = hasGithubConfig(settings);
  const canClaude = hasClaudeConfig(settings);

  async function fetchImageParts(r: Recipe): Promise<ImagePart[]> {
    const parts: ImagePart[] = [];
    for (const path of r.images) {
      const res = await fetch(assetUrl(path));
      if (!res.ok) continue;
      const blob = await res.blob();
      parts.push({ mediaType: "image/jpeg", base64: await blobToBase64(blob) });
    }
    return parts;
  }

  async function regenerateImage() {
    if (!recipe) return;
    setBusy("Regenerating dish image…");
    setError("");
    try {
      const dish = generateDishImage(recipe);
      const saved = await saveRecipe(settings, recipe, [
        { path: recipe.dishImage || `recipes/images/${recipe.slug}-dish.svg`, blob: dish.blob },
      ]);
      setRecipe({ ...saved, dishImage: `${saved.dishImage}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function rerunExtraction() {
    if (!recipe) return;
    setBusy("Re-reading the packet…");
    setError("");
    try {
      const parts = await fetchImageParts(recipe);
      if (!parts.length) throw new Error("No source photos available to re-read.");
      const ex = await extractRecipe(
        { apiKey: settings.anthropicApiKey, model: settings.model },
        parts,
      );
      let spiceBlend = recipe.spiceBlend;
      try {
        spiceBlend = await generateSpiceBlend(
          { apiKey: settings.anthropicApiKey, model: settings.model },
          { dishName: ex.dishName, cuisine: ex.cuisine, serves: ex.serves, sachetIngredients: ex.sachetIngredients },
        );
      } catch {
        /* keep existing */
      }
      const merged: Recipe = {
        ...recipe,
        ...ex,
        spiceBlend,
        needsReview: ex.confidence.length > 0,
      };
      const saved = await saveRecipe(settings, merged);
      setRecipe(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function doDelete() {
    if (!recipe) return;
    setBusy("Deleting…");
    try {
      await deleteRecipe(settings, recipe.slug);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!recipe)
    return (
      <div className="text-center text-stone-500">
        <p className="mb-2">Recipe not found.</p>
        <Link to="/" className="text-brand-600 underline">Back to recipes</Link>
      </div>
    );

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border border-orange-100 bg-white">
        {recipe.dishImage && (
          <img src={assetUrl(recipe.dishImage)} alt={recipe.dishName} className="aspect-square w-full object-cover" />
        )}
        <div className="p-3">
          <h1 className="text-xl font-extrabold leading-tight">{recipe.dishName}</h1>
          <p className="text-sm text-stone-500">
            {[recipe.brand, recipe.product, recipe.cuisine].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-600">
            {recipe.serves && <span className="rounded-full bg-orange-100 px-2 py-1">Serves {recipe.serves}</span>}
            {recipe.prepTime && <span className="rounded-full bg-orange-100 px-2 py-1">Prep {recipe.prepTime}</span>}
            {recipe.cookTime && <span className="rounded-full bg-orange-100 px-2 py-1">Cook {recipe.cookTime}</span>}
          </div>
          {recipe.needsReview && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              ⚠️ Some fields were cut off or unreadable — check and edit.
            </p>
          )}
        </div>
      </div>

      {busy && <p className="mb-3 rounded-lg bg-blue-50 p-2 text-sm text-blue-700">{busy}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {recipe.confidence.length > 0 && (
        <Section title="Check these">
          <ul className="space-y-1 text-sm text-amber-800">
            {recipe.confidence.map((c, i) => (
              <li key={i}>• <b>{c.field}:</b> {c.note}</li>
            ))}
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
                    <span>
                      {it.quantity && <b>{it.quantity} </b>}
                      {it.name}
                      {it.note && <span className="text-stone-500"> ({it.note})</span>}
                    </span>
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
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span
                  className={
                    m.source === "reconstructed"
                      ? "rounded bg-violet-50 px-1 italic text-violet-800"
                      : ""
                  }
                >
                  {m.text}
                  {m.source === "reconstructed" && (
                    <span className="ml-1 text-[10px] font-medium uppercase text-violet-500">reconstructed</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {recipe.spiceBlend && recipe.spiceBlend.items.length > 0 && (
        <Section title="Make it without the sachet">
          <p className="mb-2 text-xs italic text-stone-500">
            {recipe.spiceBlend.note || "Homemade blend — an estimate based on the sachet ingredients."}
          </p>
          <ul className="space-y-1">
            {recipe.spiceBlend.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-brand-500">•</span>
                <span>{it.quantity && <b>{it.quantity} </b>}{it.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] font-medium uppercase text-amber-600">Estimate</p>
        </Section>
      )}

      {recipe.nutrition.length > 0 && (
        <Section title="Nutrition">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-1">Per</th>
                <th className="py-1">Serve</th>
                <th className="py-1">100g</th>
              </tr>
            </thead>
            <tbody>
              {recipe.nutrition.map((n, i) => (
                <tr key={i} className="border-t border-orange-50">
                  <td className="py-1 font-medium">{n.label}</td>
                  <td className="py-1">{n.perServe}</td>
                  <td className="py-1">{n.per100g}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {recipe.sachetIngredients.length > 0 && (
        <Section title="Sachet ingredients">
          <p className="text-sm text-stone-600">{recipe.sachetIngredients.join(", ")}</p>
        </Section>
      )}

      {recipe.images.length > 0 && (
        <Section title="Original photos">
          <div className="grid grid-cols-3 gap-2">
            {recipe.images.map((p, i) => (
              <a key={i} href={assetUrl(p)} target="_blank" rel="noreferrer">
                <img src={assetUrl(p)} alt={`Packet photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Actions */}
      <div className="mt-6 space-y-2">
        <div className="flex gap-2">
          <Link
            to={`/recipe/${recipe.slug}/edit`}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-center font-semibold text-white"
          >
            Edit
          </Link>
          <button
            onClick={regenerateImage}
            disabled={!canWrite || !!busy}
            className="flex-1 rounded-xl border border-brand-300 py-3 font-semibold text-brand-700 disabled:opacity-40"
          >
            New image
          </button>
        </div>
        <button
          onClick={rerunExtraction}
          disabled={!canWrite || !canClaude || !!busy}
          className="w-full rounded-xl border border-stone-300 py-3 font-semibold text-stone-700 disabled:opacity-40"
        >
          Re-run extraction from photos
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={!canWrite || !!busy}
            className="w-full rounded-xl py-3 font-semibold text-red-600 disabled:opacity-40"
          >
            Delete recipe
          </button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-800">Delete “{recipe.dishName}” for good? This commits a deletion to the repo.</p>
            <div className="flex gap-2">
              <button onClick={doDelete} className="flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white">
                Yes, delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-stone-300 py-2 font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
