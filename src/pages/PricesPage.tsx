import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadSettings, hasGithubConfig } from "../lib/settings";
import * as gh from "../lib/github";
import { loadPriceBook } from "../lib/priceBook";
import { recomputeAllCosts } from "../lib/recipes";
import { STORES, STORE_LABELS } from "../shared/schema";
import { trolleySearchUrl } from "../shared/util";
import type { PriceBook } from "../shared/prices";

const PATH = "recipes/prices.json";

export default function PricesPage() {
  const settings = useMemo(() => loadSettings(), []);
  const [book, setBook] = useState<PriceBook | null>(null);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState("");
  const [error, setError] = useState("");

  const canWrite = hasGithubConfig(settings);

  useEffect(() => {
    (async () => {
      try {
        if (canWrite) {
          const f = await gh.getFile(settings, PATH);
          if (f) {
            setBook(JSON.parse(f.content));
            return;
          }
        }
        setBook(await loadPriceBook());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [settings, canWrite]);

  const items = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(book.items)
      .filter(([, it]) => !q || it.name.toLowerCase().includes(q))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [book, query]);

  function setPrice(key: string, store: string, value: string) {
    if (!book) return;
    const price = value.trim() === "" ? null : Number(value);
    const next: PriceBook = { ...book, items: { ...book.items } };
    const item = { ...next.items[key], stores: { ...next.items[key].stores } };
    item.stores[store as keyof typeof item.stores] = {
      ...item.stores[store as keyof typeof item.stores],
      price: price != null && Number.isFinite(price) ? price : null,
    };
    next.items[key] = item;
    setBook(next);
    setMsg("");
  }

  async function save() {
    if (!book) return;
    if (!canWrite) { setError("Add your GitHub token in Settings first."); return; }
    setSaving(true); setError(""); setMsg("");
    try {
      const toSave: PriceBook = { ...book, updatedAt: new Date().toISOString().slice(0, 10) };
      await gh.putTextFile(settings, PATH, JSON.stringify(toSave, null, 2), "Update price list");
      setBook(toSave);
      setMsg("Prices saved. Tip: run “Recompute recipe costs” so the grid/cards reflect the new prices.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    if (!book) return;
    setRecomputing("Starting…"); setError("");
    try {
      const n = await recomputeAllCosts(settings, book, (slug, i, total) => setRecomputing(`${i}/${total} — ${slug}`));
      setRecomputing("");
      setMsg(`Recomputed costs for ${n} recipes.`);
    } catch (e) {
      setError((e as Error).message);
      setRecomputing("");
    }
  }

  if (error && !book) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!book) return <p className="text-stone-500">Loading prices…</p>;

  return (
    <div className="pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold">Prices</h1>
        <Link to="/settings" className="text-sm text-stone-500">Settings</Link>
      </div>
      <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Estimated per‑store prices used for cost & shopping lists. Update them from{" "}
        <a href="https://trolleychecker.com.au/" target="_blank" rel="noreferrer" className="font-medium underline">Trolley Checker</a>{" "}
        and Save. Last updated: <b>{book.updatedAt}</b>.
      </p>

      {!canWrite && (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Read‑only — add your GitHub token in <Link to="/settings" className="underline">Settings</Link> to save changes.
        </p>
      )}
      {msg && <p className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter ingredients…"
        className="mb-3 w-full rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-base outline-none focus:border-brand-500"
      />

      <div className="mb-3 grid grid-cols-[1.6fr_repeat(4,1fr)] gap-1 text-[10px] font-semibold uppercase text-stone-500">
        <span>Item</span>
        {STORES.map((s) => <span key={s} className="text-center">{STORE_LABELS[s]}</span>)}
      </div>

      <div className="space-y-1">
        {items.map(([key, it]) => (
          <div key={key} className="grid grid-cols-[1.6fr_repeat(4,1fr)] items-center gap-1">
            <div className="min-w-0 pr-1">
              <a href={trolleySearchUrl(it.name)} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-brand-700 underline">
                {it.name}
              </a>
              <span className="text-[10px] text-stone-400">{it.pack}{it.unit === "each" ? " ea" : it.unit}</span>
            </div>
            {STORES.map((s) => (
              <input
                key={s}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={it.stores[s].price ?? ""}
                onChange={(e) => setPrice(key, s, e.target.value)}
                className="w-full rounded-md border border-orange-200 px-1.5 py-1.5 text-center text-xs outline-none focus:border-brand-500"
                placeholder="—"
              />
            ))}
          </div>
        ))}
      </div>

      <div className="sticky bottom-16 mt-4 space-y-2 bg-orange-50/95 py-2 backdrop-blur">
        <button onClick={save} disabled={saving || !canWrite} className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save prices"}
        </button>
        <button onClick={recompute} disabled={!!recomputing || !canWrite} className="w-full rounded-xl border border-brand-300 py-2.5 font-semibold text-brand-700 disabled:opacity-50">
          {recomputing ? `Recomputing ${recomputing}` : "Recompute recipe costs"}
        </button>
        <p className="text-[10px] text-stone-400">Recompute updates every recipe's cost (one commit each) so cards & sorting use the new prices.</p>
      </div>
    </div>
  );
}
