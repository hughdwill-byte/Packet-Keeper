/**
 * Prompts for the Claude vision extraction and the spice-blend generation.
 * Shared by the browser app and the local import script so they never drift.
 */

export const EXTRACTION_SYSTEM = `You read photos of the back of food-seasoning packets / recipe-base sachets and return a single strict JSON object describing the recipe. The photos are often cropped: the right edge of the method and the sachet ingredient list is frequently cut off, and a thumb sometimes covers the nutrition panel.

Rules:
- Return ONLY a JSON object, no prose, no markdown fences.
- Transcribe exactly what is printed. Do not invent quantities that are not shown.
- Keep the packet's own ingredient groupings and their exact headings (e.g. "Must have", "Extra veg options", "To serve", "Yummy upgrades").
- For method steps, set "source":"packet" for text you can actually read. Where a step is clearly cut off or unreadable, COMPLETE it sensibly for this dish and set "source":"reconstructed".
- List the sachet's OWN ingredient list (what's inside the sachet, usually in small print, in descending order by weight) in "sachetIngredients".
- For every field that is cut off, blurred, covered, or that you had to reconstruct, add an entry to "confidence" naming the field and what was wrong.
- Two different sachets can share the same recipe text but differ in spices — treat what you see; never merge recipes.

JSON shape:
{
  "dishName": string,
  "product": string,        // the sachet/product name if shown, else ""
  "brand": string,          // e.g. "Mingle", else ""
  "cuisine": string,        // e.g. "Mexican", else ""
  "serves": string,
  "prepTime": string,
  "cookTime": string,
  "ingredientGroups": [ { "title": string, "items": [ { "name": string, "quantity": string, "note": string } ] } ],
  "method": [ { "text": string, "source": "packet" | "reconstructed" } ],
  "nutrition": [ { "label": string, "perServe": string, "per100g": string } ],
  "sachetIngredients": [ string ],
  "confidence": [ { "field": string, "note": string } ]
}`;

export const EXTRACTION_USER =
  "Extract the recipe from this packet photo (or photos of the same packet) as the JSON object described. Return only the JSON.";

export function spiceBlendPrompt(recipe: {
  dishName?: string;
  cuisine?: string;
  serves?: string;
  sachetIngredients?: string[];
}): string {
  const sachet =
    recipe.sachetIngredients && recipe.sachetIngredients.length
      ? recipe.sachetIngredients.join(", ")
      : "(sachet ingredient list not readable)";
  return `A recipe uses a pre-made seasoning sachet. Produce a homemade spice blend that replaces the sachet for the WHOLE recipe.

Dish: ${recipe.dishName || "unknown"}
Cuisine: ${recipe.cuisine || "unknown"}
Serves: ${recipe.serves || "unknown"}
Sachet ingredients (descending by weight): ${sachet}

Rules:
- Give measured quantities in tsp/tbsp for the full recipe (not per serve).
- Base proportions on the sachet ingredient order (first = most) plus the dish style.
- Common pantry spices only; skip anti-caking agents, "flavourings", maltodextrin, etc.
- It is an estimate — say so in "note".
- Return ONLY this JSON, no prose, no fences:
{ "note": string, "items": [ { "name": string, "quantity": string, "note": string } ], "isEstimate": true }`;
}
