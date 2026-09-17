/**
 * Claude API calls, shared by the browser app and the Node import script.
 * Uses global fetch (available in browsers and Node 18+). The browser-direct
 * header is required for calling the API straight from a web page.
 */
import { ExtractionSchema, SpiceBlendSchema, type Extraction, type SpiceBlend } from "./schema";
import { EXTRACTION_SYSTEM, EXTRACTION_USER, spiceBlendPrompt } from "./prompts";
import { extractJson } from "./util";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-sonnet-5";

export interface ImagePart {
  mediaType: string; // e.g. "image/jpeg"
  base64: string; // raw base64, no data: prefix
}

interface CallOpts {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function callClaude(
  opts: CallOpts,
  system: string,
  content: ContentBlock[],
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Claude API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = (data?.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude returned no text content");
  return text;
}

/** Extract a recipe from one or more photos of the same packet. */
export async function extractRecipe(opts: CallOpts, images: ImagePart[]): Promise<Extraction> {
  const content: ContentBlock[] = [
    ...images.map(
      (img): ContentBlock => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }),
    ),
    { type: "text", text: EXTRACTION_USER },
  ];
  const text = await callClaude({ ...opts, maxTokens: 4096 }, EXTRACTION_SYSTEM, content);
  const raw = extractJson(text);
  // Throws on structural failure; caller decides whether to mark needs-review.
  return ExtractionSchema.parse(raw);
}

/** Generate a homemade spice blend that replaces the sachet. */
export async function generateSpiceBlend(
  opts: CallOpts,
  recipe: { dishName?: string; cuisine?: string; serves?: string; sachetIngredients?: string[] },
): Promise<SpiceBlend> {
  const prompt = spiceBlendPrompt(recipe);
  const text = await callClaude({ ...opts, maxTokens: 1024 }, "You are a helpful cook.", [
    { type: "text", text: prompt },
  ]);
  const raw = extractJson(text);
  return SpiceBlendSchema.parse(raw);
}
