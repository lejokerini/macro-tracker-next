"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureCiqualLoaded, estimateServingGrams, findFood, findFoodByBarcode, foods, formatQuantity, isCustomFood, isPieceInput, quantityToNutritionGrams, registerUserFoods, searchFoods, STORES } from "@/lib/food-engine";
import { buildWeeklyReport } from "@/lib/report";
import { COACH_PROGRAMS, adaptiveTDEE, average7, calculateTargets, effortFueling, isCoachProgram, theoreticalMaintenance, logMacros, recipeMacros, sumIngredients, tdeeHistory, trainingZones, weeklyRecap, weightTrendRecommendation, weightTrendPerWeek, type EffortIntensity } from "@/lib/nutrition";
import { COACH, coachWhatsAppLink } from "@/lib/coach";
import { makeT, LANGS, type Lang } from "@/lib/i18n";
import { TRAINING_METHODS, MEASURE_TOOLS, GOAL_SESSIONS, COMMON_MISTAKES, ENERGY_CONTRIB, ENERGY_RECOVERY, ENERGY_PRINCIPLES, bi } from "@/lib/training";
import { buildShoppingList, generateProgram, scoreProgram } from "@/lib/planner";
import { seedRecipes } from "@/data/recipes";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { MicroKey } from "@/lib/micros";
import { BmiInfoModal, CaloriesInfoModal, cleanNumber, foodIcon, HistoryChart, HydrationInfoModal, MacroPie, MetabolismInfoModal, MicroDetailModal, MicroInline, MicroPanel, ProductCard, ProductResults, ProgressRing, QuantityPicker, sourceLabel, bmiCategory, TdeeSparkline, WeightChart } from "@/components/app-widgets";
import { searchOpenFoodFacts } from "@/lib/openfoodfacts";
import dynamic from "next/dynamic";
import type { MacroKind } from "@/components/MacroInfoModal";
import { buildScannedFood, type EditableScanItem } from "@/lib/calsnap";
import { CIQUAL_FOOD_COUNT } from "@/data/ciqual-meta";
import type { DietType, Food, MealLogItem, MealType, PantryItem, Profile, ProgramMeal, Recipe, Store, WeightLog } from "@/lib/types";

type Tab = "dashboard" | "profil" | "journal" | "catalogue" | "recettes" | "programme" | "courses" | "placard" | "poids" | "effort" | "progres" | "sauvegarde";
type State = { profiles: Profile[]; activeProfileId?: string; logs: MealLogItem[]; pantry: PantryItem[]; weights: WeightLog[]; recipes: Recipe[]; program: ProgramMeal[]; offFoods: Food[]; favorites: string[]; water: Record<string, number>; premium?: boolean; lang?: Lang };

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


function uid(prefix="id") { return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`; }
function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function today() { return isoLocal(new Date()); }
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

// Fenêtres chargées à la demande : leur code (dont le lecteur de code-barres) n'est
// téléchargé qu'à la première ouverture, et non plus au démarrage de l'app.
const ModalLoading = () => <div className="snap-overlay" aria-busy="true" />;
const SnapModal = dynamic(() => import("@/components/SnapModal"), { ssr: false, loading: ModalLoading });
const BarcodeScanModal = dynamic(() => import("@/components/BarcodeScanModal"), { ssr: false, loading: ModalLoading });
const BodyFatModal = dynamic(() => import("@/components/BodyFatModal"), { ssr: false, loading: ModalLoading });
const MacroInfoModal = dynamic(() => import("@/components/MacroInfoModal"), { ssr: false, loading: ModalLoading });
const CreateRecipeModal = dynamic(() => import("@/components/CreateRecipeModal"), { ssr: false, loading: ModalLoading });
const CustomFoodModal = dynamic(() => import("@/components/CustomFoodModal"), { ssr: false, loading: ModalLoading });

// Devient vrai à la première ouverture puis le reste : la fenêtre reste montée
// ensuite et garde son contenu entre deux ouvertures, comme avant.
function useOpenedOnce(open: boolean) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
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
  const createRecipeMounted = useOpenedOnce(createRecipeOpen);
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
  const snapMounted = useOpenedOnce(snapOpen);
  const barcodeMounted = useOpenedOnce(barcodeOpen);
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  const [customFoodSeed, setCustomFoodSeed] = useState("");
  const [reportFeeling, setReportFeeling] = useState("");
  const bfModalMounted = useOpenedOnce(bfModalOpen);
  const macroInfoMounted = useOpenedOnce(macroInfo !== null);
  const [microDetail, setMicroDetail] = useState<MicroKey | null>(null);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gentleStart, setGentleStart] = useState(true);
  const [effortMin, setEffortMin] = useState(120);
  const [effortIntensity, setEffortIntensity] = useState<EffortIntensity>("modere");
  const [effortHeat, setEffortHeat] = useState(false);
  const [effortSport, setEffortSport] = useState("run");
  const [effortRestHr, setEffortRestHr] = useState(0);
  const [effortQuality, setEffortQuality] = useState("aero");
  const [methodFil, setMethodFil] = useState("");
  const [methodOpen, setMethodOpen] = useState(-1);
  const [qDetails, setQDetails] = useState(false);
  const [bioDistIdx, setBioDistIdx] = useState(0);
  const [bioRecovOpen, setBioRecovOpen] = useState(false);
  const [bioPrincOpen, setBioPrincOpen] = useState(false);
  const [recapSeen, setRecapSeen] = useState<string | null>(null);
  const [recapChecked, setRecapChecked] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [lastCloudSaveAt, setLastCloudSaveAt] = useState<string>("");
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextAutoSave = useRef(false);

  const dynamicFoods = useMemo(() => {
    const map = new Map<string, Food>();
    [...(state.offFoods || []), ...offResults].forEach(f => map.set(f.id, f));
    const list = [...map.values()];
    // Rend ces aliments visibles pour tous les calculs (TDEE réel, récap, bilan).
    registerUserFoods(list);
    return list;
  }, [state.offFoods, offResults]);
  // Aliments de l'utilisateur proposés dans la recherche : créés à la main ou déjà
  // scannés (pas les lignes issues d'une analyse photo).
  const userSavedFoods = useMemo(() => (state.offFoods || []).filter(f => f.source !== "estimated"), [state.offFoods]);
  const myFoods = useMemo(() => (state.offFoods || []).filter(f => isCustomFood(f)), [state.offFoods]);
  const usedFoodIds = useMemo(() => new Set(state.logs.map(l => l.foodId)), [state.logs]);
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
  const waterGoal = activeProfile?.customWaterMl && activeProfile.customWaterMl > 0 ? activeProfile.customWaterMl : (activeProfile ? Math.max(1500, Math.round(activeProfile.weightKg * 35)) : 2000);
  const lang: Lang = state.lang || "fr";
  const tr = makeT(lang);
  const weightGoal = (() => {
    const tw = activeProfile?.targetWeightKg;
    if (!tw || tw <= 0) return null;
    const cur = average7(state.weights);
    if (cur == null) return null;
    const diff = Math.round((tw - cur) * 10) / 10; // + = prendre, - = perdre
    const reached = Math.abs(diff) < 0.3;
    const daysLeft = activeProfile?.targetDate ? Math.round((new Date(activeProfile.targetDate + "T12:00:00").getTime() - Date.now()) / 86400000) : null;
    const requiredPerWeek = (daysLeft != null && daysLeft > 0) ? Math.round((diff / (daysLeft / 7)) * 100) / 100 : null;
    const safeMax = diff < 0 ? Math.min(1, Math.round(cur * 0.01 * 100) / 100) : 0.5;
    const paceOk = requiredPerWeek == null ? null : Math.abs(requiredPerWeek) <= safeMax + 0.02;
    const trend = weightTrendPerWeek(state.weights);
    let etaDate: string | null = null;
    let movingToward: boolean | null = null;
    if (trend != null && !reached) {
      if (Math.abs(trend) < 0.05) movingToward = null; // poids stable
      else {
        movingToward = (diff < 0 && trend < 0) || (diff > 0 && trend > 0);
        if (movingToward) etaDate = new Date(Date.now() + (diff / trend) * 7 * 86400000).toLocaleDateString(lang === "es" ? "es-ES" : "fr-FR");
      }
    }
    return { cur, target: tw, diff, reached, daysLeft, requiredPerWeek, safeMax, paceOk, trend, etaDate, movingToward };
  })();
  const maintenanceKcal = activeProfile ? theoreticalMaintenance(activeProfile) : 0;
  const adaptiveTdee = adaptiveTDEE(state.logs, state.weights);
  const tdeeHist = tdeeHistory(state.logs, state.weights);
  const effortFuel = effortFueling({ durationMin: effortMin, intensity: effortIntensity, weightKg: activeProfile?.weightKg || 70, heat: effortHeat });
  const recap = weeklyRecap(state.logs, state.weights);
  const recapDue = recapChecked && recap.daysLogged > 0 && (!recapSeen || (new Date(today()).getTime() - new Date(recapSeen).getTime()) / 86400000 >= 7);
  const fcMax = activeProfile?.age && activeProfile.age > 0 ? Math.round(208 - 0.7 * activeProfile.age) : null; // FC max estimée (Tanaka 2001)
  const zoneCalc = fcMax ? trainingZones(fcMax, effortRestHr > 0 ? effortRestHr : undefined) : null;
  // Calories conseillées pour tenir le rythme de l'objectif (base = TDEE réel si fiable, sinon maintien théorique).
  const goalEatKcal = weightGoal && weightGoal.requiredPerWeek != null
    ? Math.round(((adaptiveTdee.reliable ? adaptiveTdee.tdee : maintenanceKcal) + (weightGoal.requiredPerWeek * 7700) / 7) / 10) * 10
    : null;
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
  useEffect(() => { try { setRecapSeen(localStorage.getItem("macrolens-recap-seen")); } catch {} setRecapChecked(true); }, []);
  useEffect(() => {
    if (!recapDue) return;
    try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Macrolens", { body: tr("recap.nudge") }); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapDue]);
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

  const staticVisibleFoods = useMemo(() => searchFoods(query, { category, diet: activeProfile?.diet, excludeAllergens: activeProfile?.allergies, extra: query.trim() ? userSavedFoods : myFoods }), [query, category, activeProfile?.diet, activeProfile?.allergies, ciqualReady, userSavedFoods, myFoods]);
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
    const coachPick = form.get("coachProgram");
    const profile: Profile = {
      id: profileId || uid("profile"), firstName: String(form.get("firstName") || "Antoine"), lastName: String(form.get("lastName") || "Dupont"),
      sex: form.get("sex") as Profile["sex"], age: Number(form.get("age") || 25), heightCm: Number(form.get("heightCm") || 175), weightKg: frNum(form.get("weightKg"), 70),
      bodyFatPct: frNum(form.get("bodyFatPct"), 0) || undefined, activity: Number(form.get("activity") || 1.55), goal: form.get("goal") as Profile["goal"], coachProgram: isCoachProgram(coachPick) ? coachPick : undefined, proteinPerKg: frNum(form.get("proteinPerKg"), 0) || undefined, customBmr: frNum(form.get("customBmr"), 0) || undefined, customKcal: frNum(form.get("customKcal"), 0) || undefined, customWaterMl: frNum(form.get("customWaterMl"), 0) || undefined, targetWeightKg: frNum(form.get("targetWeightKg"), 0) || undefined, targetDate: String(form.get("targetDate") || "") || undefined, diet: form.get("diet") as DietType,
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
    showToast(tr("journal.addedTo") + food.name);
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
    showToast(`${items.length} ${tr("journal.addedN")}`);
  }
  function addBarcodeFood(food: Food, baseGrams: number, displayQty: number, displayUnit: "piece" | "g" | "cl", mealForItem: MealType) {
    setState(s => ({
      ...s,
      offFoods: (s.offFoods || []).some(f => f.id === food.id) ? (s.offFoods || []) : [...(s.offFoods || []), food],
      logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: baseGrams, displayQty, displayUnit, meal: mealForItem, date }],
    }));
    setTab("journal");
    showToast(tr("journal.addedTo") + food.name);
  }
  // Aliment créé (journal ou code-barres introuvable) : enregistré avec les autres
  // aliments de l'utilisateur, donc sauvegardé et synchronisé comme eux.
  function saveCustomFood(food: Food, selectInJournal = true) {
    setState(s => {
      const list = s.offFoods || [];
      const exists = list.some(f => f.id === food.id);
      return { ...s, offFoods: exists ? list.map(f => f.id === food.id ? food : f) : [...list, food] };
    });
    if (selectInJournal) { setQuery(food.name); setSelectedFood(food.id); setCustomFoodOpen(false); setTab("journal"); }
    showToast(tr("cf.saved") + food.name);
  }
  function deleteCustomFood(food: Food) {
    if (state.logs.some(l => l.foodId === food.id)) { showToast(tr("cf.usedHint")); return; }
    setState(s => ({ ...s, offFoods: (s.offFoods || []).filter(f => f.id !== food.id), favorites: (s.favorites || []).filter(id => id !== food.id) }));
  }
  function openCustomFood(seed = "") { setCustomFoodSeed(seed); setCustomFoodOpen(true); }
  const weeklyReport = useMemo(() => buildWeeklyReport({ profile: activeProfile, logs: state.logs, weights: state.weights, targets, feeling: reportFeeling, lang: lang === "es" ? "es" : "fr" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, state.logs, state.weights, targets?.kcal, targets?.protein, reportFeeling, lang, dynamicFoods]);
  async function shareReport() {
    const text = weeklyReport.text;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* partage annulé : on copie */ }
    try { await navigator.clipboard.writeText(text); showToast(tr("report.copied")); } catch { showToast(tr("report.copyFail")); }
  }
  function quickAddFood(food: Food) {
    const q = isPieceInput(food) ? 1 : 100;
    const baseQty = quantityToNutritionGrams(food, q);
    setState(s => ({
      ...s,
      offFoods: (food.source === "openfoodfacts" || food.source === "estimated") && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []),
      logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: baseQty, displayQty: q, displayUnit: isPieceInput(food) ? "piece" : food.unit, meal: selectedMeal, date }],
    }));
    showToast(tr("journal.addedTo") + food.name);
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
  function applyGoalCalories(kcal: number) {
    if (!activeProfile) return;
    setState(s => ({ ...s, profiles: s.profiles.map(p => p.id === s.activeProfileId ? { ...p, customKcal: kcal } : p) }));
    showToast(`${tr("w.appliedPre")}${kcal} ${tr("w.perDay")}`);
  }
  function seenRecap(goProgres: boolean) {
    const t = today();
    try { localStorage.setItem("macrolens-recap-seen", t); } catch {}
    setRecapSeen(t);
    if (goProgres) setTab("progres");
  }
  function enableRecapNotif() {
    try { if (typeof Notification !== "undefined" && Notification.requestPermission) Notification.requestPermission(); } catch {}
  }
  function shareRecap() {
    const parts = [
      tr("recap.shareText"),
      `${recap.avgKcal} ${tr("recap.avgKcal")} · ${recap.daysLogged}/7 ${tr("recap.days")}`,
      `P ${recap.avgProtein}g · G ${recap.avgCarbs}g · L ${recap.avgFat}g ${tr("recap.perDayShort")}`,
    ];
    if (recap.weightChange != null && recap.weightChange !== 0) parts.push(`${tr("recap.weight")} ${recap.weightChange > 0 ? "+" : ""}${recap.weightChange} kg`);
    if (streak > 0) parts.push(`${streak} ${tr("recap.streak")}`);
    const text = parts.join("\n");
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) { nav.share({ title: tr("recap.title"), text }).catch(() => {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => showToast(tr("recap.screenshot"))).catch(() => {}); }
    else { showToast(tr("recap.screenshot")); }
  }
  function applyGoal(g: (typeof GOAL_SESSIONS)[number]) {
    setEffortMin(g.durationMin);
    setEffortIntensity(g.intensity);
    setEffortQuality(g.quality);
    showToast(tr("eff.goalApplied"));
  }
  function logEffortFuel(carbsG: number, fluidMl: number) {
    const food = findFoodAny("fr_ravito_effort");
    if (food && carbsG > 0) {
      const grams = Math.round(carbsG); // 100 g de produit = 100 g de glucides
      setState(s => ({ ...s, logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: grams, displayQty: grams, displayUnit: "g", meal: "Collation", date }] }));
    }
    if (fluidMl > 0) addWater(Math.round(fluidMl));
    showToast(tr("eff.added"));
  }
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
          {streak > 0 && <button type="button" className="badge-streak" onClick={()=>setTab("progres")}>🔥 {streak} j de suite</button>}
          <button type="button" className="hero-link" onClick={()=>setTab("catalogue")}>{CIQUAL_FOOD_COUNT.toLocaleString("fr-FR")} aliments Ciqual</button>
          <button type="button" className="hero-link" onClick={()=>setTab("recettes")}>{seedRecipes.length} recettes</button>
          <button type="button" className="hero-link" onClick={()=>setTab("journal")}>Quantités ajustables</button>
        </div>
      </div>
      <div className="profile-card clickable-nav" onClick={()=>setTab("profil")} role="button" tabIndex={0} title="Ouvrir le profil">
        <span className="muted">Profil actif</span>
        {activeProfile ? <><strong>{activeProfile.firstName} {activeProfile.lastName}</strong><br/><span className="muted">{activeProfile.diet} · {STORES[activeProfile.store].label} · budget {activeProfile.weeklyBudget} €/sem</span></> : <><strong>Aucun profil</strong><br/><span className="muted">Crée un profil pour personnaliser les calculs.</span></>}
        <span className="cloud-mini">{session?.user ? `Cloud connecté · ${autoSync ? "auto-save ON" : "auto-save OFF"}` : supabase ? "Cloud prêt · non connecté" : "Cloud non configuré"}</span>
      </div>
    </header>
    <nav className="tabs">{(["dashboard","profil","journal","catalogue","recettes","programme","courses","placard","poids","effort","progres","sauvegarde"] as Tab[]).map(t => <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{tr("tab."+t)}</button>)}<button className="theme-toggle" onClick={toggleTheme} aria-label="Basculer le thème clair/sombre">{theme === "dark" ? tr("theme.light") : tr("theme.dark")}</button></nav>

    {tab === "dashboard" && <section className="grid">
      {recapDue && <div className="card span-12" style={{background:"linear-gradient(135deg,#eef8e9,#fffaf0)",borderColor:"#d8e9cc"}}><div className="space" style={{flexWrap:"wrap",gap:8}}><span style={{fontWeight:900}}>📊 {tr("recap.nudge")}</span><div className="row" style={{gap:8}}><button className="btn" onClick={()=>seenRecap(true)}>{tr("recap.nudgeSee")}</button><button className="btn secondary" onClick={enableRecapNotif}>{tr("recap.enableNotif")}</button><button className="btn secondary" onClick={()=>seenRecap(false)}>{tr("recap.later")}</button></div></div></div>}
      {!activeProfile && <div className="card span-12 onboarding-card"><h2>{tr("onboarding.welcome")}</h2><p className="muted">{tr("onboarding.text")}</p><div className="row" style={{marginTop:8}}><button className="btn" onClick={()=>setTab("profil")}>{tr("onboarding.createProfile")}</button><button className="btn secondary" onClick={()=>setSnapOpen(true)}>{tr("onboarding.trySnap")}</button></div></div>}
      <div className="card span-4 chart-card clickable-nav" onClick={()=>setTab("journal")} role="button" tabIndex={0}><h3>{tr("dash.calories")} <button type="button" className="info-link" onClick={(e)=>{e.stopPropagation(); setKcalInfoOpen(true);}} aria-label="Comment les calories du jour sont calculées">ⓘ</button></h3><ProgressRing value={totals.kcal} max={targets?.kcal || 0} color="var(--primary-2)" top={`${totals.kcal}`} bottom={targets ? `/ ${targets.kcal}` : "kcal"} /><span className="chart-foot">{targets ? `${Math.max(0, targets.kcal - totals.kcal)} kcal restantes` : "Crée un profil pour ta cible"}</span></div>
      <div className="card span-4 chart-card clickable-nav" onClick={()=>setTab("journal")} role="button" tabIndex={0}><h3>{tr("dash.macros")}</h3><MacroPie protein={totals.protein} carbs={totals.carbs} fat={totals.fat} /><div className="macro-legend"><button type="button" onClick={(e)=>{e.stopPropagation(); setMacroInfo("protein");}}><i className="legend-dot" style={{background:"#2f6b2f"}} />P {totals.protein}g <span className="info-i">i</span></button><button type="button" onClick={(e)=>{e.stopPropagation(); setMacroInfo("carbs");}}><i className="legend-dot" style={{background:"#f3a52c"}} />G {totals.carbs}g <span className="info-i">i</span></button><button type="button" onClick={(e)=>{e.stopPropagation(); setMacroInfo("fat");}}><i className="legend-dot" style={{background:"#8a6bd1"}} />L {totals.fat}g <span className="info-i">i</span></button></div><span className="chart-foot">🌾 Fibres {totals.fiber}{targets ? ` / ${targets.fiber}` : ""} g</span></div>
      <div className="card span-4 chart-card"><h3>{tr("dash.hydration")} <button type="button" className="info-link" onClick={()=>setHydrInfoOpen(true)} aria-label="Comment l'objectif d'hydratation est calculé">ⓘ</button></h3><ProgressRing value={(state.water||{})[date]||0} max={waterGoal} color="#3b9bd6" top={`${(state.water||{})[date]||0}`} bottom={`/ ${waterGoal} ml`} /><div className="row water-btns"><button className="btn secondary" onClick={()=>addWater(100)}>+10cl</button><button className="btn secondary" onClick={()=>addWater(150)}>+15cl</button><button className="btn secondary" onClick={()=>addWater(250)}>+25cl</button><button className="btn secondary" onClick={()=>addWater(500)}>+50cl</button><button className="btn secondary" onClick={()=>addWater(-100)} disabled={!((state.water||{})[date])}>−10cl</button></div></div>
      <div className="card span-12"><MicroPanel title={tr("dash.micros")} micros={microsToday} onInfo={setMicroDetail}/></div>
    </section>}

    {tab === "profil" && <section className="grid">
      <div className="card span-8">
        <div className="space"><div><h2>{activeProfile ? tr("prof.editTitle") : tr("prof.createTitle")}</h2><p className="muted">{tr("prof.intro")}</p></div>{activeProfile && <button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:undefined}))}>{tr("prof.newProfile")}</button>}</div>
        {activeProfile && targets && <div className="target-panel"><div><span>{tr("prof.kcalDay")}</span><strong>{targets.kcal}</strong></div><div><span>{tr("common.protein")}</span><strong>{targets.protein}g</strong></div><div><span>{tr("common.carbs")}</span><strong>{targets.carbs}g</strong></div><div><span>{tr("common.fat")}</span><strong>{targets.fat}g</strong></div><div><span>{tr("common.fiber")}</span><strong>{targets.fiber}g</strong></div></div>}
        {activeProfile && isCoachProgram(activeProfile.coachProgram) && <p className="form-help" style={{margin:"10px 0 4px"}}>{tr("coach.active")} <strong>{tr("coach."+activeProfile.coachProgram)}</strong></p>}
        <form action={saveProfile} className="grid" key={activeProfile?.id || "new-profile"}>
      <input type="hidden" name="profileId" value={activeProfile?.id || ""}/>
      <div className="span-6"><label>{tr("prof.firstName")}</label><input name="firstName" placeholder="Antoine" defaultValue={activeProfile?.firstName || ""} /></div><div className="span-6"><label>{tr("prof.lastName")}</label><input name="lastName" placeholder="Dupont" defaultValue={activeProfile?.lastName || ""} /></div>
      <div className="span-3"><label>{tr("prof.sex")}</label><select name="sex" defaultValue={activeProfile?.sex || "homme"}><option value="homme">{tr("prof.male")}</option><option value="femme">{tr("prof.female")}</option></select></div><div className="span-3"><label>{tr("prof.age")}</label><input name="age" type="number" defaultValue={activeProfile?.age || 25}/></div><div className="span-3"><label>{tr("prof.height")}</label><input name="heightCm" type="number" defaultValue={activeProfile?.heightCm || 175}/></div><div className="span-3"><label>{tr("prof.weight")}</label><input name="weightKg" type="text" inputMode="decimal" placeholder="ex. 65,45" defaultValue={activeProfile?.weightKg ?? 70}/></div>
      <div className="span-12"><label>{tr("prof.coachProgram")}</label><select name="coachProgram" defaultValue={activeProfile?.coachProgram || ""} onChange={e=>{const pick=e.currentTarget.value; const goalSel=e.currentTarget.form?.elements.namedItem("goal"); if(isCoachProgram(pick) && goalSel instanceof HTMLSelectElement) goalSel.value=COACH_PROGRAMS[pick].goal;}}><option value="">{tr("coach.none")}</option>{(["masse","seche","forme","combat"] as const).map(k=><option key={k} value={k}>{tr("coach."+k)}</option>)}</select><p className="form-help">{tr("coach.help")}</p></div>
      <div className="span-3"><label>{tr("prof.bodyFat")}</label><div className="bf-row"><input name="bodyFatPct" type="text" inputMode="decimal" placeholder="optionnel" value={bodyFat} onChange={e=>setBodyFat(e.target.value)}/><button type="button" className="btn secondary bf-estimate" onClick={()=>setBfModalOpen(true)}>{tr("prof.estimate")}</button></div></div><div className="span-3"><label>{tr("prof.activity")}</label><select name="activity" defaultValue={String(activeProfile?.activity || 1.55)}><option value="1.2">{tr("act.sedentary")}</option><option value="1.375">{tr("act.light")}</option><option value="1.55">{tr("act.moderate")}</option><option value="1.725">{tr("act.high")}</option><option value="1.9">{tr("act.veryHigh")}</option></select></div><div className="span-3"><label>{tr("prof.goal")}</label><select name="goal" defaultValue={activeProfile?.goal || "maintien"} onChange={e=>{const progSel=e.currentTarget.form?.elements.namedItem("coachProgram"); if(progSel instanceof HTMLSelectElement && isCoachProgram(progSel.value) && COACH_PROGRAMS[progSel.value].goal!==e.currentTarget.value) progSel.value="";}}><option value="perte">{tr("goal.perte")}</option><option value="seche">{tr("goal.seche")}</option><option value="maintien">{tr("goal.maintien")}</option><option value="prise_masse">{tr("goal.prise_masse")}</option></select></div><div className="span-3"><label>{tr("prof.protPerKg")}</label><select name="proteinPerKg" defaultValue={activeProfile?.proteinPerKg ? String(activeProfile.proteinPerKg) : ""}><option value="">{tr("prof.autoByGoal")}</option><option value="1.6">1,6 g/kg</option><option value="1.8">1,8 g/kg</option><option value="2.0">2,0 g/kg</option><option value="2.2">2,2 g/kg</option><option value="2.4">2,4 g/kg</option><option value="2.6">2,6 g/kg</option></select></div><div className="span-12"><p className="form-help"><strong>Perte de poids</strong> = déficit plus marqué (~20 %) pour perdre du gras plus vite. <strong>Sèche</strong> = déficit plus modéré (~15 %) avec davantage de protéines pour préserver le muscle (idéal si tu es déjà sec/sportif). Un plancher de sécurité empêche des calories trop basses (jamais sous ton métabolisme de base, ni sous 1700 kcal homme / 1500 kcal femme).</p></div>
      <div className="span-12"><p className="form-help">Protéines par kg de poids de corps. Repère : <strong>1,6 g/kg</strong> = minimum pour progresser ; <strong>1,8–2,2 g/kg</strong> = zone optimale (maintien / prise de masse) ; <strong>2,2–2,6 g/kg</strong> = conseillé en sèche pour préserver le muscle pendant le déficit calorique. Au-delà, peu de bénéfice prouvé. « Auto » choisit selon ton objectif (et ta masse maigre si renseignée).</p></div><div className="span-3"><label>{tr("prof.bmr")} <button type="button" className="info-link" onClick={()=>setMetabInfoOpen(true)} aria-label="Comment le métabolisme de base est calculé">ⓘ</button></label><input name="customBmr" type="text" inputMode="numeric" placeholder={tr("prof.autoCalc")} defaultValue={activeProfile?.customBmr ? String(activeProfile.customBmr) : ""}/></div><div className="span-3"><label>{tr("prof.customKcal")}</label><input name="customKcal" type="text" inputMode="numeric" placeholder={tr("prof.autoCalc")} defaultValue={activeProfile?.customKcal ? String(activeProfile.customKcal) : ""}/></div><div className="span-3"><label>{tr("prof.waterGoal")}</label><input name="customWaterMl" type="text" inputMode="numeric" placeholder={tr("prof.autoCalc")} defaultValue={activeProfile?.customWaterMl ? String(activeProfile.customWaterMl) : ""}/></div><div className="span-3"><label>{tr("prof.targetWeight")}</label><input name="targetWeightKg" type="text" inputMode="decimal" placeholder="ex. 72" defaultValue={activeProfile?.targetWeightKg ? String(activeProfile.targetWeightKg) : ""}/></div><div className="span-3"><label>{tr("prof.targetDate")}</label><input name="targetDate" type="date" defaultValue={activeProfile?.targetDate || ""}/></div><div className="span-12"><p className="form-help">Laisse ces deux champs <strong>vides</strong> pour un calcul automatique. <strong>Métabolisme de base</strong> : si tu connais ta valeur (mesurée), l&apos;app l&apos;utilise à la place de l&apos;estimation. <strong>Calories/jour</strong> : impose directement ta cible calorique (elle remplace tout le calcul : objectif, activité, plancher).</p></div><div className="span-3"><label>{tr("prof.diet")}</label><select name="diet" defaultValue={activeProfile?.diet || "omnivore"}><option value="omnivore">{tr("diet.omnivore")}</option><option value="flexitarien">{tr("diet.flexitarien")}</option><option value="pescetarien">{tr("diet.pescetarien")}</option><option value="vegetarien">{tr("diet.vegetarien")}</option><option value="vegan">{tr("diet.vegan")}</option><option value="sans_porc">{tr("diet.sans_porc")}</option></select></div>
      <div className="span-3"><label>{tr("prof.budget")}</label><select name="weeklyBudget" defaultValue={String(activeProfile?.weeklyBudget || 75)}><option>50</option><option>75</option><option>100</option><option>150</option><option>200</option></select></div><div className="span-3"><label>{tr("prof.store")}</label><select name="store" defaultValue={activeProfile?.store || "leclerc"}>{Object.entries(STORES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div><div className="span-3"><label>{tr("prof.maxPrep")}</label><input name="maxPrepTime" type="number" defaultValue={activeProfile?.maxPrepTime || 30}/></div><div className="span-3"><label>{tr("prof.cookLevel")}</label><select name="cookingLevel" defaultValue={activeProfile?.cookingLevel || "normal"}><option value="etudiant">{tr("cook.etudiant")}</option><option value="normal">{tr("cook.normal")}</option><option value="meal_prep">{tr("cook.meal_prep")}</option><option value="famille">{tr("cook.famille")}</option></select></div>
      <div className="span-6"><label>{tr("prof.liked")}</label><input name="likedFoods" placeholder="riz, poulet, skyr" defaultValue={activeProfile?.likedFoods.join(", ") || ""}/></div><div className="span-6"><label>{tr("prof.disliked")}</label><input name="dislikedFoods" placeholder="thon, fromage, etc." defaultValue={activeProfile?.dislikedFoods.join(", ") || ""}/></div>
      <div className="span-12"><label>{tr("prof.allergies")}</label><div className="row">{ALLERGENS.map(a=><label key={a} className="tag"><input type="checkbox" name={`allergy_${a}`} defaultChecked={!!activeProfile?.allergies.includes(a)} style={{width:"auto"}}/> {ALLERGEN_LABELS[a] || a}</label>)}</div><p className="form-help">« Graines &amp; pépins » exclut les graines, oléagineux et petits pépins (utile en cas de diverticules).</p></div>
      <div className="span-12"><label>{tr("prof.trainingDays")}</label><div className="row">{["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"].map((d,i)=><label key={d} className="tag"><input type="checkbox" name={`day_${i}`} defaultChecked={!!activeProfile?.trainingDays.includes(i)} style={{width:"auto"}}/> {tr("day."+d)}</label>)}</div></div>
      <div className="span-12"><label>{tr("prof.fasting")}</label><select name="fasting" defaultValue={currentFasting(activeProfile)}><option value="none">{tr("fast.none")}</option><option value="window_pm">{tr("fast.window_pm")}</option><option value="window_am">{tr("fast.window_am")}</option><option value="omad">{tr("fast.omad")}</option></select><p className="form-help">Le jeûne intermittent = concentrer les repas sur une fenêtre horaire (~8h de repas, ~16h de jeûne). Deux façons courantes : commencer à manger vers midi (sans petit-déj) ou arrêter vers 16h (sans dîner). Son intérêt vient surtout de la réduction de l'apport calorique, sans être supérieur à un simple déficit bien suivi (source : de Cabo &amp; Mattson, <em>New England Journal of Medicine</em>, 2019). Le générateur répartit tes calories sur la fenêtre choisie. Pour exclure un ingrédient (soja, gluten…), utilise « Allergies / exclusions » ci-dessus.</p></div>
      <div className="span-12"><button className="btn">{activeProfile ? tr("prof.updateBtn") : tr("prof.createBtn")}</button></div>
    </form></div><div className="span-4 side-stack"><div className="card"><h3>{tr("prof.existing")}</h3><div className="list">{state.profiles.map(p=><div className="item" key={p.id}><div className="space"><strong>{p.firstName} {p.lastName}</strong><button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:p.id}))}>{tr("prof.activate")}</button></div><span className="muted">{p.goal} · {p.diet}</span><div className="row" style={{marginTop:8}}><button className="btn danger" onClick={()=>{if(confirm("Supprimer ce profil ?")) setState(s=>({ ...s, profiles: s.profiles.filter(x=>x.id!==p.id), activeProfileId: s.activeProfileId === p.id ? undefined : s.activeProfileId }))}}>{tr("common.delete")}</button></div></div>)}</div>{!state.profiles.length && <p className="muted">{tr("prof.noProfile")}</p>}</div><div className="card coach-card"><h3>{tr("coach.cardTitle")}</h3><p className="muted">{tr("coach.cardText")}</p><div className="row"><a className="btn" href={coachWhatsAppLink(tr("coach.waMessage"))} target="_blank" rel="noopener noreferrer">{tr("coach.cardCta")}</a>{COACH.siteUrl && <a className="btn secondary" href={COACH.siteUrl} target="_blank" rel="noopener noreferrer">{tr("coach.cardSite")}</a>}</div></div></div></section>}

    {tab === "journal" && <section className="grid">
      <div className="card span-4"><h2>{tr("journal.add")}</h2><button className="btn snap-cta" onClick={()=>setSnapOpen(true)}>{tr("journal.snapCta")}</button><button className="btn secondary snap-cta" onClick={()=>setBarcodeOpen(true)}>{tr("journal.scanCta")}</button><button type="button" className="btn secondary snap-cta" onClick={()=>openCustomFood(query.trim())}>{tr("cf.journalCta")}</button><label>{tr("common.date")}</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /><label>{tr("common.meal")}</label><select value={selectedMeal} onChange={e=>setSelectedMeal(e.target.value as MealType)}>{MEALS.map(m=><option key={m} value={m}>{tr("meal."+m)}</option>)}</select>{(favoriteFoods.length > 0 || recentFoods.length > 0) && <div className="quick-foods">{favoriteFoods.length > 0 && <><div className="quick-foods-title">{tr("journal.favorites")}</div><div className="quick-foods-row">{favoriteFoods.slice(0,8).map(f=><button type="button" key={f.id} className="quick-food-chip" onClick={()=>quickAddFood(f)} title="Ajouter au journal"><span>{foodIcon(f)}</span>{f.name}</button>)}</div></>}{recentFoods.length > 0 && <><div className="quick-foods-title">{tr("journal.recents")}</div><div className="quick-foods-row">{recentFoods.slice(0,8).map(f=><button type="button" key={f.id} className="quick-food-chip" onClick={()=>quickAddFood(f)} title="Ajouter au journal"><span>{foodIcon(f)}</span>{f.name}</button>)}</div></>}</div>}<label>{tr("common.search")}</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("journal.searchPlaceholder")}/><p className="form-help">Recherche locale + Open Food Facts pour les produits de marque.</p>{offLoading && <p className="form-help">Recherche Open Food Facts en cours...</p>}{offError && <p className="form-help bad-text">{offError}</p>}<ProductResults foods={foodOptions.slice(0,10)} selectedId={selectedFood} onSelect={setSelectedFood}/>{!foodOptions.length && !offLoading && <p className="form-help bad-text">{tr("cf.noResult")} <button type="button" className="info-link" onClick={()=>openCustomFood(query.trim())}>{tr("cf.createNamed").replace("{name}", query.trim() || "…")}</button></p>}{selectedFoodObj && <ProductCard food={selectedFoodObj} qty={qty} macros={selectedPreview} isFavorite={(state.favorites||[]).includes(selectedFoodObj.id)} onToggleFavorite={()=>toggleFavorite(selectedFoodObj)}/>}<QuantityPicker value={qty} onChange={setQty} food={selectedFoodObj} unit={journalUnit} onUnitChange={changeJournalUnit}/><div className="macro-preview"><span>{selectedPreview.kcal} kcal</span><span>P {selectedPreview.protein}g</span><span>G {selectedPreview.carbs}g</span><span>L {selectedPreview.fat}g</span><span>Fibres {selectedPreview.fiber}g</span></div><MicroPanel title="Vitamines & minéraux de l'aliment" micros={selectedMicros} onInfo={setMicroDetail}/><button className="btn" disabled={!selectedFood || !foodOptions.length || qty <= 0} onClick={addFoodLog}>{tr("journal.addToJournal")}</button></div>
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

    {tab === "poids" && <section className="grid"><div className="card span-4"><h2>{tr("w.fastingWeigh")}</h2><label>{tr("w.morningWeight")}</label><input type="text" inputMode="decimal" placeholder="ex. 70,90" value={weightInput} onChange={e=>setWeightInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const w=frNum(weightInput,0); if(w>0){addWeight(w); setWeightInput("");}}}}/><button className="btn" style={{marginTop:8}} disabled={frNum(weightInput,0)<=0} onClick={()=>{const w=frNum(weightInput,0); if(w>0){addWeight(w); setWeightInput("");}}}>{tr("w.addWeigh")}</button></div><div className="card span-8"><h2>{tr("w.tracking")}</h2><p>{tr("w.avg7")}<strong>{average7(state.weights) ?? "—"} kg</strong></p>{bmi ? <p>{tr("w.imc")}<strong>{bmi.toFixed(1)}</strong> <span className={`tag ${bmiCategory(bmi).tone}`}>{bmiCategory(bmi).label}</span> <button type="button" className="info-link" onClick={()=>setBmiInfoOpen(true)}>{tr("w.imcInfo")}</button></p> : <p className="muted">{tr("w.imcHint")}</p>}<p className="notice">{activeProfile ? weightTrendRecommendation(activeProfile, state.weights) : tr("w.createProfileReco")}</p><WeightChart weights={state.weights} targetWeightKg={activeProfile?.targetWeightKg} targetDate={activeProfile?.targetDate} trendPerWeek={weightTrendPerWeek(state.weights)}/>{(activeProfile?.targetWeightKg || weightTrendPerWeek(state.weights) != null) && <p className="form-help">{tr("w.projection")}</p>}<div className="list">{state.weights.slice(-10).reverse().map(w=><div className="item" key={w.id}>{w.date} · {w.weightKg} kg · <span className="muted">{w.note}</span></div>)}</div></div><div className="card span-12"><h2>{tr("w.goalTitle")}</h2>{!weightGoal ? <p className="muted">{tr("w.goalNoTarget")}</p> : weightGoal.reached ? <p className="notice"><strong>{tr("w.goalReached")}</strong></p> : <><p>{tr("w.goalTargetLabel")} : <strong>{weightGoal.target} kg</strong>{activeProfile?.targetDate ? <>{tr("w.goalBy")}<strong>{new Date(activeProfile.targetDate+"T12:00:00").toLocaleDateString(lang==="es"?"es-ES":"fr-FR")}</strong></> : null} · {tr("w.goalCurrent")} {weightGoal.cur} kg ({weightGoal.diff > 0 ? "+" : ""}{weightGoal.diff} kg)</p>{weightGoal.daysLeft != null && weightGoal.daysLeft <= 0 && <p className="bad-text">{tr("w.goalPastDate")}</p>}{weightGoal.requiredPerWeek != null && <p>{tr("w.goalNeedPace")} : <strong>{weightGoal.requiredPerWeek > 0 ? "+" : ""}{weightGoal.requiredPerWeek} {tr("w.perWeek")}</strong> ({weightGoal.daysLeft} {tr("w.goalDaysLeft")})</p>}<p className="notice">{tr("w.goalSafe")} {weightGoal.paceOk === false ? tr("w.goalTooFast") : weightGoal.paceOk === true ? tr("w.goalRealistic") : ""}</p>{goalEatKcal != null && <p><strong>{tr("w.goalEat")} {goalEatKcal} {tr("w.perDay")}</strong></p>}{goalEatKcal != null && <button className="btn secondary" style={{marginTop:2}} onClick={()=>applyGoalCalories(goalEatKcal)}>{tr("w.applyGoal")}</button>}{weightGoal.trend == null ? <p className="form-help">{tr("w.needWeighs")}</p> : weightGoal.movingToward === true && weightGoal.etaDate ? <p className="muted">{tr("w.goalTrendReachPre")}<strong>{weightGoal.etaDate}</strong>.</p> : weightGoal.movingToward === false ? <p className="muted">{tr("w.goalTrendAway")}</p> : <p className="muted">{tr("w.goalTrendFlat")}</p>}</>}</div><div className="card span-12"><h2>{tr("tdee.title")}</h2>{!adaptiveTdee.reliable ? <p className="muted">{tr("tdee.needData")} ({adaptiveTdee.daysLogged}/14)</p> : <><p className="macro-info-kcal" style={{color:"var(--primary)"}}>{adaptiveTdee.tdee} {tr("tdee.perDay")}</p><p className="muted">{tr("tdee.theoretical")} : {maintenanceKcal} kcal · {tr("tdee.basedOn")} {adaptiveTdee.daysLogged} {tr("tdee.days")}</p><p className="notice">{adaptiveTdee.tdee - maintenanceKcal > 120 ? tr("tdee.above") : adaptiveTdee.tdee - maintenanceKcal < -120 ? tr("tdee.below") : tr("tdee.close")}</p>{tdeeHist.length >= 2 && <><p className="muted" style={{marginTop:6}}>{tr("tdee.history")}</p><TdeeSparkline points={tdeeHist}/><div className="row" style={{justifyContent:"space-between",fontSize:12,opacity:0.7}}><span>{tdeeHist[0].label} · {tdeeHist[0].tdee}</span><span>{tdeeHist[tdeeHist.length-1].label} · {tdeeHist[tdeeHist.length-1].tdee}</span></div></>}<p className="form-help">{tr("tdee.caveat")}</p></>}</div></section>}

    {tab === "effort" && <section className="grid">
      <div className="card span-12"><h2>🏃 {tr("eff.title")}</h2><p className="muted">{tr("eff.desc")}</p>
        <div className="grid" style={{marginTop:8}}>
          <div className="span-3"><label>{tr("eff.sport")}</label><select value={effortSport} onChange={e=>setEffortSport(e.target.value)}><option value="run">{tr("eff.sportRun")}</option><option value="bike">{tr("eff.sportBike")}</option><option value="other">{tr("eff.sportOther")}</option></select></div>
          <div className="span-3"><label>{tr("eff.duration")}</label><input type="number" min={0} step={15} value={effortMin} onChange={e=>setEffortMin(Math.max(0, Math.round(Number(e.target.value)||0)))}/></div>
          <div className="span-3"><label>{tr("eff.intensity")}</label><select value={effortIntensity} onChange={e=>setEffortIntensity(e.target.value as EffortIntensity)}><option value="facile">{tr("eff.intFacile")}</option><option value="modere">{tr("eff.intModere")}</option><option value="intense">{tr("eff.intIntense")}</option></select></div>
          <div className="span-3"><label>{tr("eff.heat")}</label><div className="toggle-line" style={{margin:0}}><input type="checkbox" checked={effortHeat} onChange={e=>setEffortHeat(e.target.checked)}/><span>☀️ {tr("eff.heat")}</span></div></div>
        </div>
        <div className="notice" style={{marginTop:10}}><strong>{tr("eff.zonesTitle")}</strong>{!zoneCalc ? <p className="form-help">{tr("eff.fcmaxNo")}</p> : <>
          <div style={{maxWidth:220,marginTop:6}}><label>{tr("eff.restHr")}</label><input type="number" min={0} value={effortRestHr>0?effortRestHr:""} onChange={e=>setEffortRestHr(Math.max(0,Math.round(Number(e.target.value)||0)))}/></div>
          <p className="form-help"><strong>{tr("eff.fcmax")} : {fcMax} bpm</strong> · {zoneCalc.method === "hrr" ? tr("eff.methodHrr") : tr("eff.methodHrmax")}</p>
          {zoneCalc.zones.map(z => <p className="form-help" key={z.key}><strong>{tr("eff."+z.key+"Name")} ({z.lowBpm}–{z.highBpm} bpm)</strong> — {tr("eff."+z.key+"Desc")}</p>)}
          <p className="form-help">{tr("eff.zoneMap")}</p>
          <p className="form-help" style={{opacity:0.7}}>{tr("eff.fcmaxHint")} {tr("eff.zonesSrc")}</p>
        </>}</div>
      </div>
      <div className="card span-12"><h2>{tr("eff.qTitle")}</h2>
        <div className="row" style={{flexWrap:"wrap",gap:8}}>{["aero","vma","lac","alac"].map(q=><button key={q} type="button" className={`filter-chip ${effortQuality===q?"active":""}`} onClick={()=>{setEffortQuality(q);setQDetails(false);}}>{tr("eff.q_"+q+"_name")}</button>)}</div>
        <p style={{marginTop:10}}><strong>{tr("eff.qFil")} :</strong> {tr("eff.q_"+effortQuality+"_fil")}</p>
        <p><strong>{tr("eff.qHow")} :</strong> {tr("eff.q_"+effortQuality+"_how")}</p>
        <p><strong>{tr("eff.qDur")} :</strong> {tr("eff.q_"+effortQuality+"_dur")}</p>
        <p><strong>{tr("eff.qInt")} :</strong> {tr("eff.q_"+effortQuality+"_int")}</p>
        <p><strong>{tr("eff.qEx")} :</strong> {tr("eff.q_"+effortQuality+"_ex")}</p>
        <p className="notice"><strong>{tr("eff.qNut")} :</strong> {tr("eff.q_"+effortQuality+"_nut")}</p>
        <button className="btn secondary" style={{marginTop:4}} onClick={()=>setQDetails(!qDetails)}>{qDetails ? tr("eff.qLess") : tr("eff.qMore")}</button>
        {qDetails && <div style={{marginTop:8}}>
          <p><strong>{tr("eff.qPow")} :</strong> {tr("eff.q_"+effortQuality+"_pow")}</p>
          <p><strong>{tr("eff.qRec")} :</strong> {tr("eff.q_"+effortQuality+"_rec")}</p>
          <p><strong>{tr("eff.qRecov")} :</strong> {tr("eff.q_"+effortQuality+"_recov")}</p>
          <p><strong>{tr("eff.qLim")} :</strong> {tr("eff.q_"+effortQuality+"_lim")}</p>
          <p><strong>{tr("eff.qAdapt")} :</strong> {tr("eff.q_"+effortQuality+"_adapt")}</p>
        </div>}
        <p className="form-help" style={{opacity:0.7}}>{tr("eff.qSrc")}</p>
      </div>
      <div className="card span-8"><h2>{tr("eff.during")} · {effortFuel.hours} h</h2>
        {!effortFuel.needsFuel ? <p className="notice">{tr("eff.noFuel")}</p> : <>
          <div className="target-panel" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
            <div><span>{tr("eff.carbs")}</span><strong>{effortFuel.carbsPerHour}</strong><span>{tr("eff.gPerH")} · {effortFuel.carbsTotal} {tr("eff.total") || "total"}</span></div>
            <div><span>{tr("eff.water")}</span><strong>{effortFuel.fluidPerHour}</strong><span>{tr("eff.mlPerH")} · {effortFuel.fluidTotal}</span></div>
            <div><span>{tr("eff.sodium")}</span><strong>{effortFuel.sodiumPerHour}</strong><span>{tr("eff.mgPerH")} · {effortFuel.sodiumTotal}</span></div>
          </div>
          <p className="muted">{effortFuel.carbType === "mix" ? tr("eff.carbTypeMix") : tr("eff.carbTypeSimple")}</p>
          <p className="notice">⏱️ {tr("eff.tip")}</p>
          <p className="form-help">🥤 {tr("eff.drinkSpec")}</p>
          <p className="form-help">💧 {tr("eff.dehydration")}</p>
          <p className="form-help" style={{opacity:0.7}}>{tr("eff.fuelSrc")}</p>
          <button className="btn" style={{marginTop:8}} onClick={()=>logEffortFuel(effortFuel.carbsTotal, effortFuel.fluidTotal)}>{tr("eff.addJournal")}</button>
        </>}
      </div>
      <div className="card span-4">
        {effortFuel.preMealCarbs != null && <><h2>{tr("eff.before")}</h2><p>{tr("eff.beforeCarbs")} <strong>{effortFuel.preMealCarbs} {tr("eff.gCarbs")}</strong></p></>}
        <h2 style={{marginTop: effortFuel.preMealCarbs != null ? 12 : 0}}>{tr("eff.after")}</h2>
        <p>{tr("eff.afterLine")}</p>
        <p><strong>{effortFuel.postCarbs} {tr("eff.gCarbs")}</strong> · <strong>{effortFuel.postProtein} {tr("eff.gProtein")}</strong></p>
        <p className="form-help">{tr("eff.recovery")}</p>
        <p className="form-help" style={{opacity:0.7}}>{tr("eff.recoverySrc")}</p>
        <p className="form-help" style={{marginTop:6}}><strong>❄️ {tr("eff.coldTitle")}</strong> — {(effortSport === "run" || effortSport === "bike") ? tr("eff.coldEndurance") : tr("eff.coldStrength")}</p>
        <p className="form-help">{tr("eff.coldWarn")}</p>
        <p className="form-help" style={{opacity:0.7}}>{tr("eff.coldSrc")}</p>
      </div>
      <div className="card span-12"><h2>{tr("eff.sleepTitle")}</h2><p>{tr("eff.sleepTarget")}</p><p className="muted">{tr("eff.sleepNutri")}</p><p className="muted">{tr("eff.sleepHydra")}</p><p className="notice">{tr("eff.sleepWarn")}</p><p className="form-help" style={{opacity:0.7}}>{tr("eff.sleepSrc")}</p></div>
      <div className="card span-12"><h2>{tr("eff.mTitle")}</h2><p className="muted">{tr("eff.mPickHint")}</p>
        <div className="row" style={{flexWrap:"wrap",gap:8}}>{Array.from(new Set(TRAINING_METHODS.map(m=>m.fil.fr))).map(f=>{const row=TRAINING_METHODS.find(m=>m.fil.fr===f); const label=row?bi(row.fil,lang):f; return <button key={f} type="button" className={`filter-chip ${methodFil===f?"active":""}`} onClick={()=>{setMethodFil(methodFil===f?"":f);setMethodOpen(-1);}}>{label}</button>;})}</div>
        {methodFil && <div className="list" style={{marginTop:10}}>{TRAINING_METHODS.filter(m=>m.fil.fr===methodFil).map((m,i)=><div className="item" key={i} style={{cursor:"pointer"}} onClick={()=>setMethodOpen(methodOpen===i?-1:i)}><div className="space"><strong>{bi(m.obj,lang)}</strong><span className="muted">{methodOpen===i?"−":"+"}</span></div>{methodOpen===i && <div style={{marginTop:6}}><p><strong>{tr("eff.mMeth")} :</strong> {bi(m.meth,lang)}</p><p><strong>{tr("eff.mEx")} :</strong> {bi(m.ex,lang)}</p><p><strong>{tr("eff.mInt")} :</strong> {bi(m.intensite,lang)}</p><p><strong>{tr("eff.mRec")} :</strong> {bi(m.recup,lang)}</p></div>}</div>)}</div>}
      </div>
      <div className="card span-6"><h2>{tr("eff.goalTitle")}</h2><p className="muted">{tr("eff.goalTapHint")}</p><div className="scroll"><table className="table"><thead><tr><th>{tr("eff.goalCol")}</th><th>{tr("eff.goalFil")}</th><th>{tr("eff.goalSes")}</th></tr></thead><tbody>{GOAL_SESSIONS.map((r,i)=><tr key={i} onClick={()=>applyGoal(r)} style={{cursor:"pointer"}} title={tr("eff.goalTapHint")}><td><strong>{bi(r.goal,lang)}</strong></td><td>{bi(r.fil,lang)}</td><td>{bi(r.session,lang)}</td></tr>)}</tbody></table></div></div>
      <div className="card span-6"><h2>{tr("eff.toolTitle")}</h2><div className="scroll"><table className="table"><thead><tr><th>{tr("eff.toolCol")}</th><th>{tr("eff.toolRepl")}</th><th>{tr("eff.toolUse")}</th></tr></thead><tbody>{MEASURE_TOOLS.map((r,i)=><tr key={i}><td><strong>{bi(r.tool,lang)}</strong></td><td>{bi(r.repl,lang)}</td><td>{bi(r.use,lang)}</td></tr>)}</tbody></table></div></div>
      <div className="card span-6"><h2>{tr("eff.mistTitle")}</h2><div className="scroll"><table className="table"><thead><tr><th>{tr("eff.mistErr")}</th><th>{tr("eff.mistWhy")}</th><th>{tr("eff.mistFix")}</th></tr></thead><tbody>{COMMON_MISTAKES.map((r,i)=><tr key={i}><td><strong>{bi(r.err,lang)}</strong></td><td>{bi(r.why,lang)}</td><td>{bi(r.fix,lang)}</td></tr>)}</tbody></table></div></div>
      <div className="card span-12"><h2>{tr("eff.bioTitle")}</h2>
        <p className="muted" style={{marginTop:4}}><strong>{tr("eff.bioContrib")}</strong></p>
        <div className="row" style={{flexWrap:"wrap",gap:8}}>{ENERGY_CONTRIB.map((r,i)=><button key={i} type="button" className={`filter-chip ${bioDistIdx===i?"active":""}`} onClick={()=>setBioDistIdx(i)}>{r.dist}</button>)}</div>
        {(() => { const r = ENERGY_CONTRIB[bioDistIdx]; return <div className="target-panel" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))",marginTop:10}}><div><span>PCr</span><strong>{r.pcr}</strong></div><div><span>{tr("eff.q_lac_name")}</span><strong>{r.ana}</strong></div><div><span>{tr("eff.q_aero_name")}</span><strong>{r.aero}</strong></div></div>; })()}
        {ENERGY_CONTRIB[bioDistIdx].note.fr && <p className="form-help">{bi(ENERGY_CONTRIB[bioDistIdx].note,lang)}</p>}
        <p className="form-help" style={{opacity:0.7}}>{tr("eff.bioNote")}</p>
        <button className="btn secondary" style={{marginTop:6}} onClick={()=>setBioRecovOpen(!bioRecovOpen)}>{tr("eff.bioRecovery")}</button>
        {bioRecovOpen && <div style={{marginTop:6}}>{ENERGY_RECOVERY.map((t,i)=><p className="form-help" key={i}>• {bi(t,lang)}</p>)}</div>}
        <button className="btn secondary" style={{marginTop:6,marginLeft:8}} onClick={()=>setBioPrincOpen(!bioPrincOpen)}>{tr("eff.bioPrinciples")}</button>
        {bioPrincOpen && <div className="notice" style={{marginTop:6}}>{ENERGY_PRINCIPLES.map((t,i)=><p className="form-help" key={i}>{bi(t,lang)}</p>)}</div>}
        <p className="form-help" style={{opacity:0.7,marginTop:8}}>{tr("eff.bioSrc")}</p>
      </div>
      <div className="card span-12"><p className="form-help">{tr("eff.vitamins")}</p><p className="form-help">{tr("eff.disclaimer")}</p></div>
    </section>}

    {tab === "progres" && <section className="grid">
      <div className="card span-12 report-card">
        <h2>{tr("report.title")}</h2>
        <p className="muted">{tr("report.intro")}</p>
        <label>{tr("report.feeling")}</label>
        <textarea rows={2} value={reportFeeling} onChange={e=>setReportFeeling(e.target.value.slice(0, 400))} placeholder={tr("report.feelingPh")} />
        <pre className="report-preview">{weeklyReport.text}</pre>
        <div className="row">
          <a className="btn" href={coachWhatsAppLink(weeklyReport.text)} target="_blank" rel="noopener noreferrer">{tr("report.sendCoach")}</a>
          <button type="button" className="btn secondary" onClick={shareReport}>{tr("report.share")}</button>
        </div>
        {weeklyReport.daysLogged < 4 && <p className="form-help">{tr("report.fewDays")}</p>}
      </div>
      <div className="card span-12" style={{background:"linear-gradient(135deg,#173018,#2f6b2f)",color:"#fff",border:"none"}}>
        <div className="space"><h2 style={{color:"#fff",margin:0}}>📊 {tr("recap.title")}</h2><span style={{opacity:.85,fontWeight:900,letterSpacing:"-.02em"}}>Macrolens</span></div>
        {recap.daysLogged === 0 ? <p style={{opacity:.9,marginTop:8}}>{tr("recap.needData")}</p> : <>
          <div style={{display:"flex",alignItems:"baseline",gap:10,margin:"10px 0"}}><strong style={{fontSize:44,letterSpacing:"-.04em"}}>{recap.avgKcal}</strong><span style={{opacity:.9}}>{tr("recap.avgKcal")} · {recap.daysLogged}/7 {tr("recap.days")}</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
            <div style={{background:"rgba(255,255,255,.12)",borderRadius:14,padding:"10px 6px",textAlign:"center"}}><span style={{opacity:.85,fontSize:12,fontWeight:900}}>{tr("recap.protein")}</span><br/><strong style={{fontSize:20}}>{recap.avgProtein} g</strong></div>
            <div style={{background:"rgba(255,255,255,.12)",borderRadius:14,padding:"10px 6px",textAlign:"center"}}><span style={{opacity:.85,fontSize:12,fontWeight:900}}>{tr("recap.carbs")}</span><br/><strong style={{fontSize:20}}>{recap.avgCarbs} g</strong></div>
            <div style={{background:"rgba(255,255,255,.12)",borderRadius:14,padding:"10px 6px",textAlign:"center"}}><span style={{opacity:.85,fontSize:12,fontWeight:900}}>{tr("recap.fat")}</span><br/><strong style={{fontSize:20}}>{recap.avgFat} g</strong></div>
          </div>
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4}}>
            {recap.weightChange != null && recap.weightChange !== 0 && <span>⚖️ <strong>{recap.weightChange>0?"+":""}{recap.weightChange} kg</strong> {recap.weightChange>0?tr("recap.weightUp"):tr("recap.weightDown")}</span>}
            {adaptiveTdee.reliable && <span>🔥 {tr("recap.tdee")} : <strong>{adaptiveTdee.tdee} kcal</strong></span>}
            {recap.topFood && <span>🍽️ {tr("recap.topFood")} : <strong>{recap.topFood}</strong></span>}
            {streak > 0 && <span>📆 <strong>{streak}</strong> {tr("recap.streak")}</span>}
          </div>
          <div className="row" style={{marginTop:12}}><button className="btn secondary" onClick={shareRecap}>{tr("recap.share")}</button></div>
          <p style={{opacity:.75,fontSize:12,marginTop:8}}>{tr("recap.screenshot")}</p>
        </>}
      </div>
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
      <div className="span-12" style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:18,marginTop:6}}><a href="/confidentialite" className="info-link">{tr("acc.privacy")}</a><a href="/mentions-legales" className="info-link">{tr("acc.legal")}</a></div>
    </section>}

    {snapMounted && <SnapModal open={snapOpen} onClose={()=>setSnapOpen(false)} onConfirm={addScannedItems} onScanBarcode={()=>{ setSnapOpen(false); setBarcodeOpen(true); }} defaultMeal={selectedMeal} date={date} dailyLimit={state.premium ? 50 : 5} isPremium={!!state.premium} lang={lang} />}
    {barcodeMounted && <BarcodeScanModal open={barcodeOpen} onClose={()=>setBarcodeOpen(false)} onConfirm={addBarcodeFood} defaultMeal={selectedMeal} date={date} lang={lang} findLocal={(code)=>findFoodByBarcode(code, state.offFoods || [])} onCreateFood={(food)=>saveCustomFood(food, false)} />}
    {customFoodOpen && <CustomFoodModal open={customFoodOpen} onClose={()=>setCustomFoodOpen(false)} myFoods={myFoods} usedIds={usedFoodIds} initialName={customFoodSeed} lang={lang} onSave={(food, isNew)=>saveCustomFood(food, isNew)} onDelete={deleteCustomFood} />}
    {bfModalMounted && <BodyFatModal open={bfModalOpen} onClose={()=>setBfModalOpen(false)} onApply={(v)=>{ setBodyFat(String(v)); setBfModalOpen(false); }} defaultSex={activeProfile?.sex || "homme"} defaultHeight={activeProfile?.heightCm} lang={lang} />}
    {macroInfoMounted && <MacroInfoModal macro={macroInfo} onClose={()=>setMacroInfo(null)} lang={lang} />}
    {createRecipeMounted && <CreateRecipeModal open={createRecipeOpen} onClose={()=>setCreateRecipeOpen(false)} onSave={addCustomRecipe} lang={lang} />}
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
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupTracking")}</span><button className="sheet-item" onClick={()=>{setTab("progres");setMenuOpen(false);}}>{tr("menu.progress")}</button><button className="sheet-item" onClick={()=>{setTab("poids");setMenuOpen(false);}}>{tr("menu.weight")}</button><button className="sheet-item" onClick={()=>{setTab("effort");setMenuOpen(false);}}>{tr("menu.effort")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupKitchen")}</span><button className="sheet-item" onClick={()=>{setTab("recettes");setMenuOpen(false);}}>{tr("menu.recipes")}</button><button className="sheet-item" onClick={()=>{setTab("programme");setMenuOpen(false);}}>{tr("menu.program")}</button><button className="sheet-item" onClick={()=>{setTab("courses");setMenuOpen(false);}}>{tr("menu.shopping")}</button><button className="sheet-item" onClick={()=>{setTab("placard");setMenuOpen(false);}}>{tr("menu.pantry")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupAccount")}</span><button className="sheet-item" onClick={()=>{setTab("profil");setMenuOpen(false);}}>{tr("menu.profile")}</button><button className="sheet-item" onClick={()=>{setTab("sauvegarde");setMenuOpen(false);}}>{tr("menu.account")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">{tr("menu.groupAppearance")}</span><button className="sheet-item" onClick={toggleTheme}>{theme==="dark"?tr("theme.lightFull"):tr("theme.darkFull")}</button></div>
        <div className="sheet-group"><span className="sheet-group-title">🌐 {tr("common.language")}</span>{LANGS.map(l=><button key={l.code} className={`sheet-item ${lang===l.code?"active":""}`} onClick={()=>setState(s=>({...s, lang: l.code}))}>{lang===l.code?"✓ ":""}{l.label}</button>)}</div>
      </div>
    </div>}
  </main>;
}
