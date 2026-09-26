import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadSettings, hasGithubConfig } from "../lib/settings";
import * as gh from "../lib/github";
import { loadPriceBook } from "../lib/priceBook";
import { recomputeAllCosts } from "../lib/recipes";
import { STORES, STORE_LABELS, type Store } from "../shared/schema";
import { trolleySearchUrl } from "../shared/util";
import type { PriceBook, StorePrice } from "../shared/prices";

const PATH = "recipes/prices.json";

function fmtShort(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function badge(sp: StorePrice): { label: string; cls: string } {
  if (sp.locked) return { label: "🔒 Locked", cls: "bg-stone-200 text-stone-700" };
  if (sp.source === "live") {
    const days = sp.lastChecked ? (Date.now() - new Date(sp.lastChecked).getTime()) / 86400000 : 999;
    const d = fmtShort(sp.lastChecked);
    return days <= 2
      ? { label: `Live · ${d}`, cls: "bg-green-100 text-green-700" }
      : { label: `Stale · ${d}`, cls: "bg-amber-100 text-amber-700" };
  }
  if (sp.source === "manual") return { label: "Manual", cls: "bg-blue-100 text-blue-700" };
  return { label: "Estimate", cls: "bg-stone-100 text-stone-500" };
}

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
          if (f) { setBook(JSON.parse(f.content)); return; }
        }
        setBook(await loadPriceBook());
      } catch (e) { setError((e as Error).message); }
    })();
  }, [settings, canWrite]);

  const items = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(book.items)
      .filter(([, it]) => !q || it.name.toLowerCase().includes(q))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [book, query]);

  function mutate(key: string, store: Store, patch: Partial<StorePrice>) {
    if (!book) return;
    const next: PriceBook = { ...book, items: { ...book.items } };
    const item = { ...next.items[key], stores: { ...next.items[key].stores } };
    item.stores[store] = { ...item.stores[store], ...patch };
    next.items[key] = item;
    setBook(next);
    setMsg("");
  }

  async function save() {
    if (!book) return;
    if (!canWrite) { setError("Add your GitHub token in Settings first."); return; }
    setSaving(true); setError(""); setMsg("");
    try {
      await gh.putTextFile(settings, PATH, JSON.stringify(book, null, 2), "Update price list");
      setMsg("Prices saved. Run “Recompute recipe costs” so cards & sorting update.");
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function recompute() {
    if (!book) return;
    setRecomputing("Starting…"); setError("");
    try {
      const n = await recomputeAllCosts(settings, book, (slug, i, total) => setRecomputing(`${i}/${total} — ${slug}`));
      setRecomputing("");
      setMsg(`Recomputed costs for ${n} recipes.`);
    } catch (e) { setError((e as Error).message); setRecomputing(""); }
  }

  if (error && !book) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!book) return <p className="text-stone-500">Loading prices…</p>;

  const anyLive = STORES.some((s) => book.storeStatus?.[s]?.ok);

  return (
    <div className="pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold">Prices</h1>
        <Link to="/settings" className="text-sm text-stone-500">Settings</Link>
      </div>

      <div className="mb-3 rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
        {anyLive ? "Updated daily from live supermarket data where reachable." : "Estimated prices (daily live updater configured)."}{" "}
        Last run <b>{fmtShort(book.updatedAt) || "—"}</b>.
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {STORES.map((s) => {
            const st = book.storeStatus?.[s];
            return (
              <span key={s}>
                {STORE_LABELS[s]}: {st?.ok ? <span className="text-green-700">live</span> : <span className="text-amber-700">est.{st?.lastSuccess ? ` (last ${fmtShort(st.lastSuccess)})` : ""}</span>}
              </span>
            );
          })}
        </div>
        <p className="mt-1">Lock 🔒 a price to protect a manual edit from the daily update. Tap a name to check it on Trolley Checker.</p>
      </div>

      {!canWrite && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Read‑only — add your GitHub token in <Link to="/settings" className="underline">Settings</Link> to save.</p>}
      {msg && <p className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter ingredients…"
        className="mb-3 w-full rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-base outline-none focus:border-brand-500"
      />

      <div className="space-y-3">
        {items.map(([key, it]) => (
          <div key={key} className="rounded-2xl border border-orange-100 bg-white p-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <a href={trolleySearchUrl(it.name)} target="_blank" rel="noreferrer" className="truncate font-semibold text-brand-700 underline">{it.name}</a>
              <span className="whitespace-nowrap text-[10px] text-stone-400">per {it.pack}{it.unit === "each" ? " ea" : it.unit}</span>
            </div>
            <div className="space-y-1.5">
              {STORES.map((s) => {
                const sp = it.stores[s];
                if (!sp) return null;
                const b = badge(sp);
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-16 flex-none text-xs font-medium text-stone-600">{STORE_LABELS[s]}</span>
                    <div className="flex items-center">
                      <span className="text-stone-400">$</span>
                      <input
                        type="number" inputMode="decimal" step="0.01"
                        value={sp.price ?? ""}
                        onChange={(e) => mutate(key, s, { price: e.target.value === "" ? null : Number(e.target.value), source: "manual" })}
                        className="w-16 rounded-md border border-orange-200 px-1.5 py-1 text-center text-xs outline-none focus:border-brand-500"
                        placeholder="—"
                      />
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}>{b.label}</span>
                    {sp.onSpecial && sp.wasPrice ? <span className="text-[10px] text-red-600">was ${sp.wasPrice}</span> : null}
                    <button
                      onClick={() => mutate(key, s, { locked: !sp.locked })}
                      className={`ml-auto text-sm ${sp.locked ? "text-stone-700" : "text-stone-300"}`}
                      title={sp.locked ? "Unlock (allow auto-update)" : "Lock (protect from auto-update)"}
                    >
                      {sp.locked ? "🔒" : "🔓"}
                    </button>
                  </div>
                );
              })}
            </div>
            {STORES.some((s) => it.stores[s]?.url) && (
              <div className="mt-1.5 space-y-0.5">
                {STORES.map((s) => {
                  const sp = it.stores[s];
                  if (!sp?.url || !sp.product) return null;
                  return (
                    <a key={s} href={sp.url} target="_blank" rel="noreferrer" className="block truncate text-[10px] text-stone-400 underline">
                      {STORE_LABELS[s]}: {sp.product}{sp.size ? ` (${sp.size})` : ""}
                    </a>
                  );
                })}
              </div>
            )}
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
        <p className="text-[10px] text-stone-400">The daily updater refreshes these automatically. Manual edits set “Manual”; lock 🔒 to keep them.</p>
      </div>
    </div>
  );
}
