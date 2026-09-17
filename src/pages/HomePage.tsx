import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadIndex, searchIndex, type RecipeIndex } from "../lib/recipes";
import { assetUrl } from "../lib/assets";

export default function HomePage() {
  const [index, setIndex] = useState<RecipeIndex | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e) => setError((e as Error).message));
  }, []);

  const results = useMemo(
    () => (index ? searchIndex(index, query) : []),
    [index, query],
  );

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ingredient…"
          className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {index === null && <p className="text-stone-500">Loading recipes…</p>}

      {index !== null && index.length === 0 && (
        <div className="mt-10 text-center text-stone-500">
          <p className="mb-2 text-5xl">📷</p>
          <p className="font-medium">No recipes yet.</p>
          <p className="text-sm">
            Tap <span className="font-bold text-brand-600">+</span> to photograph a packet.
          </p>
          <p className="mt-4 text-sm">
            First time?{" "}
            <Link to="/settings" className="font-medium text-brand-600 underline">
              Add your keys in Settings
            </Link>
            .
          </p>
        </div>
      )}

      {index !== null && index.length > 0 && results.length === 0 && (
        <p className="text-stone-500">No matches for “{query}”.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {results.map((r) => (
          <Link
            key={r.slug}
            to={`/recipe/${r.slug}`}
            className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm active:scale-[0.98]"
          >
            <div className="aspect-square w-full bg-orange-100">
              {r.dishImage ? (
                <img
                  src={assetUrl(r.dishImage)}
                  alt={r.dishName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl">🍽️</div>
              )}
            </div>
            <div className="p-2">
              <p className="line-clamp-2 text-sm font-semibold leading-tight">{r.dishName}</p>
              {r.product && <p className="truncate text-xs text-stone-500">{r.product}</p>}
              {r.needsReview && (
                <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  needs review
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
