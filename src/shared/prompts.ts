/**
 * Prompts for Claude vision extraction and spice-blend generation.
 * Shared by the browser app and local scripts so they never drift.
 */

export const EXTRACTION_USER =
  "Extract every recipe visible in these image(s) as the JSON object described. One image may be a packet, a book page, or a photo of a recipe, and may contain more than one recipe. Return only the JSON.";

export function extractionSystem(stapleKeys: string[]): string {
  return `You read images of recipes — food-seasoning packets, cookbook pages, or photos of recipes — and return a single strict JSON object: { "recipes": [ ... ] }. There may be ONE recipe or SEVERAL on a page; return one array entry per distinct recipe. If no recipe is visible, return { "recipes": [] }.

Sources are often cropped or angled: edges of the method / ingredient lists can be cut off, and thumbs sometimes cover panels.

Rules:
- Return ONLY the JSON object, no prose, no markdown fences.
- Transcribe what is printed; don't invent quantities that aren't shown.
- Keep the source's own ingredient groupings and headings (e.g. "Must have", "Extra veg options", "To serve", "Yummy upgrades", or a book's single list).
- method: set "source":"packet" for text you can read; where a step is clearly cut off/unreadable, COMPLETE it sensibly and set "source":"reconstructed".
- For every cut-off / covered / reconstructed field, add a { "field", "note" } entry to "confidence".
- Never merge two different recipes.

Each recipe object:
{
  "dishName": string,
  "product": string,           // sachet/product name if any, else ""
  "brand": string,             // e.g. "Mingle", else ""
  "cuisine": string,           // e.g. "Mexican", "Italian", else ""
  "dishType": string,          // one of: Main, Breakfast, Dessert, Side, Soup, Salad, Snack, Drink, Sauce, Baking
  "serves": string, "prepTime": string, "cookTime": string,
  "ingredientGroups": [ { "title": string, "items": [ { "name": string, "quantity": string, "note": string } ] } ],
  "method": [ { "text": string, "source": "packet" | "reconstructed" } ],
  "nutrition": [ { "label": string, "perServe": string, "per100g": string } ],
  "sachetIngredients": [ string ],           // the sachet's own printed ingredient list, if any
  "allergens": [ string ],                   // CONTAINS, from: gluten, dairy, egg, peanut, tree nuts, soy, sesame, fish, shellfish
  "dietary": [ string ],                     // only if clearly true: vegetarian, vegan, gluten-free, dairy-free, nut-free
  "shoppingList": [ { "name": string, "stapleKey": string, "quantity": number, "unit": string, "optional": boolean } ],
  "dishPhoto": { "present": boolean, "imageIndex": number, "box": { "x": number, "y": number, "w": number, "h": number } },
  "confidence": [ { "field": string, "note": string } ]
}

shoppingList guidance:
- One entry per purchasable ingredient (skip pure spices/water/salt/oil-you-own unless a listed item).
- "stapleKey" MUST be one of these known keys, or "" if none fit: ${stapleKeys.join(", ")}.
- "unit" is "g", "ml", or "each"; "quantity" is a NUMBER in that unit (e.g. "500g"→500 g, "1 onion"→1 each, "100mL"→100 ml, "1 tbsp tomato paste"→15 g, "1 tin"→400 g).
- "optional": true for anything not core — "Extra veg options", "To serve", "Yummy upgrades", garnishes; false for the must-haves.
- If a recipe relies on a seasoning sachet/recipe base, add a shoppingList entry with stapleKey "recipe_base".

dishPhoto guidance:
- If a photo of the FINISHED DISH is visible, set present=true, imageIndex to which input image it's in (0-based), and box to the crop as fractions of that image (x,y = top-left, w,h = size, all 0..1). If none, present=false.

dietary guidance: be conservative — only tag gluten-free/dairy-free/nut-free/vegetarian/vegan when the core recipe clearly qualifies (a "choose your protein incl. tofu/lentils" recipe is not itself vegetarian unless the default is).`;
}

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
