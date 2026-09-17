/** Resolve a repo-relative asset path (e.g. recipes/images/x.svg) to a URL. */
export function assetUrl(repoPath: string): string {
  if (!repoPath) return "";
  return `${import.meta.env.BASE_URL}${repoPath.replace(/^\/+/, "")}`;
}
