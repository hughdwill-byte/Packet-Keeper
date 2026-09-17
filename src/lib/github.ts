/**
 * GitHub REST Contents API storage layer. The repo itself is the database.
 * Uses a fine-grained PAT (Contents: read/write) supplied from Settings.
 */
import type { Settings } from "./settings";
import { utf8ToBase64, base64ToUtf8 } from "./base64";

export interface GithubFile {
  content: string; // decoded UTF-8 (for text files)
  base64: string; // raw base64 as stored
  sha: string;
}

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GithubError";
  }
}

function apiBase(s: Settings): string {
  return `https://api.github.com/repos/${s.githubOwner}/${s.githubRepo}/contents`;
}

function headers(s: Settings): HeadersInit {
  return {
    Authorization: `Bearer ${s.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.message || JSON.stringify(j);
  } catch {
    return res.statusText;
  }
}

/** GET a file. Returns null if it does not exist (404). */
export async function getFile(s: Settings, path: string): Promise<GithubFile | null> {
  const url = `${apiBase(s)}/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(s.githubBranch)}`;
  const res = await fetch(url, { headers: headers(s) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(res.status, await readError(res));
  const data = await res.json();
  const base64 = (data.content || "").replace(/\n/g, "");
  return {
    base64,
    content: base64 ? base64ToUtf8(base64) : "",
    sha: data.sha,
  };
}

/** Look up just the SHA of a file (null if absent). */
export async function getSha(s: Settings, path: string): Promise<string | null> {
  const f = await getFile(s, path);
  return f?.sha ?? null;
}

async function putRaw(
  s: Settings,
  path: string,
  base64Content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const url = `${apiBase(s)}/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(s), "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: s.githubBranch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new GithubError(res.status, await readError(res));
  const data = await res.json();
  return { sha: data.content?.sha };
}

/**
 * Write a file, committing it. On a 409/422 SHA conflict we refetch the current
 * SHA and retry exactly once, per the spec.
 */
export async function putFile(
  s: Settings,
  path: string,
  base64Content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  let effectiveSha = sha;
  if (effectiveSha === undefined) {
    effectiveSha = (await getSha(s, path)) ?? undefined;
  }
  try {
    return await putRaw(s, path, base64Content, message, effectiveSha);
  } catch (e) {
    if (e instanceof GithubError && (e.status === 409 || e.status === 422)) {
      const fresh = (await getSha(s, path)) ?? undefined;
      return await putRaw(s, path, base64Content, message, fresh);
    }
    throw e;
  }
}

export function putTextFile(s: Settings, path: string, text: string, message: string, sha?: string) {
  return putFile(s, path, utf8ToBase64(text), message, sha);
}

/** Delete a file, committing it. Refetches SHA + retries once on conflict. */
export async function deleteFile(s: Settings, path: string, message: string, sha?: string): Promise<void> {
  let effectiveSha = sha ?? (await getSha(s, path)) ?? undefined;
  if (!effectiveSha) return; // already gone
  const url = `${apiBase(s)}/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const attempt = async (shaToUse: string) => {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { ...headers(s), "content-type": "application/json" },
      body: JSON.stringify({ message, sha: shaToUse, branch: s.githubBranch }),
    });
    if (!res.ok) throw new GithubError(res.status, await readError(res));
  };
  try {
    await attempt(effectiveSha);
  } catch (e) {
    if (e instanceof GithubError && (e.status === 409 || e.status === 422)) {
      const fresh = await getSha(s, path);
      if (fresh) await attempt(fresh);
    } else {
      throw e;
    }
  }
}

/** Cheap token/repo sanity check used by Settings. */
export async function checkAccess(s: Settings): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${s.githubOwner}/${s.githubRepo}`, {
      headers: headers(s),
    });
    if (res.ok) return { ok: true, message: "Token and repo look good." };
    if (res.status === 401) return { ok: false, message: "Bad token (401 Unauthorized)." };
    if (res.status === 404)
      return { ok: false, message: "Repo not found or token lacks access to it (404)." };
    return { ok: false, message: `GitHub error ${res.status}: ${await readError(res)}` };
  } catch (e) {
    return { ok: false, message: `Network error: ${(e as Error).message}` };
  }
}
