/** Small pure helpers shared by app + import script. */

/**
 * Live price lookup on Trolley Checker (opens in a new tab — no scraping).
 * Central so the search path is easy to adjust if their URL scheme differs.
 */
export function trolleySearchUrl(term: string): string {
  return `https://trolleychecker.com.au/search?q=${encodeURIComponent(term)}`;
}

/** Friendly relative date like "today", "3 days ago", "2 months ago". */
export function relativeDate(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Make a slug unique against a set of existing slugs. */
export function uniqueSlug(base: string, existing: Set<string>): string {
  let slug = base || "recipe";
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/**
 * Pull a JSON object out of a model response that may include stray prose or
 * ```json fences. Returns the parsed value or throws.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip code fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Fall back to the first balanced {...} block.
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(body.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model response");
  }
}
