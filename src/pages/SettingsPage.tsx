import { useState } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import { checkAccess } from "../lib/github";

const input = "w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500";
const label = "mb-1 block text-xs font-semibold uppercase text-stone-500";

const MODELS = ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"];

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const set = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setSaved(false);
  };

  function save() {
    saveSettings(s);
    setSaved(true);
  }

  async function testGithub() {
    setChecking(true);
    setCheck(null);
    saveSettings(s);
    setCheck(await checkAccess(s));
    setChecking(false);
  }

  return (
    <div className="pb-6">
      <h1 className="mb-2 text-xl font-bold">Settings</h1>
      <p className="mb-4 rounded-lg bg-green-50 p-3 text-xs text-green-800">
        🔒 Your keys are stored <b>only in this browser</b> (localStorage on this device). They are never
        put in source code, commits, recipe files or the built site.
      </p>

      <div className="space-y-4">
        <div>
          <span className={label}>Anthropic API key</span>
          <input
            className={input}
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={s.anthropicApiKey}
            onChange={(e) => set({ anthropicApiKey: e.target.value })}
          />
        </div>

        <div>
          <span className={label}>Claude model</span>
          <select className={input} value={s.model} onChange={(e) => set({ model: e.target.value })}>
            {(MODELS.includes(s.model) ? MODELS : [s.model, ...MODELS]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <hr className="border-orange-100" />

        <div>
          <span className={label}>GitHub fine-grained token</span>
          <input
            className={input}
            type="password"
            autoComplete="off"
            placeholder="github_pat_…"
            value={s.githubToken}
            onChange={(e) => set({ githubToken: e.target.value })}
          />
          <p className="mt-1 text-xs text-stone-500">
            Fine-grained PAT scoped to this one repo, with <b>Contents: Read and write</b>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Owner</span>
            <input className={input} value={s.githubOwner} onChange={(e) => set({ githubOwner: e.target.value })} />
          </div>
          <div>
            <span className={label}>Repo</span>
            <input className={input} value={s.githubRepo} onChange={(e) => set({ githubRepo: e.target.value })} />
          </div>
        </div>
        <div>
          <span className={label}>Branch</span>
          <input className={input} value={s.githubBranch} onChange={(e) => set({ githubBranch: e.target.value })} />
        </div>

        <button
          onClick={testGithub}
          disabled={checking}
          className="w-full rounded-lg border border-brand-300 py-2 font-medium text-brand-700 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Test GitHub access"}
        </button>
        {check && (
          <p className={`rounded-lg p-2 text-sm ${check.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {check.ok ? "✓ " : "✕ "}{check.message}
          </p>
        )}

        <button onClick={save} className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white">
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
