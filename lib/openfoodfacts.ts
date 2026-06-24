import type { Food, Store } from "@/lib/types";
import { inferAllergens, inferDiets, STORES } from "@/lib/food-engine";

export type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  abbreviated_product_name_fr?: string;
  generic_name?: string;
  generic_name_fr?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  countries_tags?: string[];
  quantity?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
  allergens_tags?: string[];
  image_url?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  selected_images?: Record<string, unknown>;
  nova_group?: number;
  nutriscore_grade?: string;
};

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_fr",
  "abbreviated_product_name_fr",
  "generic_name",
  "generic_name_fr",
  "brands",
  "categories",
  "categories_tags",
  "countries_tags",
  "quantity",
  "serving_quantity",
  "serving_size",
  "nutriments",
  "allergens_tags",
  "image_url",
  "image_front_url",
  "image_front_small_url",
  "image_small_url",
  "selected_images",
  "nova_group",
  "nutriscore_grade",
].join(",");

const COMMON_PRODUCT_CORRECTIONS: Record<string, string> = {
  "ore": "oreo",
  "oreille": "oreo",
  "oreo": "oreo",
  "oreo biscuit": "oreo",
  "oréo": "oreo",
  "nutel": "nutella",
  "nutela": "nutella",
  "princ": "prince biscuit chocolat",
  "prince": "prince biscuit chocolat",
  "bn": "bn biscuit chocolat",
  "kinder": "kinder",
  "chocap": "chocapic",
  "chocapic": "chocapic",
  "coca": "coca cola",
  "coca cola": "coca cola",
  "skyr": "skyr",
  "activia": "activia",
  "danette": "danette",
  "granola": "granola biscuit chocolat",
  "belvita": "belvita",
  "petit beurre": "petit beurre lu",
  "petit lu": "petit beurre lu",
  "lu": "lu biscuit",
  "whey": "whey protein",
  "raptor": "raptor nutrition",
};

function n(v: unknown) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}
function positive(v: unknown) {
  const x = n(v);
  return x > 0 ? x : undefined;
}
export function normalizeProductText(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ").trim();
}
function slugify(s: string) {
  return normalizeProductText(s).replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function queryVariants(query: string) {
  const raw = query.trim();
  const norm = normalizeProductText(raw);
  const corrected = COMMON_PRODUCT_CORRECTIONS[norm] || COMMON_PRODUCT_CORRECTIONS[norm.split(" ")[0]];
  const variants = [corrected, raw, norm]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(v => v.length >= 2);
  return Array.from(new Set(variants)).slice(0, 3);
}
function defaultPrices(priceKg = 7): Record<Store, number> {
  return Object.keys(STORES).reduce((acc, store) => ({ ...acc, [store]: +(priceKg * STORES[store as Store].factor).toFixed(2) }), {} as Record<Store, number>);
}
function mapOffAllergens(product: OpenFoodFactsProduct) {
  const tags = product.allergens_tags ?? [];
  const names = tags.map(t => t.replace(/^.*:/, ""));
  const text = `${product.product_name_fr || product.product_name || ""} ${product.generic_name_fr || product.generic_name || ""} ${names.join(" ")}`;
  return Array.from(new Set([...inferAllergens(text), ...names.map(x => x.replace(/-/g, "_"))]));
}
function imageFor(product: OpenFoodFactsProduct) {
  return product.image_front_small_url || product.image_front_url || product.image_small_url || product.image_url || undefined;
}
function parseGramsFromText(value?: string) {
  if (!value) return undefined;
  const s = value.toLowerCase().replace(",", ".");
  const match = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (unit === "kg" || unit === "l") return amount * 1000;
  if (unit === "cl") return amount * 10;
  return amount;
}
function servingGrams(product: OpenFoodFactsProduct) {
  return positive(product.serving_quantity) || parseGramsFromText(product.serving_size) || undefined;
}
function packageGrams(product: OpenFoodFactsProduct) {
  return parseGramsFromText(product.quantity) || undefined;
}
function inferIcon(product: OpenFoodFactsProduct) {
  const text = `${product.product_name_fr || product.product_name || ""} ${product.brands || ""} ${product.categories || ""}`.toLowerCase();
  if (/biscuit|cookie|oreo|gâteau|gateau|cake|barre|prince|granola|lu/.test(text)) return "🍪";
  if (/céréale|cereale|muesli|chocapic/.test(text)) return "🥣";
  if (/yaourt|yogourt|skyr|fromage blanc|dessert lact/.test(text)) return "🥛";
  if (/boisson|soda|jus|drink|coca/.test(text)) return "🥤";
  if (/whey|protein|protéine|proteine|gainer/.test(text)) return "🥤";
  if (/pizza|plat préparé|plat prepare|pasta|pâte|pates/.test(text)) return "🍕";
  return "🏷️";
}
function priceGuess(product: OpenFoodFactsProduct) {
  const text = `${product.product_name_fr || product.product_name || ""} ${product.categories || ""}`.toLowerCase();
  if (/whey|protein|protéine|proteine|gainer|complément|complement/.test(text)) return 30;
  if (/biscuit|cookie|oreo|barre|céréale|cereale|granola/.test(text)) return 9;
  if (/yaourt|skyr|fromage blanc|dessert/.test(text)) return 4;
  if (/plat|pizza|surgelé|surgele/.test(text)) return 8;
  return 7;
}
function categoryFor(product: OpenFoodFactsProduct) {
  const cats = product.categories?.split(",").map(c => c.trim()).filter(Boolean) ?? [];
  const first = cats.find(c => !/^en:|^fr:/.test(c)) || cats[0];
  if (first) return `Produit de marque · ${first}`;
  return "Produits de marque / Open Food Facts";
}
function textForRelevance(product: OpenFoodFactsProduct) {
  return normalizeProductText([
    product.product_name_fr,
    product.product_name,
    product.abbreviated_product_name_fr,
    product.generic_name_fr,
    product.generic_name,
    product.brands,
    product.categories,
    product.code,
  ].filter(Boolean).join(" "));
}
function hasNutrition(product: OpenFoodFactsProduct) {
  const nutriments = product.nutriments ?? {};
  return n(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"]) > 0 || n(nutriments.proteins_100g) > 0 || n(nutriments.carbohydrates_100g) > 0 || n(nutriments.fat_100g) > 0;
}
function relevanceScore(product: OpenFoodFactsProduct, query: string) {
  const text = textForRelevance(product);
  const q = normalizeProductText(query);
  const tokens = q.split(" ").filter(t => t.length >= 3);
  let score = 0;
  if (!tokens.length) return 0;
  if (text.includes(q)) score += 8;
  tokens.forEach(t => { if (text.includes(t)) score += 3; });
  if (imageFor(product)) score += 3;
  if (product.brands) score += 1;
  if (hasNutrition(product)) score += 2;
  if ((product.countries_tags ?? []).some(c => c.includes("france"))) score += 2;
  if (product.product_name_fr) score += 1;
  return score;
}
async function fetchSearchVariant(query: string, pageSize: number): Promise<OpenFoodFactsProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
    page_size: String(Math.min(30, Math.max(pageSize, 16))),
    fields: OFF_FIELDS,
    sort_by: "unique_scans_n",
    lc: "fr",
    lang: "fr",
  });
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
  const data = await res.json() as { products?: OpenFoodFactsProduct[] };
  return data.products ?? [];
}

export async function searchOpenFoodFacts(query: string, pageSize = 12): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 3) return [];
  if (/^\d{8,14}$/.test(trimmed)) {
    const byBarcode = await fetchOpenFoodFactsByBarcode(trimmed);
    return byBarcode ? [byBarcode] : [];
  }
  const variants = queryVariants(trimmed);
  const products = (await Promise.all(variants.map(v => fetchSearchVariant(v, pageSize)))).flat();
  const bestVariant = variants[0] || trimmed;
  const byCode = new Map<string, OpenFoodFactsProduct>();
  products.forEach(p => {
    const key = p.code || `${p.product_name_fr || p.product_name}_${p.brands}`;
    if (!key) return;
    const current = byCode.get(key);
    if (!current || relevanceScore(p, bestVariant) > relevanceScore(current, bestVariant)) byCode.set(key, p);
  });
  return [...byCode.values()]
    .filter(p => p.product_name || p.product_name_fr || p.generic_name_fr || p.generic_name)
    .filter(hasNutrition)
    .map(p => ({ product: p, score: relevanceScore(p, bestVariant) }))
    .filter(x => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map(x => openFoodFactsProductToFood(x.product))
    .slice(0, pageSize);
}

export async function fetchOpenFoodFactsByBarcode(barcode: string): Promise<Food | null> {
  const params = new URLSearchParams({ fields: OFF_FIELDS, lc: "fr" });
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?${params.toString()}`);
  if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
  const data = await res.json() as { status?: number; product?: OpenFoodFactsProduct };
  if (!data.product || data.status === 0) return null;
  return openFoodFactsProductToFood(data.product);
}

export function openFoodFactsProductToFood(product: OpenFoodFactsProduct): Food {
  const name = product.product_name_fr || product.product_name || product.abbreviated_product_name_fr || product.generic_name_fr || product.generic_name || `Produit ${product.code}`;
  const nutriments = product.nutriments ?? {};
  const gramsPerServing = servingGrams(product);
  const pack = packageGrams(product) || gramsPerServing || 1;
  return {
    id: `off_${product.code || slugify(`${name}_${product.brands || ""}`)}`,
    name,
    category: categoryFor(product),
    state: "prepare",
    unit: gramsPerServing ? "piece" : "g",
    purchaseUnit: product.quantity ? `produit ${product.quantity}` : "produit",
    packageSize: pack,
    usableInRecipe: false,
    diets: inferDiets(name),
    allergens: mapOffAllergens(product),
    prices: defaultPrices(priceGuess(product)),
    macros: {
      kcal: Math.round(n(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"] ?? nutriments["energy-kj_100g"]) || 0),
      protein: n(nutriments.proteins_100g),
      carbs: n(nutriments.carbohydrates_100g),
      fat: n(nutriments.fat_100g),
      fiber: n(nutriments.fiber_100g),
    },
    micros: {
      sugars: n(nutriments.sugars_100g),
      salt: n(nutriments.salt_100g),
      sodium: n(nutriments.sodium_100g),
    },
    reliability: imageFor(product) && hasNutrition(product) ? "standard" : "estime",
    source: "openfoodfacts",
    sourceRef: imageFor(product)
      ? "Open Food Facts — produit de marque issu des étiquettes. Vérifie le code-barres si plusieurs produits se ressemblent."
      : "Open Food Facts — image absente dans la base. Vérifie le nom, la marque et le code-barres avant d'ajouter.",
    barcode: product.code,
    brand: product.brands,
    aliases: [product.code, product.brands, product.generic_name_fr, product.generic_name].filter(Boolean) as string[],
    icon: inferIcon(product),
    imageUrl: imageFor(product),
    servingLabel: gramsPerServing ? "portion" : undefined,
    servingGrams: gramsPerServing,
  } satisfies Food;
}
