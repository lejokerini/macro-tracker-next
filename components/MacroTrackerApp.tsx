"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureCiqualLoaded, estimateServingGrams, findFood, foods, formatQuantity, isPieceInput, quantityToNutritionGrams, searchFoods, STORES } from "@/lib/food-engine";
import { average7, calculateTargets, logMacros, recipeMacros, sumIngredients, weightTrendRecommendation } from "@/lib/nutrition";
import { makeT, LANGS, type Lang } from "@/lib/i18n";
import { buildShoppingList, generateProgram, scoreProgram } from "@/lib/planner";
import { seedRecipes } from "@/data/recipes";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { searchOpenFoodFacts } from "@/lib/openfoodfacts";
import SnapModal from "@/components/SnapModal";
import BarcodeScanModal from "@/components/BarcodeScanModal";
import BodyFatModal from "@/components/BodyFatModal";
import MacroInfoModal, { type MacroKind } from "@/components/MacroInfoModal";
import CreateRecipeModal from "@/components/CreateRecipeModal";
import { buildScannedFood, type EditableScanItem } from "@/lib/calsnap";
import { CIQUAL_FOOD_COUNT } from "@/data/ciqual-meta";
import type { DietType, Food, MealLogItem, MealType, PantryItem, Profile, ProgramMeal, Recipe, Store, WeightLog } from "@/lib/types";

type Tab = "dashboard" | "profil" | "journal" | "catalogue" | "recettes" | "programme" | "courses" | "placard" | "poids" | "progres" | "sauvegarde";
type State = { profiles: Profile[]; activeProfileId?: string; logs: MealLogItem[]; pantry: PantryItem[]; weights: WeightLog[]; recipes: Recipe[]; program: ProgramMeal[]; offFoods: Food[]; favorites: string[]; water: Record<string, number>; premium?: boolean; lang?: Lang };
type MicroKey = "sugars" | "salt" | "calcium" | "iron" | "magnesium" | "potassium" | "sodium" | "zinc" | "vitA" | "vitD" | "vitE" | "vitC" | "vitB1" | "vitB2" | "vitB3" | "vitB6" | "vitB9" | "vitB12";

const STORAGE_KEY = "macro-tracker-next-v3";
const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];
const ALLERGENS = ["gluten","lait","oeufs","soja","fruits_a_coque","poisson","crustaces","mollusques","sesame","graines","moutarde","celeri","alcool"];
const ALLERGEN_LABELS: Record<string,string> = { gluten:"Gluten", lait:"Lait", oeufs:"Œufs", soja:"Soja", fruits_a_coque:"Fruits à coque", poisson:"Poisson", crustaces:"Crustacés", mollusques:"Mollusques", sesame:"Sésame", graines:"Graines & pépins", moutarde:"Moutarde", celeri:"Céleri", alcool:"Alcool" };
const emptyState: State = { profiles: [], logs: [], pantry: [], weights: [], recipes: seedRecipes, program: [], offFoods: [], favorites: [], water: {}, premium: false, lang: "fr" };
function hasUserData(state: State) {
  return state.profiles.length > 0 || state.logs.length > 0 || state.pantry.length > 0 || state.weights.length > 0 || state.program.length > 0;
}
function stateForCloud(state: State) {
  return { ...state, recipes: state.recipes?.length ? state.recipes : seedRecipes };
}
function migrateGoals(profiles: Profile[] = []): Profile[] {
  return profiles.map(p => ((p as unknown as { goal: string }).goal === "lean_bulk" ? { ...p, goal: "prise_masse" } : p));
}
function recipeIsSoyFree(r: Recipe) {
  return !r.ingredients.some(it => findFood(it.foodId)?.allergens.includes("soja"));
}
function currentFasting(p?: Profile): string {
  const raw = String(p?.fasting || (p?.intermittentFasting ? "window_pm" : "none"));
  return raw === "16_8" || raw === "18_6" || raw === "20_4" ? "window_pm" : raw;
}

type MicroInfo = { label: string; unit: string; group: "Vitamines" | "Minéraux" | "Autres"; rda: number; limit?: boolean; role: string; sources: string };
// rda = apport de référence adulte (valeurs de référence EFSA/UE, proches des recommandations OMS).
// limit = il s'agit d'un maximum à ne pas dépasser plutôt que d'une cible.
const MICRO_LABELS: Record<MicroKey, MicroInfo> = {
  sugars: { label: "Sucres", unit: "g", group: "Autres", rda: 50, limit: true, role: "Glucides simples, source d'énergie rapide. En excès (surtout sucres ajoutés), favorisent la prise de poids, les caries et les pics de glycémie.", sources: "Sodas, jus, confiseries, pâtisseries, fruits." },
  salt: { label: "Sel", unit: "g", group: "Autres", rda: 5, limit: true, role: "Apporte le sodium. En excès, augmente la tension artérielle et le risque cardiovasculaire. L'OMS recommande moins de 5 g/jour.", sources: "Plats préparés, charcuterie, pain, fromage, snacks." },
  calcium: { label: "Calcium", unit: "mg", group: "Minéraux", rda: 1000, role: "Construction des os et des dents, contraction musculaire, coagulation et transmission nerveuse.", sources: "Produits laitiers, légumes verts, amandes, eaux calciques." },
  iron: { label: "Fer", unit: "mg", group: "Minéraux", rda: 14, role: "Transport de l'oxygène dans le sang (hémoglobine) et production d'énergie. Un manque cause fatigue et anémie.", sources: "Viande rouge, boudin, légumineuses, épinards." },
  magnesium: { label: "Magnésium", unit: "mg", group: "Minéraux", rda: 375, role: "Fonction musculaire et nerveuse, production d'énergie, réduit la fatigue. Souvent insuffisant.", sources: "Chocolat noir, oléagineux, céréales complètes, légumineuses." },
  potassium: { label: "Potassium", unit: "mg", group: "Minéraux", rda: 3500, role: "Équilibre hydrique, régulation de la tension, fonction musculaire et nerveuse. Contrebalance le sodium.", sources: "Banane, pomme de terre, légumineuses, légumes." },
  sodium: { label: "Sodium", unit: "mg", group: "Minéraux", rda: 2000, limit: true, role: "Équilibre hydrique et influx nerveux. Vient surtout du sel ; à limiter pour la tension.", sources: "Sel, plats préparés, charcuterie, fromage." },
  zinc: { label: "Zinc", unit: "mg", group: "Minéraux", rda: 10, role: "Immunité, cicatrisation, synthèse des protéines, fertilité et testostérone.", sources: "Viande, fruits de mer (huîtres), graines, légumineuses." },
  vitA: { label: "Vit. A", unit: "µg", group: "Vitamines", rda: 800, role: "Vision (surtout nocturne), santé de la peau et des muqueuses, immunité.", sources: "Foie, œufs, beurre, carotte et patate douce (béta-carotène)." },
  vitD: { label: "Vit. D", unit: "µg", group: "Vitamines", rda: 15, role: "Fixation du calcium sur les os, immunité, humeur. Très souvent déficitaire en hiver.", sources: "Poissons gras, jaune d'œuf, exposition au soleil." },
  vitE: { label: "Vit. E", unit: "mg", group: "Vitamines", rda: 12, role: "Antioxydant : protège les cellules du vieillissement et les membranes.", sources: "Huiles végétales, oléagineux, avocat." },
  vitC: { label: "Vit. C", unit: "mg", group: "Vitamines", rda: 80, role: "Immunité, antioxydant, formation du collagène, et améliore l'absorption du fer végétal.", sources: "Agrumes, kiwi, poivron, fruits rouges, persil." },
  vitB1: { label: "B1", unit: "mg", group: "Vitamines", rda: 1.1, role: "Transforme les glucides en énergie ; essentielle au système nerveux.", sources: "Céréales complètes, porc, légumineuses." },
  vitB2: { label: "B2", unit: "mg", group: "Vitamines", rda: 1.4, role: "Production d'énergie, santé de la peau, des yeux et des muqueuses.", sources: "Produits laitiers, œufs, abats, amandes." },
  vitB3: { label: "B3", unit: "mg", group: "Vitamines", rda: 16, role: "Métabolisme énergétique, peau et système nerveux.", sources: "Viande, poisson, céréales, cacahuètes." },
  vitB6: { label: "B6", unit: "mg", group: "Vitamines", rda: 1.4, role: "Métabolisme des protéines et fabrication des neurotransmetteurs (humeur).", sources: "Viande, poisson, banane, pomme de terre." },
  vitB9: { label: "B9", unit: "µg", group: "Vitamines", rda: 330, role: "Renouvellement cellulaire et formation du sang. Cruciale avant et pendant la grossesse.", sources: "Légumes verts à feuilles, légumineuses, foie." },
  vitB12: { label: "B12", unit: "µg", group: "Vitamines", rda: 2.5, role: "Formation des globules rouges et fonctionnement du système nerveux. Absente des végétaux : à supplémenter si vegan.", sources: "Viande, poisson, œufs, produits laitiers." },
};
const MICRO_ORDER = Object.keys(MICRO_LABELS) as MicroKey[];

function uid(prefix="id") { return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`; }
function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function today() { return isoLocal(new Date()); }
function cleanNumber(value: number) { return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 100) / 100; }
function frNum(v: FormDataEntryValue | string | null | undefined, fallback: number) {
  const x = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(x) ? x : fallback;
}
// Convertit une quantité saisie (pièce / g / cl) en grammes pour les calculs.
function qtyToGrams(food: Food | undefined, qty: number, unit: "piece" | "g" | "cl") {
  if (!food) return qty;
  if (unit === "piece") return qty * estimateServingGrams(food);
  if (unit === "cl") return qty * 10;
  return qty;
}

function macrosFromBaseGrams(food: Food | undefined, baseGrams: number) {
  const ratio = Math.max(0, Number.isFinite(baseGrams) ? baseGrams : 0) / 100;
  if (!food) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 };
  return {
    kcal: Math.round(food.macros.kcal * ratio),
    protein: +(food.macros.protein * ratio).toFixed(1),
    carbs: +(food.macros.carbs * ratio).toFixed(1),
    fat: +(food.macros.fat * ratio).toFixed(1),
    fiber: +(food.macros.fiber * ratio).toFixed(1),
    grams: Math.round(baseGrams),
  };
}
function scaledMicrosFromBase(food: Food | undefined, baseGrams: number) {
  if (!food?.micros) return {} as Partial<Record<MicroKey, number>>;
  const ratio = baseGrams / 100;
  return Object.fromEntries(Object.entries(food.micros).map(([k,v]) => [k, cleanNumber(Number(v || 0) * ratio)])) as Partial<Record<MicroKey, number>>;
}
function dayMicros(logs: MealLogItem[], date: string) {
  const out: Partial<Record<MicroKey, number>> = {};
  logs.filter(l => l.date === date).forEach(l => {
    const f = findFood(l.foodId);
    const micros = scaledMicrosFromBase(f, l.qty);
    Object.entries(micros).forEach(([k, v]) => { out[k as MicroKey] = cleanNumber((out[k as MicroKey] || 0) + Number(v || 0)); });
  });
  return out;
}
function recipeScaledMacros(recipe: Recipe, servingTarget: number) {
  const factor = servingTarget / Math.max(1, recipe.servings);
  const base = sumIngredients(recipe.ingredients.map(i => ({ foodId: i.foodId, qty: i.qty * factor })));
  return { kcal: Math.round(base.kcal), protein: Math.round(base.protein), carbs: Math.round(base.carbs), fat: Math.round(base.fat), fiber: Math.round(base.fiber) };
}
function defaultRecipeSteps(recipe: Recipe) {
  const generic = recipe.instructions.join(" ").toLowerCase().includes("préparer les ingrédients");
  if (!generic && recipe.instructions.length > 2) return recipe.instructions;
  const ingredientNames = recipe.ingredients.map(i => findFood(i.foodId)?.name).filter(Boolean).slice(0, 6).join(", ");
  const cold = recipe.tags.some(t => ["froid", "salade", "rapide", "frais"].includes(t.toLowerCase()));
  return [
    `Préparer et peser les ingrédients : ${ingredientNames}.`,
    "Laver, éplucher et découper les fruits ou légumes si nécessaire.",
    cold ? "Assembler les ingrédients froids dans un bol ou une assiette." : "Cuire séparément les féculents et/ou légumes selon leur temps de cuisson.",
    cold ? "Ajouter la source de protéines, l'assaisonnement et mélanger doucement." : "Cuire ou réchauffer la source de protéines, puis assembler avec les légumes et féculents.",
    "Assaisonner progressivement, goûter, puis ajuster sel, poivre, épices, herbes ou citron.",
    `Servir immédiatement ou conserver au frais jusqu'à ${recipe.storageDays} jour(s) dans une boîte hermétique.`
  ];
}

export default function MacroTrackerApp() {
  const [state, setState] = useState<State>(emptyState);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [date, setDate] = useState(today());
  const [copyDate, setCopyDate] = useState(today());
  const [progressPeriod, setProgressPeriod] = useState(7);
  const [weightInput, setWeightInput] = useState("");
  const [pantryQuery, setPantryQuery] = useState("");
  const [pantrySelectedFood, setPantrySelectedFood] = useState("");
  const [pantryQty, setPantryQty] = useState(100);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bmiInfoOpen, setBmiInfoOpen] = useState(false);
  const [metabInfoOpen, setMetabInfoOpen] = useState(false);
  const [hydrInfoOpen, setHydrInfoOpen] = useState(false);
  const [kcalInfoOpen, setKcalInfoOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedMeal, setSelectedMeal] = useState<MealType>("Déjeuner");
  const [selectedFood, setSelectedFood] = useState("");
  const [qty, setQty] = useState(100);
  const [journalUnit, setJournalUnit] = useState<"piece" | "g" | "cl">("g");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeMealFilter, setRecipeMealFilter] = useState<"all" | MealType>("all");
  const [onlyMealPrep, setOnlyMealPrep] = useState(false);
  const [onlySoyFree, setOnlySoyFree] = useState(false);
  const [createRecipeOpen, setCreateRecipeOpen] = useState(false);
  const [ciqualReady, setCiqualReady] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState(seedRecipes[0]?.id || "");
  const [recipeServings, setRecipeServings] = useState(1);
  const [servingsText, setServingsText] = useState("");
  const [servingsFocused, setServingsFocused] = useState(false);
  const [checkedRecipeItems, setCheckedRecipeItems] = useState<Record<string, boolean>>({});
  const [offResults, setOffResults] = useState<Food[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState("");
  const [snapOpen, setSnapOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bodyFat, setBodyFat] = useState("");
  const [bfModalOpen, setBfModalOpen] = useState(false);
  const [macroInfo, setMacroInfo] = useState<MacroKind | null>(null);
  const [microDetail, setMicroDetail] = useState<MicroKey | null>(null);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gentleStart, setGentleStart] = useState(true);
  const [syncStatus, setSyncStatus] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [lastCloudSaveAt, setLastCloudSaveAt] = useState<string>("");
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextAutoSave = useRef(false);

  const dynamicFoods = useMemo(() => {
    const map = new Map<string, Food>();
    [...(state.offFoods || []), ...offResults].forEach(f => map.set(f.id, f));
    return [...map.values()];
  }, [state.offFoods, offResults]);
  const allFoods = useMemo(() => [...dynamicFoods, ...foods], [dynamicFoods, ciqualReady]);
  function findFoodAny(id?: string) { return id ? allFoods.find(f => f.id === id) : undefined; }
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: Food[] = [];
    for (let i = state.logs.length - 1; i >= 0 && out.length < 10; i--) {
      const id = state.logs[i].foodId;
      if (seen.has(id)) continue;
      seen.add(id);
      const f = allFoods.find(x => x.id === id);
      if (f) out.push(f);
    }
    return out;
  }, [state.logs, allFoods]);
  const favoriteFoods = useMemo(() => (state.favorites || []).map(id => allFoods.find(f => f.id === id)).filter((f): f is Food => !!f), [state.favorites, allFoods]);

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  const targets = activeProfile ? calculateTargets(activeProfile) : null;
  const waterGoal = activeProfile ? Math.max(1500, Math.round(activeProfile.weightKg * 35)) : 2000;
  const lang: Lang = state.lang || "fr";
  const tr = makeT(lang);
  const latestWeight = state.weights.length ? [...state.weights].sort((a, b) => a.date.localeCompare(b.date))[state.weights.length - 1].weightKg : activeProfile?.weightKg;
  const bmi = activeProfile && latestWeight && activeProfile.heightCm > 0 ? latestWeight / Math.pow(activeProfile.heightCm / 100, 2) : null;
  const categories = useMemo(() => ["all", ...Array.from(new Set(foods.map(f => f.category))).sort((a,b)=>a.localeCompare(b,"fr"))], [ciqualReady]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...emptyState, ...parsed, recipes: parsed.recipes?.length ? parsed.recipes : seedRecipes };
        setState({ ...merged, profiles: migrateGoals(merged.profiles) });
      } catch {}
    }
    const rawAutoSync = localStorage.getItem(`${STORAGE_KEY}:autoSync`);
    if (rawAutoSync) setAutoSync(rawAutoSync !== "false");
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem(`${STORAGE_KEY}:autoSync`, String(autoSync)); }, [autoSync]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCloudHydrated(false);
      if (!nextSession) {
        setLastCloudSaveAt("");
        setSyncStatus("");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const staticVisibleFoods = useMemo(() => searchFoods(query, { category, diet: activeProfile?.diet, excludeAllergens: activeProfile?.allergies }), [query, category, activeProfile?.diet, activeProfile?.allergies, ciqualReady]);
  const pantryOptions = useMemo(() => searchFoods(pantryQuery, { diet: activeProfile?.diet, excludeAllergens: activeProfile?.allergies }).slice(0, 300), [pantryQuery, activeProfile?.diet, activeProfile?.allergies, ciqualReady]);
  const pantrySelectedObj = pantrySelectedFood ? findFoodAny(pantrySelectedFood) : undefined;
  useEffect(() => {
    if (!pantryOptions.length) { if (pantrySelectedFood) setPantrySelectedFood(""); return; }
    if (!pantryOptions.some(f => f.id === pantrySelectedFood)) setPantrySelectedFood(pantryOptions[0].id);
  }, [pantryOptions, pantrySelectedFood]);
  useEffect(() => { if (pantrySelectedObj) setPantryQty(isPieceInput(pantrySelectedObj) ? 1 : 100); }, [pantrySelectedObj?.id]);
  const visibleFoods = useMemo(() => {
    const map = new Map<string, Food>();
    if (category === "all" || category.startsWith("Produit de marque")) offResults.forEach(f => map.set(f.id, f));
    staticVisibleFoods.forEach(f => map.set(f.id, f));
    return [...map.values()];
  }, [staticVisibleFoods, offResults, category]);
  const foodOptions = useMemo(() => visibleFoods.slice(0, 300), [visibleFoods]);
  useEffect(() => {
    if (foodOptions.length === 0) { if (selectedFood) setSelectedFood(""); return; }
    if (!foodOptions.some(f => f.id === selectedFood)) setSelectedFood(foodOptions[0].id);
  }, [foodOptions, selectedFood]);
  useEffect(() => {
    const q = query.trim();
    setOffError("");
    if (q.length < 3) { setOffResults([]); setOffLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setOffLoading(true);
        const results = await searchOpenFoodFacts(q, 10);
        if (!controller.signal.aborted) setOffResults(results);
      } catch (error) {
        if (!controller.signal.aborted) {
          setOffResults([]);
          setOffError("Recherche Open Food Facts indisponible pour le moment.");
        }
      } finally {
        if (!controller.signal.aborted) setOffLoading(false);
      }
    }, 450);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);
  const selectedFoodObj = selectedFood ? findFoodAny(selectedFood) : undefined;
  useEffect(() => {
    if (!selectedFoodObj) return;
    const u: "piece" | "g" | "cl" = isPieceInput(selectedFoodObj) ? "piece" : selectedFoodObj.unit === "ml" ? "cl" : "g";
    setJournalUnit(u);
    setQty(u === "piece" ? 1 : u === "cl" ? 25 : 100);
  }, [selectedFoodObj?.id]);
  function changeJournalUnit(u: "piece" | "g" | "cl") {
    setJournalUnit(u);
    setQty(u === "piece" ? 1 : u === "cl" ? 25 : 100);
  }

  const selectedBaseGrams = qtyToGrams(selectedFoodObj, qty, journalUnit);
  const selectedPreview = macrosFromBaseGrams(selectedFoodObj, selectedBaseGrams);
  const selectedMicros = scaledMicrosFromBase(selectedFoodObj, selectedBaseGrams);
  const dayLogs = state.logs.filter(l => l.date === date);
  const totals = useMemo(() => {
    return state.logs.filter(l => l.date === date).reduce((acc, l) => {
      const f = findFoodAny(l.foodId);
      const m = macrosFromBaseGrams(f, l.qty);
      return { kcal: acc.kcal + m.kcal, protein: +(acc.protein + m.protein).toFixed(1), carbs: +(acc.carbs + m.carbs).toFixed(1), fat: +(acc.fat + m.fat).toFixed(1), fiber: +(acc.fiber + m.fiber).toFixed(1) };
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  }, [state.logs, date, allFoods]);
  const microsToday = useMemo(() => {
    const out: Partial<Record<MicroKey, number>> = {};
    state.logs.filter(l => l.date === date).forEach(l => {
      const micros = scaledMicrosFromBase(findFoodAny(l.foodId), l.qty);
      Object.entries(micros).forEach(([k, v]) => { out[k as MicroKey] = cleanNumber((out[k as MicroKey] || 0) + Number(v || 0)); });
    });
    return out;
  }, [state.logs, date, allFoods]);
  const streak = useMemo(() => {
    const set = new Set(state.logs.map(l => l.date));
    let s = 0;
    const d = new Date();
    if (!set.has(isoLocal(d))) d.setDate(d.getDate() - 1);
    while (set.has(isoLocal(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }, [state.logs]);
  const history = useMemo(() => {
    const period = progressPeriod;
    const start = new Date(); start.setDate(start.getDate() - (period - 1));
    const startIso = isoLocal(start);
    const byDate = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
    state.logs.forEach(l => {
      if (l.date < startIso) return;
      const m = macrosFromBaseGrams(findFoodAny(l.foodId), l.qty);
      const cur = byDate.get(l.date) || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      cur.kcal += m.kcal; cur.protein += m.protein; cur.carbs += m.carbs; cur.fat += m.fat;
      byDate.set(l.date, cur);
    });
    const loggedDays = [...byDate.values()];
    const daysLogged = loggedDays.length;
    const sum = loggedDays.reduce((a, d) => ({ kcal: a.kcal + d.kcal, protein: a.protein + d.protein, carbs: a.carbs + d.carbs, fat: a.fat + d.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const avg = daysLogged ? { kcal: Math.round(sum.kcal / daysLogged), protein: Math.round(sum.protein / daysLogged), carbs: Math.round(sum.carbs / daysLogged), fat: Math.round(sum.fat / daysLogged) } : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    let calOk = 0, protOk = 0;
    if (targets) loggedDays.forEach(d => {
      if (Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1) calOk++;
      if (d.protein >= targets.protein * 0.9) protOk++;
    });
    const pctCal = daysLogged ? Math.round((calOk / daysLogged) * 100) : 0;
    const pctProt = daysLogged ? Math.round((protOk / daysLogged) * 100) : 0;
    const bucketDays = period <= 30 ? 1 : period <= 182 ? 7 : 30;
    const nBuckets = Math.ceil(period / bucketDays);
    const points: { kcal: number; label: string }[] = [];
    for (let b = 0; b < nBuckets; b++) {
      let bs = 0, bc = 0, lastIso = "";
      for (let k = 0; k < bucketDays; k++) {
        const off = b * bucketDays + k;
        if (off >= period) break;
        const dd = new Date(start); dd.setDate(start.getDate() + off);
        lastIso = isoLocal(dd);
        const dv = byDate.get(lastIso);
        if (dv) { bs += dv.kcal; bc++; }
      }
      points.push({ kcal: bc ? Math.round(bs / bc) : 0, label: lastIso.slice(5) });
    }
    return { avg, daysLogged, daysInPeriod: period, pctCal, pctProt, points };
  }, [state.logs, progressPeriod, targets, allFoods]);
  const programScore = activeProfile && targets ? scoreProgram(state.program, state.recipes, targets, activeProfile.weeklyBudget, activeProfile.store) : null;
  const shopping = activeProfile ? buildShoppingList(state.program, state.recipes, state.pantry, activeProfile.store) : [];

  const filteredRecipes = useMemo(() => state.recipes.filter(r => {
    const q = recipeQuery.trim().toLowerCase();
    if (recipeMealFilter !== "all" && r.mealType !== recipeMealFilter) return false;
    if (onlyMealPrep && !r.tags.some(t => t.toLowerCase().includes("meal prep"))) return false;
    if (onlySoyFree && !recipeIsSoyFree(r)) return false;
    if (q && !`${r.title} ${r.tags.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  }), [state.recipes, recipeQuery, recipeMealFilter, onlyMealPrep, onlySoyFree]);
  const selectedRecipe = state.recipes.find(r => r.id === selectedRecipeId) || filteredRecipes[0] || state.recipes[0];
  const recipeSteps = selectedRecipe ? defaultRecipeSteps(selectedRecipe) : [];
  const selectedRecipeMacros = selectedRecipe ? recipeScaledMacros(selectedRecipe, recipeServings) : null;

  function saveProfile(form: FormData) {
    const profileId = String(form.get("profileId") || "");
    const profile: Profile = {
      id: profileId || uid("profile"), firstName: String(form.get("firstName") || "Antoine"), lastName: String(form.get("lastName") || "Dupont"),
      sex: form.get("sex") as Profile["sex"], age: Number(form.get("age") || 25), heightCm: Number(form.get("heightCm") || 175), weightKg: frNum(form.get("weightKg"), 70),
      bodyFatPct: frNum(form.get("bodyFatPct"), 0) || undefined, activity: Number(form.get("activity") || 1.55), goal: form.get("goal") as Profile["goal"], proteinPerKg: frNum(form.get("proteinPerKg"), 0) || undefined, customBmr: frNum(form.get("customBmr"), 0) || undefined, customKcal: frNum(form.get("customKcal"), 0) || undefined, diet: form.get("diet") as DietType,
      weeklyBudget: Number(form.get("weeklyBudget") || 75), store: form.get("store") as Store, allergies: ALLERGENS.filter(a => form.get(`allergy_${a}`)),
      dislikedFoods: String(form.get("dislikedFoods") || "").split(",").map(x=>x.trim()).filter(Boolean), likedFoods: String(form.get("likedFoods") || "").split(",").map(x=>x.trim()).filter(Boolean),
      trainingDays: [1,2,3,4,5,6,0].filter(d => form.get(`day_${d}`)), fasting: (form.get("fasting") as Profile["fasting"]) || "none", maxPrepTime: Number(form.get("maxPrepTime") || 30), cookingLevel: form.get("cookingLevel") as Profile["cookingLevel"],
    };
    setState(s => {
      const exists = s.profiles.some(p => p.id === profile.id);
      return { ...s, profiles: exists ? s.profiles.map(p => p.id === profile.id ? profile : p) : [...s.profiles, profile], activeProfileId: profile.id };
    });
    setTab("dashboard");
  }
  function rememberOpenFoodFactsFood(food: Food) {
    if (food.source !== "openfoodfacts") return;
    setState(s => s.offFoods?.some(f => f.id === food.id) ? s : { ...s, offFoods: [...(s.offFoods || []), food] });
  }
  function addFoodLog() {
    const food = selectedFood ? findFoodAny(selectedFood) : undefined;
    if (!food || !foodOptions.some(f => f.id === selectedFood)) { showToast("Choisis un aliment valide dans la liste."); return; }
    const baseQty = qtyToGrams(food, qty, journalUnit);
    rememberOpenFoodFactsFood(food);
    setState(s => ({ ...s, offFoods: food.source === "openfoodfacts" && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []), logs: [...s.logs, { id: uid("log"), foodId: selectedFood, qty: baseQty, displayQty: qty, displayUnit: journalUnit, meal: selectedMeal, date }] }));
  }
  function addCustomRecipe(recipe: Recipe) {
    setState(s => ({ ...s, recipes: [recipe, ...s.recipes] }));
    setSelectedRecipeId(recipe.id);
    setRecipeServings(recipe.servings);
    setTab("recettes");
  }
  function deleteRecipe(id: string) {
    if (!confirm("Supprimer cette recette ?")) return;
    setState(s => ({ ...s, recipes: s.recipes.filter(r => r.id !== id) }));
  }
  function addRecipeToJournal(recipe: Recipe) {
    const factor = recipeServings / Math.max(1, recipe.servings);
    const items: MealLogItem[] = recipe.ingredients.map(i => ({ id: uid("log"), foodId: i.foodId, qty: i.qty * factor, displayQty: i.qty * factor, displayUnit: "g", meal: recipe.mealType, date }));
    setState(s => ({ ...s, logs: [...s.logs, ...items] }));
    showToast(`Recette ajoutée : ${recipe.title}`);
  }
  function addScannedItems(items: EditableScanItem[], mealForItems: MealType) {
    if (!items.length) return;
    const newFoods: Food[] = [];
    const newLogs: MealLogItem[] = [];
    items.forEach(it => {
      const food = buildScannedFood(it);
      newFoods.push(food);
      newLogs.push({ id: uid("log"), foodId: food.id, qty: it.grams, displayQty: it.grams, displayUnit: "g", meal: mealForItems, date });
    });
    setState(s => ({ ...s, offFoods: [...(s.offFoods || []), ...newFoods], logs: [...s.logs, ...newLogs] }));
    setTab("journal");
  }
  function addBarcodeFood(food: Food, baseGrams: number, displayQty: number, displayUnit: "piece" | "g" | "cl", mealForItem: MealType) {
    setState(s => ({
      ...s,
      offFoods: (s.offFoods || []).some(f => f.id === food.id) ? (s.offFoods || []) : [...(s.offFoods || []), food],
      logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: baseGrams, displayQty, displayUnit, meal: mealForItem, date }],
    }));
    setTab("journal");
  }
  function quickAddFood(food: Food) {
    const q = isPieceInput(food) ? 1 : 100;
    const baseQty = quantityToNutritionGrams(food, q);
    setState(s => ({
      ...s,
      offFoods: (food.source === "openfoodfacts" || food.source === "estimated") && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []),
      logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: baseQty, displayQty: q, displayUnit: isPieceInput(food) ? "piece" : food.unit, meal: selectedMeal, date }],
    }));
  }
  function toggleFavorite(food: Food) {
    setState(s => {
      const favs = s.favorites || [];
      const isFav = favs.includes(food.id);
      const nextFavs = isFav ? favs.filter(x => x !== food.id) : [...favs, food.id];
      const needsPersist = !isFav && (food.source === "openfoodfacts" || food.source === "estimated") && !(s.offFoods || []).some(f => f.id === food.id);
      return { ...s, favorites: nextFavs, offFoods: needsPersist ? [...(s.offFoods || []), food] : (s.offFoods || []) };
    });
  }
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }
  function removeLog(id: string) { setState(s => ({ ...s, logs: s.logs.filter(x=>x.id!==id) })); }
  function adjustLog(log: MealLogItem, deltaDisplay: number) {
    const food = findFoodAny(log.foodId);
    const isPiece = log.displayUnit === "piece";
    const curDisplay = typeof log.displayQty === "number" ? log.displayQty : (isPiece && food ? log.qty / estimateServingGrams(food) : log.qty);
    const nextDisplay = Math.max(0, Math.round((curDisplay + deltaDisplay) * 10) / 10);
    if (nextDisplay <= 0) { removeLog(log.id); return; }
    const baseQty = quantityToNutritionGrams(food, nextDisplay);
    setState(s => ({ ...s, logs: s.logs.map(x => x.id === log.id ? { ...x, qty: baseQty, displayQty: nextDisplay } : x) }));
  }
  function duplicateDay(target: string) {
    const dayLogsNow = state.logs.filter(l => l.date === date);
    if (!dayLogsNow.length) { showToast("Rien à dupliquer pour ce jour."); return; }
    if (target === date) { showToast("Choisis une date différente."); return; }
    const copies = dayLogsNow.map(l => ({ ...l, id: uid("log"), date: target }));
    setState(s => ({ ...s, logs: [...s.logs, ...copies] }));
    showToast(`Journal copié vers le ${target}.`);
  }
  function generate() { if(!activeProfile) return; setState(s => ({ ...s, program: generateProgram(activeProfile, s.recipes, 7, gentleStart) })); setTab("programme"); }
  function addPantry(foodId: string, q: number) {
    const food = foodId ? findFoodAny(foodId) : undefined;
    if (!food) { showToast("Choisis un aliment valide."); return; }
    const baseQty = quantityToNutritionGrams(food, q);
    setState(s => ({ ...s, offFoods: food.source === "openfoodfacts" && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []), pantry: [...s.pantry, { id: uid("pantry"), foodId, qty: baseQty, unit: food.unit, displayQty: q, displayUnit: isPieceInput(food) ? "piece" : food.unit }] }));
  }
  function addWeight(w: number) { setState(s => ({ ...s, weights: [...s.weights, { id: uid("weight"), date: today(), weightKg: w, note: "Pesée à jeun" }] })); }
  function addWater(ml: number) {
    setState(s => {
      const cur = (s.water || {})[date] || 0;
      return { ...s, water: { ...(s.water || {}), [date]: Math.max(0, cur + ml) } };
    });
  }
  function exportJson() { const blob = new Blob([JSON.stringify(state,null,2)], { type:"application/json" }); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="macro-tracker-backup.json"; a.click(); URL.revokeObjectURL(a.href); }
  function importJson(file: File | null) { if(!file) return; file.text().then(t => { try { const parsed = JSON.parse(t); const merged = { ...emptyState, ...parsed }; setState({ ...merged, profiles: migrateGoals(merged.profiles) }); showToast("Sauvegarde importée."); } catch { showToast("Fichier invalide."); } }); }
  async function signUp() {
    if (!supabase) { setAuthMessage("Supabase n'est pas encore configuré."); return; }
    setAuthMessage("Création du compte...");
    const { error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
    setAuthMessage(error ? error.message : "Compte créé. Si la confirmation email est activée, vérifie ta boîte mail.");
  }
  async function signIn() {
    if (!supabase) { setAuthMessage("Supabase n'est pas encore configuré."); return; }
    setAuthMessage("Connexion...");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    setAuthMessage(error ? error.message : "Connecté.");
  }
  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthMessage("Déconnecté. Les données locales restent sur ce navigateur.");
  }
  async function deleteAccount() {
    if (!confirm("Supprimer DÉFINITIVEMENT ton compte et toutes tes données ? Cette action est irréversible.")) return;
    try {
      if (supabase && session?.user) {
        await supabase.from("app_states").delete().eq("user_id", session.user.id);
        try {
          const token = session.access_token;
          if (token) await fetch("/api/delete-account", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        } catch {}
        await supabase.auth.signOut();
      }
    } catch {}
    suppressNextAutoSave.current = true;
    setState(emptyState);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    showToast("Compte et données supprimés.");
  }
  async function persistCloud(mode: "manual" | "auto" = "manual") {
    if (!supabase || !session?.user) { setSyncStatus("Connecte-toi avant de sauvegarder dans le cloud."); return false; }
    if (!hasUserData(state)) { if (mode === "manual") setSyncStatus("Rien à sauvegarder pour le moment."); return false; }
    if (mode === "manual") setSyncStatus("Sauvegarde cloud en cours...");
    const savedAt = new Date().toISOString();
    const { error } = await supabase.from("app_states").upsert({ user_id: session.user.id, data: stateForCloud(state), updated_at: savedAt });
    if (error) { setSyncStatus(`Erreur cloud : ${error.message}`); return false; }
    setLastCloudSaveAt(savedAt);
    setSyncStatus(mode === "auto" ? `Auto-sauvegardé à ${new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.` : "Sauvegarde cloud terminée.");
    return true;
  }
  async function saveCloud() { await persistCloud("manual"); }
  async function fetchCloud(confirmBeforeReplace: boolean) {
    if (!supabase || !session?.user) { setSyncStatus("Connecte-toi avant de charger la sauvegarde cloud."); return; }
    if (confirmBeforeReplace && !confirm("Charger la sauvegarde cloud remplacera les données locales de ce navigateur. Continuer ?")) return;
    setSyncStatus("Chargement cloud...");
    const { data, error } = await supabase.from("app_states").select("data, updated_at").eq("user_id", session.user.id).maybeSingle();
    if (error) { setSyncStatus(`Erreur cloud : ${error.message}`); setCloudHydrated(true); return; }
    if (!data?.data) { setSyncStatus("Aucune sauvegarde cloud trouvée pour ce compte."); setCloudHydrated(true); return; }
    const next = data.data as State;
    suppressNextAutoSave.current = true;
    setState({ ...emptyState, ...next, profiles: migrateGoals(next.profiles), recipes: next.recipes?.length ? next.recipes : seedRecipes });
    setLastCloudSaveAt(data.updated_at || "");
    setCloudHydrated(true);
    setSyncStatus(`Sauvegarde cloud chargée${data.updated_at ? ` (${new Date(data.updated_at).toLocaleString("fr-FR")})` : ""}.`);
  }
  async function loadCloud() { await fetchCloud(true); }
  useEffect(() => {
    if (!supabase || !session?.user || cloudHydrated || hasUserData(state)) return;
    fetchCloud(false);
  }, [supabase, session?.user?.id, cloudHydrated]);
  useEffect(() => {
    if (!supabase || !session?.user || !autoSync || !hasUserData(state)) return;
    if (suppressNextAutoSave.current) { suppressNextAutoSave.current = false; return; }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { persistCloud("auto"); }, 1600);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [state, autoSync, session?.user?.id, supabase]);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("calsnap-theme"); } catch {}
    const prefersDark = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    const next: "light" | "dark" = stored === "dark" || stored === "light" ? stored : (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, []);
  useEffect(() => { setBodyFat(activeProfile?.bodyFatPct ? String(activeProfile.bodyFatPct) : ""); }, [activeProfile?.id]);
  useEffect(() => { ensureCiqualLoaded().then(() => setCiqualReady(true)); }, []);
  function toggleTheme() {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("calsnap-theme", next); } catch {}
      return next;
    });
  }
  function toggleRecipeItem(key: string) { setCheckedRecipeItems(s => ({ ...s, [key]: !s[key] })); }
  function resetRecipeTracking() { setCheckedRecipeItems({}); }

  return <main className="app">
    <header className="header hero">
      <div className="brand">
        <div className="brand-head"><img className="brand-logo" src="/logo-mark.svg" alt="Macrolens" width={56} height={56} /><h1>Macro<span>lens</span></h1></div>
        <div className="hero-badges">
          {streak > 0 && <span className="badge-streak">🔥 {streak} j de suite</span>}
          <span>{CIQUAL_FOOD_COUNT.toLocaleString("fr-FR")} aliments Ciqual</span>
          <span>{seedRecipes.length} recettes</span>
          <span>Quantités ajustables</span>
        </div>
      </div>
      <div className="profile-card">
        <span className="muted">Profil actif</span>
        {activeProfile ? <><strong>{activeProfile.firstName} {activeProfile.lastName}</strong><br/><span className="muted">{activeProfile.diet} · {STORES[activeProfile.store].label} · budget {activeProfile.weeklyBudget} €/sem</span></> : <><strong>Aucun profil</strong><br/><span className="muted">Crée un profil pour personnaliser les calculs.</span></>}
        <span className="cloud-mini">{session?.user ? `Cloud connecté · ${autoSync ? "auto-save ON" : "auto-save OFF"}` : supabase ? "Cloud prêt · non connecté" : "Cloud non configuré"}</span>
      </div>
    </header>
    <nav className="tabs">{(["dashboard","profil","journal","catalogue","recettes","programme","courses","placard","poids","progres","sauvegarde"] as Tab[]).map(t => <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{tr("tab."+t)}</button>)}<button className="theme-toggle" onClick={toggleTheme} aria-label="Basculer le thème clair/sombre">{theme === "dark" ? tr("theme.light") : tr("theme.dark")}</button></nav>

    {tab === "dashboard" && <section className="grid">
      {!activeProfile && <div className="card span-12 onboarding-card"><h2>{tr("onboarding.welcome")}</h2><p className="muted">{tr("onboarding.text")}</p><div className="row" style={{marginTop:8}}><button className="btn" onClick={()=>setTab("profil")}>{tr("onboarding.createProfile")}</button><button className="btn secondary" onClick={()=>setSnapOpen(true)}>{tr("onboarding.trySnap")}</button></div></div>}
      <div className="card span-4 chart-card"><h3>{tr("dash.calories")} <button type="button" className="info-link" onClick={()=>setKcalInfoOpen(true)} aria-label="Comment les calories du jour sont calculées">ⓘ</button></h3><ProgressRing value={totals.kcal} max={targets?.kcal || 0} color="var(--primary-2)" top={`${totals.kcal}`} bottom={targets ? `/ ${targets.kcal}` : "kcal"} /><span className="chart-foot">{targets ? `${Math.max(0, targets.kcal - totals.kcal)} kcal restantes` : "Crée un profil pour ta cible"}</span></div>
      <div className="card span-4 chart-card"><h3>{tr("dash.macros")}</h3><MacroPie protein={totals.protein} carbs={totals.carbs} fat={totals.fat} /><div className="macro-legend"><button type="button" onClick={()=>setMacroInfo("protein")}><i className="legend-dot" style={{background:"#2f6b2f"}} />P {totals.protein}g <span className="info-i">i</span></button><button type="button" onClick={()=>setMacroInfo("carbs")}><i className="legend-dot" style={{background:"#f3a52c"}} />G {totals.carbs}g <span className="info-i">i</span></button><button type="button" onClick={()=>setMacroInfo("fat")}><i className="legend-dot" style={{background:"#8a6bd1"}} />L {totals.fat}g <span className="info-i">i</span></button></div><span className="chart-foot">🌾 Fibres {totals.fiber}{targets ? ` / ${targets.fiber}` : ""} g</span></div>
      <div className="card span-4 chart-card"><h3>{tr("dash.hydration")} <button type="button" className="info-link" onClick={()=>setHydrInfoOpen(true)} aria-label="Comment l'objectif d'hydratation est calculé">ⓘ</button></h3><ProgressRing value={(state.water||{})[date]||0} max={waterGoal} color="#3b9bd6" top={`${(state.water||{})[date]||0}`} bottom={`/ ${waterGoal} ml`} /><div className="row water-btns"><button className="btn secondary" onClick={()=>addWater(100)}>+10cl</button><button className="btn secondary" onClick={()=>addWater(150)}>+15cl</button><button className="btn secondary" onClick={()=>addWater(250)}>+25cl</button><button className="btn secondary" onClick={()=>addWater(500)}>+50cl</button><button className="btn secondary" onClick={()=>addWater(-100)} disabled={!((state.water||{})[date])}>−10cl</button></div></div>
      <div className="card span-12"><MicroPanel title={tr("dash.micros")} micros={microsToday} onInfo={setMicroDetail}/></div>
    </section>}

    {tab === "profil" && <section className="grid">
      <div className="card span-8">
        <div className="space"><div><h2>{activeProfile ? tr("prof.editTitle") : tr("prof.createTitle")}</h2><p className="muted">{tr("prof.intro")}</p></div>{activeProfile && <button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:undefined}))}>{tr("prof.newProfile")}</button>}</div>
        {activeProfile && targets && <div className="target-panel"><div><span>{tr("prof.kcalDay")}</span><strong>{targets.kcal}</strong></div><div><span>{tr("common.protein")}</span><strong>{targets.protein}g</strong></div><div><span>{tr("common.carbs")}</span><strong>{targets.carbs}g</strong></div><div><span>{tr("common.fat")}</span><strong>{targets.fat}g</strong></div><div><span>{tr("common.fiber")}</span><strong>{targets.fiber}g</strong></div></div>}
        <form action={saveProfile} className="grid" key={activeProfile?.id || "new-profile"}>
      <input type="hidden" name="profileId" value={activeProfile?.id || ""}/>
      <div className="span-6"><label>{tr("prof.firstName")}</label><input name="firstName" placeholder="Antoine" defaultValue={activeProfile?.firstName || ""} /></div><div className="span-6"><label>{tr("prof.lastName")}</label><input name="lastName" placeholder="Dupont" defaultValue={activeProfile?.lastName || ""} /></div>
      <div className="span-3"><label>{tr("prof.sex")}</label><select name="sex" defaultValue={activeProfile?.sex || "homme"}><option value="homme">{tr("prof.male")}</option><option value="femme">{tr("prof.female")}</option></select></div><div className="span-3"><label>{tr("prof.age")}</label><input name="age" type="number" defaultValue={activeProfile?.age || 25}/></div><div className="span-3"><label>{tr("prof.height")}</label><input name="heightCm" type="number" defaultValue={activeProfile?.heightCm || 175}/></div><div className="span-3"><label>{tr("prof.weight")}</label><input name="weightKg" type="text" inputMode="decimal" placeholder="ex. 65,45" defaultValue={activeProfile?.weightKg ?? 70}/></div>
      <div className="span-3"><label>{tr("prof.bodyFat")}</label><div className="bf-row"><input name="bodyFatPct" type="text" inputMode="decimal" placeholder="optionnel" value={bodyFat} onChange={e=>setBodyFat(e.target.value)}/><button type="button" className="btn secondary bf-estimate" onClick={()=>setBfModalOpen(true)}>{tr("prof.estimate")}</button></div></div><div className="span-3"><label>{tr("prof.activity")}</label><select name="activity" defaultValue={String(activeProfile?.activity || 1.55)}><option value="1.2">{tr("act.sedentary")}</option><option value="1.375">{tr("act.light")}</option><option value="1.55">{tr("act.moderate")}</option><option value="1.725">{tr("act.high")}</option><option value="1.9">{tr("act.veryHigh")}</option></select></div><div className="span-3"><label>{tr("prof.goal")}</label><select name="goal" defaultValue={activeProfile?.goal || "maintien"}><option value="perte">{tr("goal.perte")}</option><option value="seche">{tr("goal.seche")}</option><option value="maintien">{tr("goal.maintien")}</option><option value="prise_masse">{tr("goal.prise_masse")}</option></select></div><div className="span-3"><label>{tr("prof.protPerKg")}</label><select name="proteinPerKg" defaultValue={activeProfile?.proteinPerKg ? String(activeProfile.proteinPerKg) : ""}><option value="">{tr("prof.autoByGoal")}</option><option value="1.6">1,6 g/kg</option><option value="1.8">1,8 g/kg</option><option value="2.0">2,0 g/kg</option><option value="2.2">2,2 g/kg</option><option value="2.4">2,4 g/kg</option><option value="2.6">2,6 g/kg</option></select></div><div className="span-12"><p className="form-help"><strong>Perte de poids</strong> = déficit plus marqué (~20 %) pour perdre du gras plus vite. <strong>Sèche</strong> = déficit plus modéré (~15 %) avec davantage de protéines pour préserver le muscle (idéal si tu es déjà sec/sportif). Un plancher de sécurité empêche des calories trop basses (jamais sous ton métabolisme de base, ni sous 1700 kcal homme / 1500 kcal femme).</p></div>
      <div className="span-12"><p className="form-help">Protéines par kg de poids de corps. Repère : <strong>1,6 g/kg</strong> = minimum pour progresser ; <strong>1,8–2,2 g/kg</strong> = zone optimale (maintien / prise de masse) ; <strong>2,2–2,6 g/kg</strong> = conseillé en sèche pour préserver le muscle pendant le déficit calorique. Au-delà, peu de bénéfice prouvé. « Auto » choisit selon ton objectif (et ta masse maigre si renseignée).</p></div><div className="span-3"><label>{tr("prof.bmr")} <button type="button" className="info-link" onClick={()=>setMetabInfoOpen(true)} aria-label="Comment le métabolisme de base est calculé">ⓘ</button></label><input name="customBmr" type="text" inputMode="numeric" placeholder={tr("prof.autoCalc")} defaultValue={activeProfile?.customBmr ? String(activeProfile.customBmr) : ""}/></div><div className="span-3"><label>{tr("prof.customKcal")}</label><input name="customKcal" type="text" inputMode="numeric" placeholder={tr("prof.autoCalc")} defaultValue={activeProfile?.customKcal ? String(activeProfile.customKcal) : ""}/></div><div className="span-12"><p className="form-help">Laisse ces deux champs <strong>vides</strong> pour un calcul automatique. <strong>Métabolisme de base</strong> : si tu connais ta valeur (mesurée), l&apos;app l&apos;utilise à la place de l&apos;estimation. <strong>Calories/jour</strong> : impose directement ta cible calorique (elle remplace tout le calcul : objectif, activité, plancher).</p></div><div className="span-3"><label>{tr("prof.diet")}</label><select name="diet" defaultValue={activeProfile?.diet || "omnivore"}><option value="omnivore">{tr("diet.omnivore")}</option><option value="flexitarien">{tr("diet.flexitarien")}</option><option value="pescetarien">{tr("diet.pescetarien")}</option><option value="vegetarien">{tr("diet.vegetarien")}</option><option value="vegan">{tr("diet.vegan")}</option><option value="sans_porc">{tr("diet.sans_porc")}</option></select></div>
      <div className="span-3"><label>{tr("prof.budget")}</label><select name="weeklyBudget" defaultValue={String(activeProfile?.weeklyBudget || 75)}><option>50</option><option>75</option><option>100</option><option>150</option><option>200</option></select></div><div className="span-3"><label>{tr("prof.store")}</label><select name="store" defaultValue={activeProfile?.store || "leclerc"}>{Object.entries(STORES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div><div className="span-3"><label>{tr("prof.maxPrep")}</label><input name="maxPrepTime" type="number" defaultValue={activeProfile?.maxPrepTime || 30}/></div><div className="span-3"><label>{tr("prof.cookLevel")}</label><select name="cookingLevel" defaultValue={activeProfile?.cookingLevel || "normal"}><option value="etudiant">{tr("cook.etudiant")}</option><option value="normal">{tr("cook.normal")}</option><option value="meal_prep">{tr("cook.meal_prep")}</option><option value="famille">{tr("cook.famille")}</option></select></div>
      <div className="span-6"><label>{tr("prof.liked")}</label><input name="likedFoods" placeholder="riz, poulet, skyr" defaultValue={activeProfile?.likedFoods.join(", ") || ""}/></div><div className="span-6"><label>{tr("prof.disliked")}</label><input name="dislikedFoods" placeholder="thon, fromage, etc." defaultValue={activeProfile?.dislikedFoods.join(", ") || ""}/></div>
      <div className="span-12"><label>{tr("prof.allergies")}</label><div className="row">{ALLERGENS.map(a=><label key={a} className="tag"><input type="checkbox" name={`allergy_${a}`} defaultChecked={!!activeProfile?.allergies.includes(a)} style={{width:"auto"}}/> {ALLERGEN_LABELS[a] || a}</label>)}</div><p className="form-help">« Graines &amp; pépins » exclut les graines, oléagineux et petits pépins (utile en cas de diverticules).</p></div>
      <div className="span-12"><label>{tr("prof.trainingDays")}</label><div className="row">{["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"].map((d,i)=><label key={d} className="tag"><input type="checkbox" name={`day_${i}`} defaultChecked={!!activeProfile?.trainingDays.includes(i)} style={{width:"auto"}}/> {tr("day."+d)}</label>)}</div></div>
      <div className="span-12"><label>{tr("prof.fasting")}</label><select name="fasting" defaultValue={currentFasting(activeProfile)}><option value="none">{tr("fast.none")}</option><option value="window_pm">{tr("fast.window_pm")}</option><option value="window_am">{tr("fast.window_am")}</option><option value="omad">{tr("fast.omad")}</option></select><p className="form-help">Le jeûne intermittent = concentrer les repas sur une fenêtre horaire (~8h de repas, ~16h de jeûne). Deux façons courantes : commencer à manger vers midi (sans petit-déj) ou arrêter vers 16h (sans dîner). Son intérêt vient surtout de la réduction de l'apport calorique, sans être supérieur à un simple déficit bien suivi (source : de Cabo &amp; Mattson, <em>New England Journal of Medicine</em>, 2019). Le générateur répartit tes calories sur la fenêtre choisie. Pour exclure un ingrédient (soja, gluten…), utilise « Allergies / exclusions » ci-dessus.</p></div>
      <div className="span-12"><button className="btn">{activeProfile ? tr("prof.updateBtn") : tr("prof.createBtn")}</button></div>
    </form></div><div className="card span-4"><h3>{tr("prof.existing")}</h3><div className="list">{state.profiles.map(p=><div className="item" key={p.id}><div className="space"><strong>{p.firstName} {p.lastName}</strong><button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:p.id}))}>{tr("prof.activate")}</button></div><span className="muted">{p.goal} · {p.diet}</span><div className="row" style={{marginTop:8}}><button className="btn danger" onClick={()=>{if(confirm("Supprimer ce profil ?")) setState(s=>({ ...s, profiles: s.profiles.filter(x=>x.id!==p.id), activeProfileId: s.activeProfileId === p.id ? undefined : s.activeProfileId }))}}>{tr("common.delete")}</button></div></div>)}</div>{!state.profiles.length && <p className="muted">{tr("prof.noProfile")}</p>}</div></section>}

    {tab === "journal" && <section className="grid">
      <div className="card span-4"><h2>{tr("journal.add")}</h2><button className="btn snap-cta" onClick={()=>setSnapOpen(true)}>{tr("journal.snapCta")}</button><button className="btn secondary snap-cta" onClick={()=>setBarcodeOpen(true)}>{tr("journal.scanCta")}</button><label>{tr("common.date")}</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /><label>{tr("common.meal")}</label><select value={selectedMeal} onChange={e=>setSelectedMeal(e.target.value as MealType)}>{MEALS.map(m=><option key={m} value={m}>{tr("meal."+m)}</option>)}</select>{(favoriteFoods.length > 0 || recentFoods.length > 0) && <div className="quick-foods">{favoriteFoods.length > 0 && <><div className="quick-foods-title">{tr("journal.favorites")}</div><div className="quick-foods-row">{favoriteFoods.slice(0,8).map(f=><button type="button" key={f.id} className="quick-food-chip" onClick={()=>quickAddFood(f)} title="Ajouter au journal"><span>{foodIcon(f)}</span>{f.name}</button>)}</div></>}{recentFoods.length > 0 && <><div className="quick-foods-title">{tr("journal.recents")}</div><div className="quick-foods-row">{recentFoods.slice(0,8).map(f=><button type="button" key={f.id} className="quick-food-chip" onClick={()=>quickAddFood(f)} title="Ajouter au journal"><span>{foodIcon(f)}</span>{f.name}</button>)}</div></>}</div>}<label>{tr("common.search")}</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("journal.searchPlaceholder")}/><p className="form-help">Recherche locale + Open Food Facts pour les produits de marque.</p>{offLoading && <p className="form-help">Recherche Open Food Facts en cours...</p>}{offError && <p className="form-help bad-text">{offError}</p>}<ProductResults foods={foodOptions.slice(0,10)} selectedId={selectedFood} onSelect={setSelectedFood}/>{!foodOptions.length && !offLoading && <p className="form-help bad-text">Aucun résultat : l'application n’ajoute rien par défaut.</p>}{selectedFoodObj && <ProductCard food={selectedFoodObj} qty={qty} macros={selectedPreview} isFavorite={(state.favorites||[]).includes(selectedFoodObj.id)} onToggleFavorite={()=>toggleFavorite(selectedFoodObj)}/>}<QuantityPicker value={qty} onChange={setQty} food={selectedFoodObj} unit={journalUnit} onUnitChange={changeJournalUnit}/><div className="macro-preview"><span>{selectedPreview.kcal} kcal</span><span>P {selectedPreview.protein}g</span><span>G {selectedPreview.carbs}g</span><span>L {selectedPreview.fat}g</span><span>Fibres {selectedPreview.fiber}g</span></div><MicroPanel title="Vitamines & minéraux de l'aliment" micros={selectedMicros} onInfo={setMicroDetail}/><button className="btn" disabled={!selectedFood || !foodOptions.length || qty <= 0} onClick={addFoodLog}>{tr("journal.addToJournal")}</button></div>
      <div className="card span-8"><h2>{tr("journal.diaryOf")} {date}</h2><div className="row" style={{margin:"2px 0 10px"}}><span className="muted">Dupliquer ce jour vers :</span><input type="date" value={copyDate} onChange={e=>setCopyDate(e.target.value)} style={{maxWidth:160}}/><button className="btn secondary" onClick={()=>duplicateDay(copyDate)} disabled={!dayLogs.length}>Copier</button></div><div className="pillbar"><div className="kpi">Kcal <strong>{totals.kcal}</strong></div><div className="kpi">P <strong>{totals.protein}g</strong></div><div className="kpi">G <strong>{totals.carbs}g</strong></div><div className="kpi">L <strong>{totals.fat}g</strong></div></div><MicroPanel title="Micros cumulés du jour" micros={microsToday} onInfo={setMicroDetail}/>{MEALS.map(m=><div className="meal" key={m} style={{marginTop:12}}><div className="meal-head">{tr("meal."+m)}</div><div className="meal-body list">{dayLogs.filter(l=>l.meal===m).map(l=>{const f=findFoodAny(l.foodId); const kcal = f ? macrosFromBaseGrams(f,l.qty).kcal : 0; return <div className="item space" key={l.id}><span>{f?.name} · {formatQuantity(f, l.qty, l.displayQty, l.displayUnit)} {f && <span className="muted">· {kcal} kcal</span>}</span><div className="row" style={{gap:6}}><button className="qty-btn qty-btn-sm" onClick={()=>adjustLog(l, l.displayUnit==="piece"?-1:-10)} aria-label="Diminuer">−</button><button className="qty-btn qty-btn-sm" onClick={()=>adjustLog(l, l.displayUnit==="piece"?1:10)} aria-label="Augmenter">+</button><button className="btn danger" onClick={()=>removeLog(l.id)}>{tr("journal.remove")}</button></div></div>})}</div></div>)}</div>
    </section>}

    {tab === "catalogue" && <section className="grid"><div className="card span-12"><h2>{tr("cat.title")}</h2><p className="muted">{tr("cat.desc")}</p><div className="row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("cat.searchDo")}/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c === "all" ? tr("cat.allShelves") : c}</option>)}</select></div><div className="scroll"><table className="table"><thead><tr><th>{tr("cat.thFood")}</th><th>{tr("cat.thShelf")}</th><th>{tr("cat.thMacros")}</th><th>{tr("cat.thVitMin")}</th><th>{tr("cat.thDiets")}</th><th>{tr("cat.thAllergens")}</th><th>{tr("cat.thBuy")}</th></tr></thead><tbody>{visibleFoods.slice(0,500).map(f=><tr key={f.id}><td><div className="catalog-food"><span className="mini-food-icon">{foodIcon(f)}</span><span><strong>{f.name}</strong><br/><span className="muted">{f.brand ? `${f.brand} · ` : ""}{f.state} · {f.reliability} · {sourceLabel(f)}{isPieceInput(f) ? ` · 1 ${f.servingLabel || "pièce"} ≈ ${estimateServingGrams(f)} g` : ""}</span></span></div></td><td>{f.category}</td><td>{f.macros.kcal} kcal · P{f.macros.protein} G{f.macros.carbs} L{f.macros.fat}</td><td><MicroInline food={f}/></td><td>{f.diets.map(d=><span className="tag" key={d}>{d}</span>)}</td><td>{f.allergens.length ? f.allergens.map(a=><span className="tag warn" key={a}>{a}</span>) : <span className="muted">{tr("cat.none")}</span>}</td><td>{f.purchaseUnit}</td></tr>)}</tbody></table></div></div></section>}

    {tab === "recettes" && <section className="grid">
      <div className="card span-4"><h2>{tr("rec.title")}</h2><div className="row"><input value={recipeQuery} onChange={e=>setRecipeQuery(e.target.value)} placeholder={tr("rec.searchPlaceholder")}/><select value={recipeMealFilter} onChange={e=>setRecipeMealFilter(e.target.value as "all" | MealType)}><option value="all">{tr("rec.allMeals")}</option>{MEALS.map(m=><option key={m} value={m}>{tr("meal."+m)}</option>)}</select></div><div className="row" style={{marginTop:8}}><button type="button" className={`filter-chip ${onlyMealPrep?"active":""}`} onClick={()=>setOnlyMealPrep(v=>!v)}>{tr("rec.mealPrep")}</button><button type="button" className={`filter-chip ${onlySoyFree?"active":""}`} onClick={()=>setOnlySoyFree(v=>!v)}>{tr("rec.soyFree")}</button><button type="button" className="btn" onClick={()=>setCreateRecipeOpen(true)}>{tr("rec.create")}</button></div><div className="list" style={{marginTop:12}}>{filteredRecipes.map(r=>{const m=recipeMacros(r); return <button className={`recipe-list-btn ${selectedRecipe?.id===r.id ? "active" : ""}`} key={r.id} onClick={()=>{setSelectedRecipeId(r.id); resetRecipeTracking(); setRecipeServings(r.servings);}}><strong>{r.title}</strong><span>{m.kcal} kcal · P{m.protein}g · {r.prepTime} min</span></button>})}</div></div>
      <div className="card span-8">{selectedRecipe && <><div className="space"><div><h2>{selectedRecipe.title}</h2><p className="muted">{selectedRecipe.mealType} · {selectedRecipe.prepTime} min · difficulté {selectedRecipe.difficulty} · conservation {selectedRecipe.storageDays} jour(s){selectedRecipe.isCustom ? " · recette perso" : ""}</p></div><div className="row">{selectedRecipe.isCustom && <button className="btn danger" onClick={()=>deleteRecipe(selectedRecipe.id)}>{tr("common.delete")}</button>}<button className="btn" onClick={()=>addRecipeToJournal(selectedRecipe)}>{tr("journal.addToJournal")}</button></div></div><div>{selectedRecipe.tags.map(t=><span className="tag" key={t}>{t}</span>)} {selectedRecipe.diets.map(d=><span className="tag warn" key={d}>{d}</span>)}</div><div className="recipe-toolbar"><label>{tr("rec.servingsToPrep")}</label><div className="row"><button className="qty-btn" onClick={()=>setRecipeServings(Math.max(1, recipeServings-1))}>−</button><input type="text" inputMode="numeric" value={servingsFocused ? servingsText : String(recipeServings)} onFocus={e=>{ setServingsFocused(true); setServingsText(String(recipeServings)); e.currentTarget.select(); }} onBlur={()=>{ setServingsFocused(false); setRecipeServings(v=>Math.max(1, v)); }} onChange={e=>{ const t=e.target.value; setServingsText(t); if(t.trim()==="") return; const n=Number(t.replace(",", ".")); if(Number.isFinite(n)) setRecipeServings(Math.max(1, Math.round(n))); }}/><button className="qty-btn" onClick={()=>setRecipeServings(recipeServings+1)}>+</button></div></div>{selectedRecipeMacros && <div className="macro-preview"><span>{selectedRecipeMacros.kcal} kcal</span><span>P {selectedRecipeMacros.protein}g</span><span>G {selectedRecipeMacros.carbs}g</span><span>L {selectedRecipeMacros.fat}g</span><span>Fibres {selectedRecipeMacros.fiber}g</span></div>}<h3>{tr("rec.ingredients")}</h3><div className="check-list">{selectedRecipe.ingredients.map((it, idx)=>{const f=findFood(it.foodId); const factor=recipeServings/Math.max(1, selectedRecipe.servings); const q=it.qty*factor; const key=`${selectedRecipe.id}_ing_${idx}`; return <label className={`check-item ${checkedRecipeItems[key] ? "done" : ""}`} key={key}><input type="checkbox" checked={!!checkedRecipeItems[key]} onChange={()=>toggleRecipeItem(key)}/><span><strong>{f?.name || it.foodId}</strong><br/><span className="muted">{Math.round(q)} g · {f ? macrosFromBaseGrams(f,q).kcal : 0} kcal</span></span></label>})}</div><h3>{tr("rec.steps")}</h3><div className="check-list">{recipeSteps.map((step, idx)=>{const key=`${selectedRecipe.id}_step_${idx}`; return <label className={`check-item ${checkedRecipeItems[key] ? "done" : ""}`} key={key}><input type="checkbox" checked={!!checkedRecipeItems[key]} onChange={()=>toggleRecipeItem(key)}/><span><strong>{tr("rec.step")} {idx+1}</strong><br/><span>{step}</span></span></label>})}</div><div className="row" style={{marginTop:12}}><button className="btn secondary" onClick={resetRecipeTracking}>{tr("rec.resetTracking")}</button><button className="btn" onClick={()=>addRecipeToJournal(selectedRecipe)}>{tr("rec.doneAdd")}</button></div></>}</div>
    </section>}

    {tab === "programme" && <section className="grid"><div className="card span-12"><div className="space"><h2>{tr("prog2.title")}</h2><button className="btn" disabled={!activeProfile} onClick={generate}>{tr("prog2.generate")}</button></div>{activeProfile && (activeProfile.goal === "perte" || activeProfile.goal === "seche") && <><label className="toggle-line" style={{marginTop:10}}><input type="checkbox" checked={gentleStart} onChange={e=>setGentleStart(e.target.checked)} style={{width:"auto"}}/> Démarrage en douceur (entrée progressive dans le déficit)</label>{gentleStart && <p className="form-help">Les 3 premiers jours partent près de ton maintien puis descendent doucement vers ta cible ; à partir du 4ᵉ jour, tu es à la cible. Après avoir changé cette option, régénère le programme.</p>}</>}{programScore && <div className="notice"><strong>Score {programScore.score}/100</strong><br/>{programScore.notes.join(" · ")}</div>}{programScore && targets && (targets.protein - programScore.avgProtein) > 12 && <div className="notice whey-suggest"><strong>💪 Protéines un peu justes</strong><br/>Il te manque environ {Math.round(targets.protein - programScore.avgProtein)} g de protéines par jour. La whey est idéale pour combler ça : très riche en protéines et peu calorique (≈ 23 g de protéines pour seulement ≈ 117 kcal par dose de 30 g).<br/><button className="btn secondary" style={{marginTop:10}} onClick={()=>{const w=findFood("supp_whey_concentree_generique"); if(w) quickAddFood(w);}}>+ Ajouter une dose de whey aujourd'hui</button></div>}<div className="list" style={{marginTop:12}}>{state.program.map((pm,i)=>{const r=state.recipes.find(x=>x.id===pm.recipeId); const f=pm.factor ?? 1; const m=r?recipeMacros(r):null; return <button type="button" className="item program-item" key={i} onClick={()=>{ if(r){ setSelectedRecipeId(r.id); setRecipeServings(Math.max(1, Math.round(r.servings * f))); resetRecipeTracking(); setTab("recettes"); } }}><span className="program-item-main"><strong>{pm.date} · {pm.dayType} · {pm.mealType}</strong><br/>{r?.title} {f !== 1 && <span className="tag">portion ×{f}</span>} {m && <span className="muted">· {Math.round(m.kcal*f)} kcal, P{Math.round(m.protein*f)}g</span>}</span><span className="program-arrow" aria-hidden="true">›</span></button>})}</div></div></section>}

    {tab === "courses" && <section className="grid"><div className="card span-12"><h2>{tr("shop.title")}</h2><p className="muted">{tr("shop.desc")}</p><div className="scroll"><table className="table"><thead><tr><th>{tr("shop.thShelf")}</th><th>{tr("shop.thFood")}</th><th>{tr("shop.thNeed")}</th><th>{tr("shop.thAvail")}</th><th>{tr("shop.thBuy")}</th><th>{tr("shop.thPacks")}</th><th>{tr("shop.thPrice")}</th></tr></thead><tbody>{shopping.map(x=><tr key={x.foodId}><td>{x.category}</td><td>{x.name}</td><td>{Math.round(x.needed * 10) / 10} {x.unit}</td><td>{Math.round(x.available * 10) / 10} {x.unit}</td><td><strong>{Math.round(x.toBuy * 10) / 10} {x.unit}</strong></td><td>{x.packages} × {x.packageLabel}</td><td>{x.price.toFixed(2)} €</td></tr>)}</tbody></table></div></div></section>}

    {tab === "placard" && <section className="grid"><div className="card span-4"><h2>{tr("pan.addTitle")}</h2><input value={pantryQuery} onChange={e=>setPantryQuery(e.target.value)} placeholder={tr("pan.searchPlaceholder")}/><select value={pantrySelectedFood} disabled={!pantryOptions.length} onChange={e=>setPantrySelectedFood(e.target.value)}>{!pantryOptions.length ? <option value="">{tr("pan.noFood")}</option> : pantryOptions.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>{!pantryOptions.length && <p className="form-help bad-text">{tr("pan.noFoodFilter")}</p>}<QuantityPicker value={pantryQty} onChange={setPantryQty} food={pantrySelectedObj}/><button className="btn" disabled={!pantrySelectedFood || !pantryOptions.length || pantryQty <= 0} onClick={()=>addPantry(pantrySelectedFood, pantryQty)}>{tr("journal.add")}</button></div><div className="card span-8"><h2>{tr("pan.pantryTitle")}</h2><div className="list">{state.pantry.map(p=>{const f=findFoodAny(p.foodId); return <div className="item space" key={p.id}><span>{f?.name} · {formatQuantity(f, p.qty, p.displayQty, p.displayUnit)}</span><button className="btn danger" onClick={()=>setState(s=>({...s,pantry:s.pantry.filter(x=>x.id!==p.id)}))}>{tr("journal.remove")}</button></div>})}</div></div></section>}

    {tab === "poids" && <section className="grid"><div className="card span-4"><h2>{tr("w.fastingWeigh")}</h2><label>{tr("w.morningWeight")}</label><input type="text" inputMode="decimal" placeholder="ex. 70,90" value={weightInput} onChange={e=>setWeightInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const w=frNum(weightInput,0); if(w>0){addWeight(w); setWeightInput("");}}}}/><button className="btn" style={{marginTop:8}} disabled={frNum(weightInput,0)<=0} onClick={()=>{const w=frNum(weightInput,0); if(w>0){addWeight(w); setWeightInput("");}}}>{tr("w.addWeigh")}</button></div><div className="card span-8"><h2>{tr("w.tracking")}</h2><p>{tr("w.avg7")}<strong>{average7(state.weights) ?? "—"} kg</strong></p>{bmi ? <p>{tr("w.imc")}<strong>{bmi.toFixed(1)}</strong> <span className={`tag ${bmiCategory(bmi).tone}`}>{bmiCategory(bmi).label}</span> <button type="button" className="info-link" onClick={()=>setBmiInfoOpen(true)}>{tr("w.imcInfo")}</button></p> : <p className="muted">{tr("w.imcHint")}</p>}<p className="notice">{activeProfile ? weightTrendRecommendation(activeProfile, state.weights) : tr("w.createProfileReco")}</p><WeightChart weights={state.weights}/><div className="list">{state.weights.slice(-10).reverse().map(w=><div className="item" key={w.id}>{w.date} · {w.weightKg} kg · <span className="muted">{w.note}</span></div>)}</div></div></section>}

    {tab === "progres" && <section className="grid">
      <div className="card span-12">
        <div className="space"><h2>{tr("prog.title")}</h2>{streak > 0 && <span className="streak-badge">🔥 {streak} {streak > 1 ? tr("prog.streakDays") : tr("prog.streakDay")} {tr("prog.streakSuffix")}</span>}</div>
        <div className="row" style={{marginBottom:10}}>{[{d:7,l:tr("prog.p7")},{d:30,l:tr("prog.p30")},{d:182,l:tr("prog.p6m")},{d:365,l:tr("prog.p1y")}].map(p=><button key={p.d} type="button" className={`filter-chip ${progressPeriod===p.d?"active":""}`} onClick={()=>setProgressPeriod(p.d)}>{p.l}</button>)}</div>
        <p className="muted">{tr("prog.caloriesVsTarget")}</p>
        <HistoryChart points={history.points} target={targets?.kcal}/>
        <div className="pillbar" style={{marginTop:12}}><div className="kpi">{tr("prog.avgKcal")} <strong>{history.avg.kcal}</strong></div><div className="kpi">{tr("prog.avgProt")} <strong>{history.avg.protein}g</strong></div><div className="kpi">{tr("prog.daysTracked")} <strong>{history.daysLogged}/{history.daysInPeriod}</strong></div><div className="kpi">{tr("prog.streakLabel")} <strong>{streak}</strong></div></div>
        {targets && history.daysLogged > 0 && <div className="micro-grid" style={{marginTop:12}}><span>{tr("prog.calTargetMet")}<strong>{history.pctCal}{tr("prog.pctDays")}</strong></span><span>{tr("prog.protTargetMet")}<strong>{history.pctProt}{tr("prog.pctDays")}</strong></span></div>}
        {!history.daysLogged && <p className="form-help">{tr("prog.logHint")}</p>}
      </div>
    </section>}

    {tab === "sauvegarde" && <section className="grid">
      <div className="card span-12 premium-card"><div className="space"><h2>✨ Macrolens Premium</h2><span className={`tag ${state.premium ? "" : "warn"}`}>{state.premium ? tr("acc.premiumActive") : tr("acc.freePlan")}</span></div><p className="muted">{tr("acc.premiumDesc")}</p><div className="row" style={{marginTop:8}}>{state.premium ? <button className="btn secondary" onClick={()=>setState(s=>({...s, premium:false}))}>{tr("acc.backToFree")}</button> : <button className="btn" onClick={()=>{setState(s=>({...s, premium:true})); showToast(tr("acc.premiumToast"));}}>{tr("acc.goPremium")}</button>}</div><p className="form-help">{tr("acc.premiumNote")}</p></div>
      <div className="card span-6"><h2>{tr("acc.cloudTitle")}</h2><p className="muted">{tr("acc.cloudDesc")}</p>{!supabase && <div className="notice">Supabase n'est pas encore configuré. Ajoute les variables <strong>NEXT_PUBLIC_SUPABASE_URL</strong> et <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>.</div>}{session?.user ? <div className="cloud-box"><strong>{tr("acc.connected")}</strong><p className="muted">{session.user.email}</p><div className="cloud-status"><span>{autoSync ? tr("acc.autoSaveOn") : tr("acc.autoSaveOff")}</span><strong>{lastCloudSaveAt ? `${tr("acc.lastSave")}${new Date(lastCloudSaveAt).toLocaleString(lang==="es"?"es-ES":"fr-FR")}` : tr("acc.notSaved")}</strong></div><label className="toggle-line"><input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} style={{width:"auto"}}/> {tr("acc.autoSaveToggle")}</label><div className="row"><button className="btn" onClick={saveCloud}>{tr("acc.saveNow")}</button><button className="btn secondary" onClick={loadCloud}>{tr("acc.loadCloud")}</button><button className="btn danger" onClick={signOut}>{tr("acc.signOut")}</button></div><button className="btn danger" style={{marginTop:10,width:"100%"}} onClick={deleteAccount}>{tr("acc.deleteAccount")}</button></div> : <div className="cloud-box"><label>{tr("acc.email")}</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="ton@email.com"/><label>{tr("acc.password")}</label><div className="pwd-field"><input type={showPassword ? "text" : "password"} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={tr("acc.passwordPlaceholder")}/><button type="button" className="pwd-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? tr("acc.hidePwd") : tr("acc.showPwd")} aria-pressed={showPassword}>{showPassword ? "🙈" : "👁️"}</button></div><div className="row"><button className="btn" onClick={signIn} disabled={!supabase || !authEmail || authPassword.length < 6}>{tr("acc.signIn")}</button><button className="btn secondary" onClick={signUp} disabled={!supabase || !authEmail || authPassword.length < 6}>{tr("acc.signUp")}</button></div></div>}{authMessage && <p className="notice">{authMessage}</p>}{syncStatus && <p className="notice">{syncStatus}</p>}</div>
      <div className="card span-6"><h2>{tr("acc.localTitle")}</h2><p className="muted">{tr("acc.localDesc")}</p><button className="btn" onClick={exportJson}>{tr("acc.exportJson")}</button><label>{tr("acc.importBackup")}</label><input type="file" accept="application/json" onChange={e=>importJson(e.target.files?.[0] || null)}/></div>
      <div className="card span-12"><h2>{tr("acc.resetTitle")}</h2><div className="row"><button className="btn danger" onClick={()=>setState(s=>({...s,logs:[]}))}>{tr("nav.journal")}</button><button className="btn danger" onClick={()=>setState(s=>({...s,weights:[]}))}>{tr("tab.poids")}</button><button className="btn danger" onClick={()=>setState(s=>({...s,pantry:[]}))}>{tr("tab.placard")}</button><button className="btn danger" onClick={()=>{if(confirm(tr("acc.resetAllConfirm"))) setState(emptyState)}}>{tr("acc.all")}</button></div></div>
      <div className="span-12" style={{textAlign:"center",marginTop:6}}><a href="/confidentialite" className="info-link">{tr("acc.privacy")}</a></div>
    </section>}

    <SnapModal open={snapOpen} onClose={()=>setSnapOpen(false)} onConfirm={addScannedItems} onScanBarcode={()=>{ setSnapOpen(false); setBarcodeOpen(true); }} defaultMeal={selectedMeal} date={date} dailyLimit={state.premium ? 50 : 5} isPremium={!!state.premium} lang={lang} />
    <BarcodeScanModal open={barcodeOpen} onClose={()=>setBarcodeOpen(false)} onConfirm={addBarcodeFood} defaultMeal={selectedMeal} date={date} lang={lang} />
    <BodyFatModal open={bfModalOpen} onClose={()=>setBfModalOpen(false)} onApply={(v)=>{ setBodyFat(String(v)); setBfModalOpen(false); }} defaultSex={activeProfile?.sex || "homme"} defaultHeight={activeProfile?.heightCm} lang={lang} />
    <MacroInfoModal macro={macroInfo} onClose={()=>setMacroInfo(null)} lang={lang} />
    <CreateRecipeModal open={createRecipeOpen} onClose={()=>setCreateRecipeOpen(false)} onSave={addCustomRecipe} lang={lang} />
    <MicroDetailModal micro={microDetail} onClose={()=>setMicroDetail(null)} />
    <BmiInfoModal open={bmiInfoOpen} onClose={()=>setBmiInfoOpen(false)} />
    <MetabolismInfoModal open={metabInfoOpen} onClose={()=>setMetabInfoOpen(false)} sex={activeProfile?.sex || "homme"} />
    <CaloriesInfoModal open={kcalInfoOpen} onClose={()=>setKcalInfoOpen(false)} targetKcal={targets?.kcal || 0} manual={!!(activeProfile?.customKcal && activeProfile.customKcal > 0)} />
    <HydrationInfoModal open={hydrInfoOpen} onClose={()=>setHydrInfoOpen(false)} goal={waterGoal} />
    {toast && <div className="toast" role="status">{toast}</div>}

    <nav className="bottom-nav">
      <button className={`bn-item ${tab==="dashboard"?"active":""}`} onClick={()=>setTab("dashboard")}><span className="bn-ico">🏠</span>{tr("nav.home")}</button>
      <button className={`bn-item ${tab==="journal"?"active":""}`} onClick={()=>setTab("journal")}><span className="bn-ico">📓</span>{tr("nav.journal")}</button>
      <button className="bn-snap" onClick={()=>setSnapOpen(true)} aria-label="Snap mon repas"><span>📷</span></button>
      <button className={`bn-item ${tab==="catalogue"?"active":""}`} onClick={()=>setTab("catalogue")}><span className="bn-ico">🥑</span>{tr("nav.foods")}</button>
      <button className={`bn-item ${menuOpen?"active":""}`} onClick={()=>setMenuOpen(true)}><span className="bn-ico">☰</span>{tr("nav.menu")}</button>
    </nav>

    {menuOpen && <div className="sheet-overlay" onClick={()=>setMenuOpen(false)}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-head"><strong>{tr("menu.title")}</strong><button className="snap-close" onClick={()=>setMenuOpen(false)} aria-label="Fermer">✕</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupTracking")}</span><button className="sheet-item" onClick={()=>{setTab("progres");setMenuOpen(false);}}>{tr("menu.progress")}</button><button className="sheet-item" onClick={()=>{setTab("poids");setMenuOpen(false);}}>{tr("menu.weight")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupKitchen")}</span><button className="sheet-item" onClick={()=>{setTab("recettes");setMenuOpen(false);}}>{tr("menu.recipes")}</button><button className="sheet-item" onClick={()=>{setTab("programme");setMenuOpen(false);}}>{tr("menu.program")}</button><button className="sheet-item" onClick={()=>{setTab("courses");setMenuOpen(false);}}>{tr("menu.shopping")}</button><button className="sheet-item" onClick={()=>{setTab("placard");setMenuOpen(false);}}>{tr("menu.pantry")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupAccount")}</span><button className="sheet-item" onClick={()=>{setTab("profil");setMenuOpen(false);}}>{tr("menu.profile")}</button><button className="sheet-item" onClick={()=>{setTab("sauvegarde");setMenuOpen(false);}}>{tr("menu.account")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupAppearance")}</span><button className="sheet-item" onClick={toggleTheme}>{theme==="dark"?tr("theme.lightFull"):tr("theme.darkFull")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">🌐 {tr("common.language")}</span>{LANGS.map(l=><button key={l.code} className={`sheet-item ${lang===l.code?"active":""}`} onClick={()=>setState(s=>({...s, lang: l.code}))}>{lang===l.code?"✓ ":""}{l.label}</button>)}</div>
      </div>
    </div>}
  </main>;
}

function QuantityPicker({ value, onChange, food, unit, onUnitChange }: { value: number; onChange: (value: number) => void; food?: Food; unit?: "piece" | "g" | "cl"; onUnitChange?: (u: "piece" | "g" | "cl") => void }) {
  const controlled = unit !== undefined && onUnitChange !== undefined;
  const effUnit: "piece" | "g" | "cl" | "ml" = controlled ? unit! : (isPieceInput(food) ? "piece" : food?.unit === "ml" ? "ml" : "g");
  const isPiece = effUnit === "piece";
  const quickValues = isPiece ? [1, 2, 3, 4, 6, 10] : effUnit === "cl" ? [10, 15, 20, 25, 33, 50] : [25, 50, 75, 100, 150, 200, 250, 300, 500];
  const stepV = isPiece ? 1 : effUnit === "cl" ? 5 : 10;
  const pill = isPiece ? `${food?.servingLabel || "pièce"}(s)` : effUnit;
  const safeChange = (next: number) => onChange(Math.max(0, Math.round((Number.isFinite(next) ? next : 0) * 10) / 10));
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <div className="quantity-card">
    {controlled && <div className="unit-select"><span className="muted">Unité :</span>{(["piece", "g", "cl"] as const).map(u2 => <button key={u2} type="button" className={`filter-chip ${unit === u2 ? "active" : ""}`} onClick={() => onUnitChange!(u2)}>{u2 === "piece" ? "Pièce" : u2}</button>)}</div>}
    <div className="space"><label style={{margin:0}}>Quantité</label><span className="muted">{isPiece ? `1 ${food?.servingLabel || "pièce"} ≈ ${estimateServingGrams(food)} g` : "Base 100 g/ml, calcul ajusté"}</span></div>
    <div className="quantity-row">
      <button type="button" className="qty-btn" onClick={()=>safeChange(value - stepV)}>−</button>
      <input type="text" inputMode="decimal" value={focused ? text : String(value)} onFocus={e=>{ setFocused(true); setText(String(value)); e.currentTarget.select(); }} onBlur={()=>setFocused(false)} onChange={e=>{ const t=e.target.value; setText(t); if(t.trim()==="") return; const n=Number(t.replace(",",".")); if(Number.isFinite(n)) safeChange(n); }}/>
      <span className="unit-pill">{pill}</span>
      <button type="button" className="qty-btn" onClick={()=>safeChange(value + stepV)}>+</button>
    </div>
    <div className="quick-qty">{quickValues.map(q => <button type="button" key={q} className={value===q ? "active" : ""} onClick={()=>safeChange(q)}>{q}{isPiece ? "" : effUnit}</button>)}</div>
  </div>;
}

function sourceLabel(food: Food) {
  if (food.source === "ciqual") return "Ciqual / Anses";
  if (food.source === "openfoodfacts") return "Open Food Facts";
  if (food.source === "manual") return "Base app";
  return "Estimé";
}
function sourceTone(food: Food) {
  if (food.source === "ciqual") return "ciqual";
  if (food.source === "openfoodfacts") return "off";
  if (food.reliability === "estime") return "estimated";
  return "manual";
}
function NutriScoreBadge({ grade }: { grade?: string }) {
  if (!grade || !/^[a-e]$/i.test(grade)) return null;
  return <span className={`nutri-badge nutri-${grade.toLowerCase()}`} title="Nutri-Score (qualité nutritionnelle, A = meilleur)">{grade.toUpperCase()}</span>;
}
function NovaBadge({ group }: { group?: number }) {
  if (!group || ![1, 2, 3, 4].includes(group)) return null;
  const labels: Record<number, string> = { 1: "Non transformé", 2: "Peu transformé", 3: "Transformé", 4: "Ultra-transformé" };
  return <span className={`nova-badge nova-${group}`} title={`NOVA ${group} · ${labels[group]}`}>NOVA {group}</span>;
}
function deaccent(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function foodIcon(food?: Food) {
  if (!food) return "🍽️";
  if (food.icon) return food.icon;
  const n = deaccent(food.name);
  const has = (re: RegExp) => re.test(n);

  // Compléments
  if (has(/whey|proteine|isolat|isolate|caseine|gainer|\bbcaa\b|\beaa\b|collagene/)) return "🥤";
  if (has(/creatine|pre ?workout|booster/)) return "⚡";
  if (has(/multivitamine|vitamine|magnesium|omega|complement/)) return "💊";
  if (has(/electrolyte/)) return "💧";

  // Œufs & produits laitiers
  if (has(/oeuf|œuf/)) return "🥚";
  if (has(/yaourt|yogourt|skyr|fromage blanc|petit suisse|fromage frais/)) return "🥛";
  if (has(/fromage|comte|emmental|camembert|\bbrie\b|chevre|mozzarella|parmesan|cheddar|feta|raclette|gruyere|gouda|roquefort|cantal/)) return "🧀";
  if (has(/\blait\b|creme fraiche|beurre/)) return "🥛";

  // Viandes, abats & charcuterie
  if (has(/abat|foie|rognon|tripe|\blangue\b|gesier|ris de|andouille|cervelle/)) return "🍖";
  if (has(/poulet|dinde|volaille|caille|pintade|tender/)) return "🍗";
  if (has(/boeuf|steak|bavette|entrecote|bifteck|veau|agneau|mouton|\bporc\b|jambon|lardon|saucisse|merguez|chorizo|salami|bacon|magret|canard|gigot|escalope|viande|hache/)) return "🥩";

  // Poissons & fruits de mer
  if (has(/saumon|thon|cabillaud|colin|merlu|truite|maquereau|sardine|hareng|\bsole\b|lieu|dorade|anchois|poisson|surimi|morue/)) return "🐟";
  if (has(/crevette|gambas|crabe|homard|langoustine|moule|huitre|coquille|calamar|poulpe|seiche|fruits de mer/)) return "🦐";
  if (has(/sushi|maki|sashimi/)) return "🍣";

  // Plats & féculents
  if (has(/pizza/)) return "🍕";
  if (has(/burger|hamburger/)) return "🍔";
  if (has(/sandwich|wrap|kebab|panini|hot ?dog/)) return "🥪";
  if (has(/pates|spaghetti|penne|tagliatelle|lasagne|raviol|macaroni|coquillette|nouille/)) return "🍝";
  if (has(/\briz\b|risotto|paella/)) return "🍚";
  if (has(/frite|pomme de terre|patate|puree/)) return "🍟";
  if (has(/\bpain\b|baguette|brioche|biscotte|pita|tortilla/)) return "🍞";
  if (has(/cereale|avoine|muesli|granola|flocon|boulgour|semoule|quinoa|couscous/)) return "🥣";

  // Fruits
  if (has(/banane/)) return "🍌";
  if (has(/pomme(?! de terre)/)) return "🍎";
  if (has(/poire/)) return "🍐";
  if (has(/orange|clementine|mandarine/)) return "🍊";
  if (has(/\blime\b|citron/)) return "🍋";
  if (has(/kiwi/)) return "🥝";
  if (has(/fraise/)) return "🍓";
  if (has(/framboise|myrtille|\bmure\b|cassis|groseille|fruits rouges/)) return "🫐";
  if (has(/raisin/)) return "🍇";
  if (has(/pasteque/)) return "🍉";
  if (has(/melon/)) return "🍈";
  if (has(/ananas/)) return "🍍";
  if (has(/mangue/)) return "🥭";
  if (has(/cerise/)) return "🍒";
  if (has(/peche|abricot|nectarine|brugnon/)) return "🍑";
  if (has(/avocat/)) return "🥑";

  // Légumes
  if (has(/tomate/)) return "🍅";
  if (has(/carotte/)) return "🥕";
  if (has(/\bmais\b/)) return "🌽";
  if (has(/champignon|cepe|girolle/)) return "🍄";
  if (has(/brocoli|\bchou\b|salade|laitue|epinard|courgette|poireau|haricot vert|poivron|aubergine|concombre|courge|navet|fenouil|asperge|artichaut|legume/)) return "🥦";
  if (has(/oignon|echalote/)) return "🧅";
  if (has(/lentille|pois chiche|haricot|\bfeve\b|legumineuse|flageolet|\bpois\b/)) return "🫘";

  // Noix, huiles, sucré & boissons
  if (has(/noix|amande|noisette|cajou|pistache|cacahuete|pignon/)) return "🥜";
  if (has(/huile|\bolive/)) return "🫒";
  if (has(/chocolat|cacao/)) return "🍫";
  if (has(/glace|sorbet|creme glacee/)) return "🍨";
  if (has(/gateau|\bcake\b|tarte|patisserie|crepe|gaufre|\bflan\b|mousse/)) return "🍰";
  if (has(/oreo|biscuit|cookie|sable|madeleine|barre/)) return "🍪";
  if (has(/bonbon|confiserie|nougat|caramel/)) return "🍬";
  if (has(/miel|confiture|sirop/)) return "🍯";
  if (has(/cafe|expresso|espresso/)) return "☕";
  if (has(/\bthe\b|infusion|tisane/)) return "🍵";
  if (has(/\bjus\b|smoothie|nectar/)) return "🧃";
  if (has(/soda|cola|limonade/)) return "🥤";
  if (has(/\beau\b|water/)) return "💧";
  if (has(/\bvin\b|champagne|rhum|whisky|cognac|vodka|aperitif/)) return "🍷";
  if (has(/biere|cidre/)) return "🍺";

  // Repli par rayon
  const c = deaccent(food.category);
  if (/fruit|legume/.test(c)) return "🥗";
  if (/viande|poisson|proteine/.test(c)) return "🍖";
  if (/laitier|cremerie/.test(c)) return "🥛";
  if (/cereale|pain/.test(c)) return "🍞";
  if (/complement/.test(c)) return "💊";
  if (/boisson/.test(c)) return "🥤";
  return "🍽️";
}
function ProductResults({ foods, selectedId, onSelect }: { foods: Food[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!foods.length) return null;
  return <div className="product-results"><div className="result-title">Meilleurs résultats</div>{foods.map(f => <button type="button" key={f.id} className={`product-choice ${selectedId === f.id ? "active" : ""}`} onClick={() => onSelect(f.id)}><span className="mini-food-icon">{f.imageUrl ? <img src={f.imageUrl} alt=""/> : foodIcon(f)}</span><span className="product-choice-text"><strong>{f.name}</strong><small>{f.brand ? `${f.brand} · ` : ""}{f.macros.kcal} kcal/100g · {f.barcode ? `CB ${f.barcode} · ` : ""}{isPieceInput(f) ? `1 ${f.servingLabel || "portion"} ≈ ${estimateServingGrams(f)} g · ` : ""}{sourceLabel(f)}</small></span><span className={`source-badge ${sourceTone(f)}`}>{sourceLabel(f)}</span></button>)}</div>;
}
function ProductCard({ food, qty, macros, isFavorite, onToggleFavorite }: { food: Food; qty: number; macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; grams: number }; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  const [nnInfo, setNnInfo] = useState(false);
  const portion = isPieceInput(food) ? `1 ${food.servingLabel || "pièce"} ≈ ${estimateServingGrams(food)} g` : "Valeurs pour 100 g/ml";
  const selected = isPieceInput(food) ? `${qty} ${qty > 1 ? `${food.servingLabel || "pièce"}s` : (food.servingLabel || "pièce")} ≈ ${macros.grams} g` : `${qty} ${food.unit}`;
  return <><div className="product-card"><div className="product-image" aria-hidden="true">{food.imageUrl ? <img src={food.imageUrl} alt=""/> : <span>{foodIcon(food)}</span>}</div><div className="product-info"><div className="product-topline"><span className={`source-badge ${sourceTone(food)}`}>{sourceLabel(food)}</span><span className={`source-badge ${food.reliability === "estime" ? "estimated" : "manual"}`}>{food.reliability}</span><NutriScoreBadge grade={food.nutriScore}/><NovaBadge group={food.novaGroup}/>{(food.nutriScore || food.novaGroup) ? <button type="button" className="info-link" onClick={()=>setNnInfo(true)} aria-label="Comprendre le Nutri-Score et le groupe NOVA">ⓘ</button> : null}{onToggleFavorite &&<button type="button" className={`fav-btn ${isFavorite ? "on" : ""}`} onClick={onToggleFavorite} aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}>{isFavorite ? "★" : "☆"}</button>}</div><h3>{food.name}</h3><p className="muted">{food.brand ? `Marque : ${food.brand} · ` : ""}{portion}{food.barcode ? ` · Code-barres : ${food.barcode}` : ""}</p><p className="product-selected">Sélection : <strong>{selected}</strong></p>{food.ingredientsText && <p className="ingredients-note"><strong>Ingrédients :</strong> {food.ingredientsText.length > 240 ? `${food.ingredientsText.slice(0, 240)}…` : food.ingredientsText}</p>}{food.sourceRef && <p className="product-source-note">{food.sourceRef}</p>}<div className="product-macros"><span>{macros.kcal} kcal</span><span>P {macros.protein}g</span><span>G {macros.carbs}g</span><span>L {macros.fat}g</span></div></div></div><NutriNovaInfoModal open={nnInfo} onClose={()=>setNnInfo(false)} grade={food.nutriScore} group={food.novaGroup}/></>;
}

function MicroInline({ food }: { food: Food }) {
  const entries = MICRO_ORDER.filter(k => food.micros?.[k]).slice(0, 5);
  if (!entries.length) return <span className="muted">—</span>;
  return <div>{entries.map(k => <span className="tag" key={k}>{MICRO_LABELS[k].label} {cleanNumber(Number(food.micros?.[k] || 0))}{MICRO_LABELS[k].unit}</span>)}</div>;
}
function MicroPanel({ title, micros, onInfo }: { title: string; micros: Partial<Record<MicroKey, number>>; onInfo?: (k: MicroKey) => void }) {
  const groups = ["Vitamines", "Minéraux", "Autres"] as const;
  const hasAny = MICRO_ORDER.some(k => Number(micros[k] || 0) > 0);
  if (!hasAny) return <div className="micro-panel"><strong>{title}</strong><p className="muted">Aucune donnée micro disponible pour cet aliment.</p></div>;
  return <div className="micro-panel"><strong>{title}</strong>{onInfo && <p className="form-help" style={{margin:"4px 0 0"}}>Touche un élément pour son rôle et l'apport conseillé.</p>}{groups.map(group => {
    const keys = MICRO_ORDER.filter(k => MICRO_LABELS[k].group === group && Number(micros[k] || 0) > 0);
    if (!keys.length) return null;
    return <div key={group} className="micro-group"><span className="micro-group-title">{group}</span><div className="micro-grid">{keys.map(k => {
      const info = MICRO_LABELS[k];
      const v = cleanNumber(Number(micros[k] || 0));
      const pct = info.rda ? Math.round((Number(micros[k] || 0) / info.rda) * 100) : 0;
      return <button key={k} type="button" className="micro-cell" onClick={() => onInfo?.(k)} disabled={!onInfo}><span>{info.label}{onInfo && <span className="info-i">i</span>}</span><strong>{v}{info.unit}<small>{info.limit ? `${pct}% max` : `${pct}% VNR`}</small></strong></button>;
    })}</div></div>;
  })}</div>;
}
function ProgressRing({ value, max, color, top, bottom }: { value: number; max: number; color: string; top: string; bottom: string }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = C * (1 - pct);
  return (
    <svg viewBox="0 0 128 128" className="ring" role="img" aria-label={`${top} ${bottom}`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" className="ring-num">{top}</text>
      <text x="64" y="82" textAnchor="middle" className="ring-sub">{bottom}</text>
    </svg>
  );
}
function MacroPie({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9;
  const tot = pK + cK + fK;
  const shares = tot > 0 ? [pK / tot, cK / tot, fK / tot] : [0, 0, 0];
  const colors = ["#2f6b2f", "#f3a52c", "#8a6bd1"];
  let acc = 0;
  const arcs = shares.map((s) => {
    const len = s * C;
    const off = -acc * C;
    acc += s;
    return { dash: `${len} ${C - len}`, off };
  });
  return (
    <svg viewBox="0 0 128 128" className="ring" role="img" aria-label="Répartition des macros">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="16" />
      {tot > 0 && arcs.map((a, i) => (
        <circle key={i} cx="64" cy="64" r={r} fill="none" stroke={colors[i]} strokeWidth="16" strokeDasharray={a.dash} strokeDashoffset={a.off} transform="rotate(-90 64 64)" />
      ))}
      <text x="64" y="68" textAnchor="middle" className="ring-sub">{tot > 0 ? "P · G · L" : "—"}</text>
    </svg>
  );
}
function bmiCategory(bmi: number): { label: string; tone: string } {
  if (bmi < 18.5) return { label: "Maigreur", tone: "warn" };
  if (bmi < 25) return { label: "Corpulence normale", tone: "" };
  if (bmi < 30) return { label: "Surpoids", tone: "warn" };
  return { label: "Obésité", tone: "bad" };
}
function BmiInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>L&apos;IMC (indice de masse corporelle)</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">L&apos;IMC = poids (kg) ÷ taille² (m). C&apos;est un repère <strong>simple et rapide</strong> pour situer ta corpulence : maigreur (&lt; 18,5), normal (18,5–25), surpoids (25–30), obésité (&gt; 30).</p>
        <div className="macro-info-type"><strong>À quoi ça sert</strong><span>Un premier indicateur du risque lié au poids, facile à calculer et utile pour un suivi grossier dans le temps.</span></div>
        <div className="macro-info-type"><strong>Ses limites</strong><span>Il ne distingue PAS le muscle de la graisse : une personne musclée peut être classée « surpoids » sans excès de gras. Il ignore aussi la répartition des graisses, l&apos;âge, le sexe et l&apos;origine. Ce n&apos;est pas un diagnostic.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Si tu fais du sport, le <strong>taux de masse grasse</strong> (estimable dans ton profil) et le <strong>tour de taille</strong> sont bien plus parlants que l&apos;IMC seul.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Source : classification de l&apos;OMS (Organisation mondiale de la Santé).</p>
      </div>
    </div>
  );
}
function NutriNovaInfoModal({ open, onClose, grade, group }: { open: boolean; onClose: () => void; grade?: string; group?: number }) {
  if (!open) return null;
  const novaLabels: Record<number, string> = { 1: "Non transformé ou minimalement transformé", 2: "Ingrédient culinaire transformé", 3: "Aliment transformé", 4: "Aliment ultra-transformé" };
  const g = grade && /^[a-e]$/i.test(grade) ? grade.toUpperCase() : null;
  const n = group && [1, 2, 3, 4].includes(group) ? group : null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Nutri-Score &amp; NOVA</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>

        <div className="macro-info-type"><strong>Nutri-Score{g ? ` · ce produit :${g}` : ""}</strong><span>Une note de <strong>A (meilleur) à E</strong> qui résume la qualité nutritionnelle pour 100 g/mL. Elle compare les éléments <strong>favorables</strong> (fibres, protéines, fruits/légumes) aux éléments à <strong>limiter</strong> (calories, sucres, acides gras saturés, sel). C&apos;est un repère de comparaison entre produits d&apos;une même catégorie, pas un feu vert/rouge absolu.</span></div>

        <div className="macro-info-type"><strong>Groupe NOVA{n ? ` · ce produit :${n} (${novaLabels[n]})` : ""}</strong><span>Classe les aliments selon leur <strong>degré de transformation</strong> :<br/>1 = brut ou peu transformé (fruit, œuf, viande) · 2 = ingrédient culinaire (huile, sel) · 3 = transformé (conserve, pain, fromage) · <strong>4 = ultra-transformé</strong> (additifs, arômes, préparations industrielles). Un NOVA élevé n&apos;est pas « interdit », mais une alimentation riche en ultra-transformés est associée à de moins bons résultats de santé.</span></div>

        <p className="notice" style={{ marginTop: 12 }}>Ces deux indicateurs sont <strong>complémentaires</strong> : le Nutri-Score juge la composition nutritionnelle, NOVA le degré de transformation. Un produit peut avoir un bon Nutri-Score tout en étant ultra-transformé.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Nutri-Score : Santé publique France (modèle de profilage nutritionnel FSA/Ofcom). NOVA : Monteiro CA et al., « Ultra-processed foods: what they are and how to identify them », Public Health Nutrition, 2019. Données produits : Open Food Facts.</p>
      </div>
    </div>
  );
}
function CaloriesInfoModal({ open, onClose, targetKcal, manual }: { open: boolean; onClose: () => void; targetKcal: number; manual: boolean }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Comment tes calories/jour sont calculées</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        {targetKcal > 0 && <p className="macro-info-kcal" style={{ color: "var(--primary)" }}>Ta cible actuelle : {targetKcal} kcal/jour{manual ? " (fixée manuellement)" : ""}</p>}
        {manual
          ? <p className="macro-info-intro">Tu as <strong>fixé toi-même</strong> ta cible calorique dans ton profil : l&apos;app l&apos;utilise telle quelle et en déduit tes macros. Vide ce champ pour revenir au calcul automatique décrit ci-dessous.</p>
          : <p className="macro-info-intro">Ta cible est calculée en <strong>trois temps</strong>, à partir de ton profil :</p>}
        <div className="macro-info-type"><strong>1. Métabolisme de base</strong><span>Les calories brûlées au repos, estimées par l&apos;équation de <strong>Mifflin-St Jeor</strong> (ou <strong>Katch-McArdle</strong> si ta masse grasse est renseignée). Voir l&apos;info « Métabolisme de base » dans ton profil pour le détail des formules.</span></div>
        <div className="macro-info-type"><strong>2. × ton niveau d&apos;activité</strong><span>On multiplie par un facteur d&apos;activité (sédentaire ≈ 1,2 · léger ≈ 1,375 · modéré ≈ 1,55 · élevé ≈ 1,725 · très élevé ≈ 1,9) pour obtenir ta <strong>dépense énergétique totale</strong> (TDEE).</span></div>
        <div className="macro-info-type"><strong>3. Ajustement selon l&apos;objectif</strong><span>Perte de poids : −20 % · Sèche : −15 % (plus doux pour préserver le muscle) · Maintien : 0 % · Prise de masse : +10 %.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Un <strong>plancher de sécurité</strong> empêche de descendre sous ton métabolisme de base, ni sous 1700 kcal (homme) / 1500 kcal (femme). Et tu peux toujours imposer ta propre valeur dans le profil (« Calories/jour »).</p>
        <p className="notice" style={{ marginTop: 8 }}>Ce sont des <strong>estimations</strong> : la dépense réelle varie d&apos;une personne à l&apos;autre. Le plus fiable reste d&apos;ajuster sur 2-3 semaines selon l&apos;évolution de ton poids.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Mifflin MD &amp; St Jeor ST et al., Am J Clin Nutr, 1990 (métabolisme de base) ; FAO/WHO/UNU, « Human energy requirements », 2004 (niveaux d&apos;activité) ; Helms et al., 2014 et position de l&apos;ISSN (Jäger et al., 2017) pour un déficit préservant la masse musculaire.</p>
      </div>
    </div>
  );
}
function MetabolismInfoModal({ open, onClose, sex }: { open: boolean; onClose: () => void; sex: "homme" | "femme" }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Le métabolisme de base</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">Le <strong>métabolisme de base</strong> (MB) correspond aux calories que ton corps dépense au repos complet sur 24 h, juste pour se maintenir en vie (cœur, respiration, cerveau, température…). C&apos;est la base à partir de laquelle on ajoute ton activité pour obtenir ta dépense totale.</p>
        <div className="macro-info-type"><strong>Comment l&apos;app le calcule</strong><span>Par défaut avec l&apos;équation de <strong>Mifflin-St Jeor</strong> (la plus fiable sans mesure) :<br/>Homme : 10 × poids(kg) + 6,25 × taille(cm) − 5 × âge + 5<br/>Femme : 10 × poids(kg) + 6,25 × taille(cm) − 5 × âge − 161{sex === "femme" ? " (ta formule)" : " (l'autre)"}</span></div>
        <div className="macro-info-type"><strong>Si ta masse grasse est renseignée</strong><span>L&apos;app utilise alors <strong>Katch-McArdle</strong>, basée sur la masse maigre : MB = 370 + 21,6 × masse maigre(kg). Plus précis pour les personnes sportives.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Tu connais ta valeur (mesurée en calorimétrie, ou donnée par une balance/montre) ? Renseigne-la dans le champ « Métabolisme de base » du profil, l&apos;app l&apos;utilisera à la place de l&apos;estimation.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Mifflin MD &amp; St Jeor ST et al., « A new predictive equation for resting energy expenditure », Am J Clin Nutr, 1990 ; Katch &amp; McArdle, Exercise Physiology (masse maigre).</p>
      </div>
    </div>
  );
}
function HydrationInfoModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: number }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>💧 L&apos;objectif d&apos;hydratation</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">Ton objectif est estimé à environ <strong>35 mL d&apos;eau par kg de poids de corps</strong> et par jour (avec un minimum de 1,5 L), soit ta cible actuelle de <strong>{(goal / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} L</strong>.</p>
        <div className="macro-info-type"><strong>D&apos;où vient ce repère</strong><span>Les autorités de santé situent les besoins hydriques autour de <strong>2,0 L/jour pour les femmes</strong> et <strong>2,5 L/jour pour les hommes</strong> (eau des boissons). La règle des ~30 à 40 mL/kg est un repère clinique courant, adapté à ton poids.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Ce n&apos;est qu&apos;un repère : tes besoins montent avec la chaleur, l&apos;effort et la transpiration. Une partie de l&apos;eau vient aussi des aliments. Fie-toi aussi à ta soif et à la couleur de tes urines.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : EFSA, Scientific Opinion on Dietary Reference Values for water, EFSA Journal 2010 ; National Academies (IOM), Dietary Reference Intakes for Water, 2005.</p>
      </div>
    </div>
  );
}
function MicroDetailModal({ micro, onClose }: { micro: MicroKey | null; onClose: () => void }) {
  if (!micro) return null;
  const info = MICRO_LABELS[micro];
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>{info.label}</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-kcal" style={{ color: "var(--primary)" }}>{info.limit ? "Maximum conseillé" : "Apport de référence"} : {info.rda} {info.unit}/jour</p>
        <p className="macro-info-intro">{info.role}</p>
        <div className="macro-info-type"><strong>Où en trouver</strong><span>{info.sources}</span></div>
        <p className="notice" style={{ marginTop: 12 }}>{info.limit ? "Il s'agit d'un maximum : l'objectif est de rester en dessous." : "Valeur de référence adulte (EFSA / UE, proche des recommandations OMS). Les besoins varient selon l'âge, le sexe et l'activité."}</p>
        <p className="form-help" style={{ marginTop: 10 }}>Source : valeurs nutritionnelles de référence EFSA / UE ; recommandations OMS pour le sel et les sucres.</p>
      </div>
    </div>
  );
}
function HistoryChart({ points, target }: { points: { kcal: number; label: string }[]; target?: number }) {
  if (points.length < 2) return <div className="chart row" style={{ justifyContent: "center" }}>Pas encore assez de données pour tracer une courbe.</div>;
  const values = points.map(p => p.kcal);
  const maxV = Math.max(target || 0, ...values, 1);
  const range = Math.max(1, maxV);
  const y = (v: number) => 100 - (v / range) * 90 - 5;
  const line = points.map((p, i) => `${(i / (points.length - 1)) * 100},${y(p.kcal)}`).join(" ");
  const targetY = target ? y(target) : null;
  return (
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      {targetY !== null && <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.45" />}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function WeightChart({ weights }: { weights: WeightLog[] }) {
  const data = [...weights].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  if(data.length < 2) return <div className="chart row" style={{justifyContent:"center"}}>Ajoute au moins 2 pesées</div>;
  const min = Math.min(...data.map(d=>d.weightKg)); const max = Math.max(...data.map(d=>d.weightKg)); const range = Math.max(1, max-min);
  const pts = data.map((d,i)=>`${(i/(data.length-1))*100},${100-((d.weightKg-min)/range)*90-5}`).join(" ");
  return <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}
