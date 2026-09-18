/**
 * Settings live ONLY in this browser's localStorage. Keys never touch source,
 * commits, recipe files or build output.
 */
import { DEFAULT_MODEL } from "../shared/claude";
import type { Store } from "../shared/schema";

const KEY = "packet-keeper-settings-v1";

export interface Settings {
  anthropicApiKey: string;
  model: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  preferredStore: Store;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropicApiKey: "",
  model: DEFAULT_MODEL,
  githubToken: "",
  // Sensible defaults for this deployment; editable on the Settings screen.
  githubOwner: "hughdwill-byte",
  githubRepo: "Packet-Keeper",
  githubBranch: "main",
  preferredStore: "coles",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function hasGithubConfig(s: Settings): boolean {
  return Boolean(s.githubToken && s.githubOwner && s.githubRepo);
}

export function hasClaudeConfig(s: Settings): boolean {
  return Boolean(s.anthropicApiKey && s.model);
}
