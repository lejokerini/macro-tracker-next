import type { Food, Store } from "@/lib/types";
import { inferAllergens, inferDiets, STORES, normalizeFoodText } from "@/lib/food-engine";

// Un item renvoyé par l'analyse photo (Claude vision), valeurs TOTALES pour la portion estimée.
export type ScanItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: "high" | "medium" | "low";
};

export type ScanResponse = { items: ScanItem[] };

// Item éditable côté UI : on stocke les macros pour 100 g + la portion en grammes.
export type EditableScanItem = {
  uid: string;
  name: string;
  grams: number;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  confidence: "high" | "medium" | "low";
};

function round1(v: number) {
  return Math.round((Number.isFinite(v) ? v : 0) * 10) / 10;
}

function slug(s: string) {
  return normalizeFoodText(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

function neutralPrices(): Record<Store, number> {
  return Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<Store, number>);
}

function scanIcon(name: string) {
  const n = normalizeFoodText(name);
  if (/banane|pomme|orange|kiwi|fraise|fruit|raisin|poire|peche|pêche/.test(n)) return "🍎";
  if (/salade|brocoli|legume|légume|carotte|tomate|haricot|epinard|courgette/.test(n)) return "🥗";
  if (/poulet|boeuf|bœuf|steak|viande|porc|dinde|jambon/.test(n)) return "🍗";
  if (/poisson|saumon|thon|cabillaud|crevette/.test(n)) return "🐟";
  if (/riz|pates|pâtes|semoule|quinoa|pomme de terre|frite/.test(n)) return "🍚";
  if (/pain|baguette|sandwich|burger|pizza/.test(n)) return "🍔";
  if (/yaourt|fromage|lait|skyr/.test(n)) return "🥛";
  if (/gateau|gâteau|biscuit|chocolat|dessert|glace|cookie/.test(n)) return "🍰";
  return "📸";
}

// Convertit un item brut (valeurs portion) en item éditable (macros / 100 g).
export function toEditableItem(item: ScanItem): EditableScanItem {
  const grams = item.grams > 0 ? item.grams : 100;
  const factor = 100 / grams;
  return {
    uid: `${slug(item.name) || "item"}_${Math.random().toString(36).slice(2, 8)}`,
    name: item.name,
    grams: Math.round(grams),
    per100: {
      kcal: Math.round(item.kcal * factor),
      protein: round1(item.protein * factor),
      carbs: round1(item.carbs * factor),
      fat: round1(item.fat * factor),
      fiber: round1(item.fiber * factor),
    },
    confidence: item.confidence,
  };
}

// Construit un Food (compatible avec le reste de l'app) à partir d'un item scanné.
export function buildScannedFood(item: EditableScanItem): Food {
  const grams = item.grams > 0 ? item.grams : 100;
  return {
    id: `snap_${slug(item.name) || "plat"}_${Math.random().toString(36).slice(2, 8)}`,
    name: item.name,
    category: "Plats & photos CalSnap",
    state: "prepare",
    unit: "g",
    purchaseUnit: "portion",
    packageSize: Math.max(1, Math.round(grams)),
    usableInRecipe: false,
    diets: inferDiets(item.name),
    allergens: inferAllergens(item.name),
    prices: neutralPrices(),
    macros: {
      kcal: item.per100.kcal,
      protein: item.per100.protein,
      carbs: item.per100.carbs,
      fat: item.per100.fat,
      fiber: item.per100.fiber,
    },
    reliability: "estime",
    source: "estimated",
    sourceRef: "CalSnap · estimation par photo (Claude vision). Vérifie et ajuste la portion si besoin.",
    icon: scanIcon(item.name),
    aliases: [item.name],
  } satisfies Food;
}
