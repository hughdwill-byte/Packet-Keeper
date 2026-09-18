import { z } from "zod";

/**
 * Strict-ish recipe schema. Most fields are optional/tolerant so that a photo
 * with cut-off text still validates and can be saved; genuinely broken output
 * gets flagged with `needsReview` instead of crashing (see recipes.ts).
 */

export const STORES = ["aldi", "coles", "woolworths", "iga"] as const;
export type Store = (typeof STORES)[number];
export const STORE_LABELS: Record<Store, string> = {
  aldi: "ALDI",
  coles: "Coles",
  woolworths: "Woolworths",
  iga: "IGA",
};

export const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.string().optional().default(""),
  note: z.string().optional().default(""),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const IngredientGroupSchema = z.object({
  // e.g. "Must have", "Extra veg options", "To serve", "Yummy upgrades"
  title: z.string(),
  items: z.array(IngredientSchema).default([]),
});
export type IngredientGroup = z.infer<typeof IngredientGroupSchema>;

export const MethodStepSchema = z.object({
  text: z.string(),
  // "packet" = read directly from the source; "reconstructed" = Claude completed
  // a cut-off / unreadable step.
  source: z.enum(["packet", "reconstructed"]).default("packet"),
});
export type MethodStep = z.infer<typeof MethodStepSchema>;

export const NutritionRowSchema = z.object({
  label: z.string(),
  perServe: z.string().optional().default(""),
  per100g: z.string().optional().default(""),
});
export type NutritionRow = z.infer<typeof NutritionRowSchema>;

export const ConfidenceFlagSchema = z.object({
  field: z.string(),
  note: z.string(),
});
export type ConfidenceFlag = z.infer<typeof ConfidenceFlagSchema>;

export const SpiceBlendSchema = z.object({
  note: z.string().default(""),
  items: z.array(IngredientSchema).default([]),
  isEstimate: z.literal(true).default(true),
});
export type SpiceBlend = z.infer<typeof SpiceBlendSchema>;

/**
 * A normalized, purchasable line used for cost estimates + shopping lists.
 * `stapleKey` references an item in recipes/prices.json (empty if unmatched).
 * `quantity` is expressed in `unit` (g / ml / each) to match the staple's pack.
 */
export const ShoppingItemSchema = z.object({
  name: z.string(),
  stapleKey: z.string().default(""),
  quantity: z.number().default(0),
  unit: z.string().default("each"), // g | ml | each
  optional: z.boolean().default(false),
});
export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

/** Where a finished-dish photo sits in a source image, as 0-1 fractions. */
export const DishPhotoSchema = z.object({
  present: z.boolean().default(false),
  imageIndex: z.number().default(0),
  box: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
});
export type DishPhoto = z.infer<typeof DishPhotoSchema>;

export const CostByStoreSchema = z.record(z.enum(STORES), z.number()).default({});
export type CostByStore = z.infer<typeof CostByStoreSchema>;

/**
 * What Claude returns for a single recipe. Kept separate from the stored
 * Recipe so we can validate the model output on its own.
 */
export const ExtractionSchema = z.object({
  dishName: z.string().min(1),
  product: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  cuisine: z.string().optional().default(""),
  dishType: z.string().optional().default(""), // Main / Dessert / Breakfast / Side / Soup / Salad / Snack / Drink / Sauce / Baking
  serves: z.string().optional().default(""),
  prepTime: z.string().optional().default(""),
  cookTime: z.string().optional().default(""),
  ingredientGroups: z.array(IngredientGroupSchema).default([]),
  method: z.array(MethodStepSchema).default([]),
  nutrition: z.array(NutritionRowSchema).default([]),
  sachetIngredients: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]), // contains: gluten, dairy, egg, peanut, tree nuts, soy, sesame, fish, shellfish
  dietary: z.array(z.string()).default([]), // vegetarian, vegan, gluten-free, dairy-free, nut-free
  shoppingList: z.array(ShoppingItemSchema).default([]),
  dishPhoto: DishPhotoSchema.optional(),
  confidence: z.array(ConfidenceFlagSchema).default([]),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** Multiple recipes can come from one PDF page or book photo. */
export const ExtractionBatchSchema = z.object({
  recipes: z.array(ExtractionSchema).default([]),
});

export const RecipeSchema = ExtractionSchema.extend({
  slug: z.string(),
  spiceBlend: SpiceBlendSchema.optional(),
  images: z.array(z.string()).default([]), // relative paths to source photos
  dishImage: z.string().optional().default(""), // dish photo crop or emoji tile
  dishImageFromPhoto: z.boolean().optional().default(false),
  costByStore: CostByStoreSchema, // proportional cost-to-make estimate per store
  needsReview: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const IndexEntrySchema = z.object({
  slug: z.string(),
  dishName: z.string(),
  product: z.string().default(""),
  cuisine: z.string().default(""),
  dishType: z.string().default(""),
  allergens: z.array(z.string()).default([]),
  dietary: z.array(z.string()).default([]),
  dishImage: z.string().default(""),
  needsReview: z.boolean().default(false),
  costByStore: CostByStoreSchema,
  // flattened ingredient names to make search cheap without loading each file
  ingredientNames: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const IndexSchema = z.array(IndexEntrySchema);
export type RecipeIndex = z.infer<typeof IndexSchema>;

/** Build the compact index entry for a full recipe. */
export function toIndexEntry(r: Recipe): IndexEntry {
  const ingredientNames = r.ingredientGroups
    .flatMap((g) => g.items.map((i) => i.name))
    .filter(Boolean);
  return {
    slug: r.slug,
    dishName: r.dishName,
    product: r.product ?? "",
    cuisine: r.cuisine ?? "",
    dishType: r.dishType ?? "",
    allergens: r.allergens ?? [],
    dietary: r.dietary ?? [],
    dishImage: r.dishImage ?? "",
    needsReview: r.needsReview,
    costByStore: r.costByStore ?? {},
    ingredientNames,
    updatedAt: r.updatedAt,
  };
}
