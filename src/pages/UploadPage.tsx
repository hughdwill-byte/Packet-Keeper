import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadSettings, hasClaudeConfig, hasGithubConfig } from "../lib/settings";
import { loadIndex } from "../lib/recipes";
import { loadPriceBook } from "../lib/priceBook";
import { expandFile, processImages, type Stage } from "../lib/pipeline";

interface Item {
  id: string;
  files: File[];
  label: string;
  stage: Stage;
  message: string;
  created: { slug: string; dishName: string }[];
}

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Waiting…", reading: "Reading", generating: "Generating", saving: "Saving",
  done: "Done ✓", "needs-review": "Needs review", error: "Error",
};
const STAGE_COLOR: Record<Stage, string> = {
  queued: "bg-stone-100 text-stone-500", reading: "bg-blue-100 text-blue-700",
  generating: "bg-violet-100 text-violet-700", saving: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700", "needs-review": "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
};

export default function UploadPage() {
  const settings = useMemo(() => loadSettings(), []);
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [combine, setCombine] = useState(false);
  const [running, setRunning] = useState(false);
  const configured = hasClaudeConfig(settings) && hasGithubConfig(settings);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const mk = (fs: File[], label: string): Item => ({
      id: crypto.randomUUID(), files: fs, label, stage: "queued", message: "", created: [],
    });
    const next = combine
      ? [mk(files, `${files.length} file${files.length > 1 ? "s" : ""} → one recipe`)]
      : files.map((f) => mk([f], f.name));
    setItems((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function run() {
    setRunning(true);
    const [book, index] = await Promise.all([loadPriceBook(), loadIndex()]);
    const existing = new Set(index.map((e) => e.slug));
    for (const item of items) {
      if (item.stage === "done" || item.stage === "needs-review") continue;
      try {
        const images = (
          await Promise.all(item.files.map((f) => expandFile(f, (s, m) => update(item.id, { stage: s, message: m || "" }))))
        ).flat();
        const recipes = await processImages(settings, images, book, existing, (s, m) =>
          update(item.id, { stage: s, message: m || "" }),
        );
        const anyReview = recipes.some((r) => r.needsReview);
        update(item.id, {
          stage: anyReview ? "needs-review" : "done",
          message: `${recipes.length} recipe${recipes.length !== 1 ? "s" : ""} added`,
          created: recipes.map((r) => ({ slug: r.slug, dishName: r.dishName })),
        });
      } catch (e) {
        update(item.id, { stage: "error", message: (e as Error).message });
      }
    }
    setRunning(false);
  }

  const allDone = items.length > 0 && items.every((i) => ["done", "needs-review", "error"].includes(i.stage));

  if (!configured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="mb-2 font-semibold">Add your keys first</p>
        <p className="mb-3">Adding recipes needs your Anthropic API key and a GitHub token.</p>
        <Link to="/settings" className="inline-block rounded-lg bg-brand-600 px-4 py-2 font-medium text-white">Go to Settings</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold">Add recipes</h1>

      <label className="mb-3 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} className="h-5 w-5 accent-brand-600" />
        Combine the next selection into one recipe (several photos of the same packet)
      </label>

      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-white py-8 text-brand-700">
        <span className="text-4xl">📷📄</span>
        <span className="font-medium">Take photos or choose files</span>
        <span className="text-xs text-stone-500">Packet photos, recipe photos, or PDFs of recipe books</span>
        <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={onPick} />
      </label>

      {items.length > 0 && (
        <div className="mb-4 space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-2xl border border-orange-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{it.label}</p>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[it.stage]}`}>{STAGE_LABEL[it.stage]}</span>
              </div>
              {it.message && <p className="mt-1 text-xs text-stone-500">{it.message}</p>}
              {it.created.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.created.map((c) => (
                    <Link key={c.slug} to={`/recipe/${c.slug}`} className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-brand-700">
                      {c.dishName} →
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && !allDone && (
        <button onClick={run} disabled={running} className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white disabled:opacity-50">
          {running ? "Processing…" : "Process"}
        </button>
      )}
      {allDone && (
        <button onClick={() => navigate("/")} className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white">
          View all recipes
        </button>
      )}
      <p className="mt-3 text-center text-[11px] text-stone-400">
        PDFs are rendered page by page in your browser; each page can add one or more recipes.
      </p>
    </div>
  );
}
