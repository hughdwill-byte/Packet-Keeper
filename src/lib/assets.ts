/** Resolve a repo-relative asset path (e.g. recipes/images/x.jpg) to a URL. */
import type { SyntheticEvent } from "react";
import { loadSettings } from "./settings";

/** The deployed static copy (served with the site). Can lag ~1 min after a commit. */
export function assetUrl(repoPath: string): string {
  if (!repoPath) return "";
  return `${import.meta.env.BASE_URL}${repoPath.replace(/^\/+/, "")}`;
}

/** GitHub raw at the repo tip — reflects a commit within seconds (no deploy wait). */
export function rawAssetUrl(repoPath: string): string {
  if (!repoPath) return "";
  const s = loadSettings();
  const owner = s.githubOwner || "hughdwill-byte";
  const repo = s.githubRepo || "Packet-Keeper";
  const branch = s.githubBranch || "main";
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${repoPath.replace(/^\/+/, "")}`;
}

/**
 * <img onError> handler: if the deployed copy isn't there yet (just-committed,
 * not deployed), retry once from GitHub raw. raw serves JP/PNG with correct
 * types; only bundled SVG tiles (which are already deployed) are unsuitable, and
 * those won't hit this path.
 */
export function imgFallbackToRaw(e: SyntheticEvent<HTMLImageElement>, repoPath: string): void {
  const img = e.currentTarget;
  if (img.dataset.fellBack === "1") return;
  img.dataset.fellBack = "1";
  img.src = rawAssetUrl(repoPath);
}
