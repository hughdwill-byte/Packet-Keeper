/**
 * Free, offline "dish image" generator: pick a food emoji that best matches a
 * recipe, then render it as an SVG tile. No image API, no keys. Shared by the
 * browser app and the local import script.
 */

// Order matters: earlier, more specific keywords win.
const EMOJI_RULES: Array<{ keywords: string[]; emoji: string }> = [
  { keywords: ["taco"], emoji: "🌮" },
  { keywords: ["burrito", "wrap", "enchilada"], emoji: "🌯" },
  { keywords: ["nacho", "quesadilla"], emoji: "🧀" },
  { keywords: ["mexican", "fajita", "chilli", "chili", "con carne"], emoji: "🌶️" },
  { keywords: ["curry", "korma", "tikka", "masala", "balti", "madras", "biryani"], emoji: "🍛" },
  { keywords: ["thai", "satay", "pad "], emoji: "🥡" },
  { keywords: ["stir fry", "stir-fry", "chow mein", "noodle", "ramen", "laksa"], emoji: "🍜" },
  { keywords: ["sushi", "teriyaki", "japanese"], emoji: "🍣" },
  { keywords: ["pasta", "spaghetti", "bolognese", "lasagne", "lasagna", "carbonara", "penne"], emoji: "🍝" },
  { keywords: ["pizza"], emoji: "🍕" },
  { keywords: ["risotto", "paella", "rice", "pilaf"], emoji: "🍚" },
  { keywords: ["soup", "broth", "chowder"], emoji: "🍲" },
  { keywords: ["stew", "casserole", "hotpot", "hot pot", "braise"], emoji: "🥘" },
  { keywords: ["salad", "slaw"], emoji: "🥗" },
  { keywords: ["burger"], emoji: "🍔" },
  { keywords: ["sandwich", "toastie", "sub "], emoji: "🥪" },
  { keywords: ["roast", "chicken"], emoji: "🍗" },
  { keywords: ["steak", "beef", "brisket"], emoji: "🥩" },
  { keywords: ["bacon", "pork", "sausage"], emoji: "🥓" },
  { keywords: ["fish", "salmon", "tuna", "cod", "prawn", "shrimp", "seafood"], emoji: "🐟" },
  { keywords: ["egg", "omelette", "frittata"], emoji: "🍳" },
  { keywords: ["potato", "mash", "fries", "chips", "wedges"], emoji: "🥔" },
  { keywords: ["pie", "pastry"], emoji: "🥧" },
  { keywords: ["bread", "flatbread", "naan"], emoji: "🥖" },
  { keywords: ["veg", "vegetable", "vegan", "vegetarian"], emoji: "🥦" },
];

const DEFAULT_EMOJI = "🥘";

// A few warm gradient pairs; chosen deterministically from the slug/name.
const GRADIENTS: Array<[string, string]> = [
  ["#fb923c", "#ef4444"],
  ["#f59e0b", "#ea580c"],
  ["#f97316", "#db2777"],
  ["#fbbf24", "#d97706"],
  ["#34d399", "#059669"],
  ["#60a5fa", "#4f46e5"],
];

export function pickFoodEmoji(text: string): string {
  const hay = (text || "").toLowerCase();
  for (const rule of EMOJI_RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.emoji;
  }
  return DEFAULT_EMOJI;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface DishLike {
  slug?: string;
  dishName?: string;
  product?: string;
  cuisine?: string;
  ingredientGroups?: Array<{ items?: Array<{ name?: string }> }>;
}

/**
 * Build an SVG tile string for a recipe. SVG renders the emoji using the
 * viewer's own system emoji font, so it looks native on iPhone and needs no
 * external asset. Returned as a string; wrap in a Blob for the browser.
 */
export function buildDishSvg(recipe: DishLike): string {
  const ingredientText = (recipe.ingredientGroups || [])
    .flatMap((g) => (g.items || []).map((i) => i.name || ""))
    .join(" ");
  const matchText = [recipe.dishName, recipe.product, recipe.cuisine, ingredientText]
    .filter(Boolean)
    .join(" ");
  const emoji = pickFoodEmoji(matchText);
  const key = recipe.slug || recipe.dishName || matchText || "dish";
  const [c1, c2] = GRADIENTS[hashString(key) % GRADIENTS.length];
  const label = escapeXml(recipe.dishName || "Recipe");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="360" r="230" fill="rgba(255,255,255,0.18)"/>
  <text x="400" y="360" font-size="300" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  <text x="400" y="700" font-size="42" fill="#ffffff" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700">${label}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
