import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadSettings, hasClaudeConfig, hasGithubConfig } from "../lib/settings";
import { loadIndex } from "../lib/recipes";
import { processRecipe, type Stage } from "../lib/pipeline";

interface Item {
  id: string;
  files: File[];
  previews: string[];
  stage: Stage;
  message: string;
  slug?: string;
  dishName?: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Waiting…",
  reading: "Reading",
  generating: "Generating image",
  saving: "Saving",
  done: "Done ✓",
  "needs-review": "Needs review",
  error: "Error",
};

const STAGE_COLOR: Record<Stage, string> = {
  queued: "bg-stone-100 text-stone-500",
  reading: "bg-blue-100 text-blue-700",
  generating: "bg-violet-100 text-violet-700",
  saving: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  "needs-review": "bg-amber-100 text-amber-800",
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
    const mk = (fs: File[]): Item => ({
      id: crypto.randomUUID(),
      files: fs,
      previews: fs.map((f) => URL.createObjectURL(f)),
      stage: "queued",
      message: "",
    });
    setItems((prev) => [...prev, ...(combine ? [mk(files)] : files.map((f) => mk([f])))]);
    e.target.value = "";
  }

  function update(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function run() {
    setRunning(true);
    const index = await loadIndex();
    const existing = new Set(index.map((e) => e.slug));
    for (const item of items) {
      if (item.stage === "done") continue;
      try {
        const saved = await processRecipe(settings, item.files, existing, (stage, message) =>
          update(item.id, { stage, message: message || "" }),
        );
        update(item.id, {
          stage: saved.needsReview ? "needs-review" : "done",
          slug: saved.slug,
          dishName: saved.dishName,
          message: "",
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
        <p className="mb-3">
          Uploading photos needs your Anthropic API key and a GitHub token so recipes can be saved.
        </p>
        <Link to="/settings" className="inline-block rounded-lg bg-brand-600 px-4 py-2 font-medium text-white">
          Go to Settings
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold">Add recipes</h1>

      <label className="mb-3 flex items-center gap-2 text-sm text-stone-600">
        <input
          type="checkbox"
          checked={combine}
          onChange={(e) => setCombine(e.target.checked)}
          className="h-5 w-5 accent-brand-600"
        />
        Combine the next selection into one recipe (multiple photos of the same packet)
      </label>

      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-white py-8 text-brand-700">
        <span className="text-4xl">📷</span>
        <span className="font-medium">Take or choose photos</span>
        <span className="text-xs text-stone-500">You can pick several at once</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </label>

      {items.length > 0 && (
        <div className="mb-4 space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-2xl border border-orange-100 bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {it.previews.slice(0, 3).map((p, i) => (
                    <img
                      key={i}
                      src={p}
                      alt=""
                      className="h-12 w-12 rounded-lg border-2 border-white object-cover"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {it.dishName || `${it.files.length} photo${it.files.length > 1 ? "s" : ""}`}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[it.stage]}`}
                  >
                    {STAGE_LABEL[it.stage]}
                  </span>
                  {it.message && <p className="mt-1 text-xs text-stone-500">{it.message}</p>}
                </div>
                {it.slug && (
                  <Link to={`/recipe/${it.slug}`} className="text-sm font-medium text-brand-600">
                    Open
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && !allDone && (
        <button
          onClick={run}
          disabled={running}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {running ? "Processing…" : `Process ${items.length} recipe${items.length > 1 ? "s" : ""}`}
        </button>
      )}

      {allDone && (
        <button
          onClick={() => navigate("/")}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white"
        >
          View all recipes
        </button>
      )}
    </div>
  );
}
