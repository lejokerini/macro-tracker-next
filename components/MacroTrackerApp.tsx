"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { estimateServingGrams, findFood, foods, formatQuantity, isPieceInput, quantityToNutritionGrams, searchFoods, STORES, unitLabel } from "@/lib/food-engine";
import { average7, calculateTargets, logMacros, recipeMacros, sumIngredients, weightTrendRecommendation } from "@/lib/nutrition";
import { buildShoppingList, generateProgram, scoreProgram } from "@/lib/planner";
import { seedRecipes } from "@/data/recipes";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { searchOpenFoodFacts } from "@/lib/openfoodfacts";
import SnapModal from "@/components/SnapModal";
import BarcodeScanModal from "@/components/BarcodeScanModal";
import { buildScannedFood, type EditableScanItem } from "@/lib/calsnap";
import { CIQUAL_FOOD_COUNT } from "@/data/ciqual-foods.generated";
import type { DietType, Food, MealLogItem, MealType, PantryItem, Profile, ProgramMeal, Recipe, Store, WeightLog } from "@/lib/types";

type Tab = "dashboard" | "profil" | "journal" | "catalogue" | "recettes" | "programme" | "courses" | "placard" | "poids" | "sauvegarde";
type State = { profiles: Profile[]; activeProfileId?: string; logs: MealLogItem[]; pantry: PantryItem[]; weights: WeightLog[]; recipes: Recipe[]; program: ProgramMeal[]; offFoods: Food[] };
type MicroKey = "sugars" | "salt" | "calcium" | "iron" | "magnesium" | "potassium" | "sodium" | "zinc" | "vitA" | "vitD" | "vitE" | "vitC" | "vitB1" | "vitB2" | "vitB3" | "vitB6" | "vitB9" | "vitB12";

const TAB_LABELS: Record<Tab, string> = { dashboard: "Dashboard", profil: "Profil", journal: "Journal", catalogue: "Catalogue", recettes: "Recettes", programme: "Programme", courses: "Courses", placard: "Placard", poids: "Poids", sauvegarde: "Mon compte" };
const STORAGE_KEY = "macro-tracker-next-v3";
const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];
const ALLERGENS = ["gluten","lait","oeufs","soja","fruits_a_coque","poisson","crustaces","mollusques","sesame","moutarde","celeri","alcool"];
const emptyState: State = { profiles: [], logs: [], pantry: [], weights: [], recipes: seedRecipes, program: [], offFoods: [] };
function hasUserData(state: State) {
  return state.profiles.length > 0 || state.logs.length > 0 || state.pantry.length > 0 || state.weights.length > 0 || state.program.length > 0;
}
function stateForCloud(state: State) {
  return { ...state, recipes: state.recipes?.length ? state.recipes : seedRecipes };
}

const MICRO_LABELS: Record<MicroKey, { label: string; unit: string; group: "Vitamines" | "Minéraux" | "Autres" }> = {
  sugars: { label: "Sucres", unit: "g", group: "Autres" },
  salt: { label: "Sel", unit: "g", group: "Autres" },
  calcium: { label: "Calcium", unit: "mg", group: "Minéraux" },
  iron: { label: "Fer", unit: "mg", group: "Minéraux" },
  magnesium: { label: "Magnésium", unit: "mg", group: "Minéraux" },
  potassium: { label: "Potassium", unit: "mg", group: "Minéraux" },
  sodium: { label: "Sodium", unit: "mg", group: "Minéraux" },
  zinc: { label: "Zinc", unit: "mg", group: "Minéraux" },
  vitA: { label: "Vit. A", unit: "µg", group: "Vitamines" },
  vitD: { label: "Vit. D", unit: "µg", group: "Vitamines" },
  vitE: { label: "Vit. E", unit: "mg", group: "Vitamines" },
  vitC: { label: "Vit. C", unit: "mg", group: "Vitamines" },
  vitB1: { label: "B1", unit: "mg", group: "Vitamines" },
  vitB2: { label: "B2", unit: "mg", group: "Vitamines" },
  vitB3: { label: "B3", unit: "mg", group: "Vitamines" },
  vitB6: { label: "B6", unit: "mg", group: "Vitamines" },
  vitB9: { label: "B9", unit: "µg", group: "Vitamines" },
  vitB12: { label: "B12", unit: "µg", group: "Vitamines" },
};
const MICRO_ORDER = Object.keys(MICRO_LABELS) as MicroKey[];

function uid(prefix="id") { return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`; }
function today() { return new Date().toISOString().slice(0,10); }
function cleanNumber(value: number) { return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 100) / 100; }

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
function scaledFoodMacros(food: Food | undefined, inputQty: number) {
  return macrosFromBaseGrams(food, quantityToNutritionGrams(food, inputQty));
}
function scaledMicros(food: Food | undefined, inputQty: number) {
  const grams = quantityToNutritionGrams(food, inputQty);
  return scaledMicrosFromBase(food, grams);
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedMeal, setSelectedMeal] = useState<MealType>("Déjeuner");
  const [selectedFood, setSelectedFood] = useState("");
  const [qty, setQty] = useState(100);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeMealFilter, setRecipeMealFilter] = useState<"all" | MealType>("all");
  const [selectedRecipeId, setSelectedRecipeId] = useState(seedRecipes[0]?.id || "");
  const [recipeServings, setRecipeServings] = useState(1);
  const [checkedRecipeItems, setCheckedRecipeItems] = useState<Record<string, boolean>>({});
  const [offResults, setOffResults] = useState<Food[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState("");
  const [snapOpen, setSnapOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
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
  const allFoods = useMemo(() => [...dynamicFoods, ...foods], [dynamicFoods]);
  function findFoodAny(id?: string) { return id ? allFoods.find(f => f.id === id) : undefined; }

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  const targets = activeProfile ? calculateTargets(activeProfile) : null;
  const categories = useMemo(() => ["all", ...Array.from(new Set(foods.map(f => f.category))).sort((a,b)=>a.localeCompare(b,"fr"))], []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) {
      try {
        const parsed = JSON.parse(raw);
        setState({ ...emptyState, ...parsed, recipes: parsed.recipes?.length ? parsed.recipes : seedRecipes });
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

  const staticVisibleFoods = useMemo(() => searchFoods(query, { category, diet: activeProfile?.diet, excludeAllergens: activeProfile?.allergies }), [query, category, activeProfile?.diet, activeProfile?.allergies]);
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
    setQty(isPieceInput(selectedFoodObj) ? 1 : 100);
  }, [selectedFoodObj?.id]);

  const selectedPreview = scaledFoodMacros(selectedFoodObj, qty);
  const selectedMicros = scaledMicros(selectedFoodObj, qty);
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
  const programScore = activeProfile && targets ? scoreProgram(state.program, state.recipes, targets, activeProfile.weeklyBudget, activeProfile.store) : null;
  const shopping = activeProfile ? buildShoppingList(state.program, state.recipes, state.pantry, activeProfile.store) : [];

  const filteredRecipes = useMemo(() => state.recipes.filter(r => {
    const q = recipeQuery.trim().toLowerCase();
    if (recipeMealFilter !== "all" && r.mealType !== recipeMealFilter) return false;
    if (!q) return true;
    return `${r.title} ${r.tags.join(" ")}`.toLowerCase().includes(q);
  }), [state.recipes, recipeQuery, recipeMealFilter]);
  const selectedRecipe = state.recipes.find(r => r.id === selectedRecipeId) || filteredRecipes[0] || state.recipes[0];
  const recipeSteps = selectedRecipe ? defaultRecipeSteps(selectedRecipe) : [];
  const selectedRecipeMacros = selectedRecipe ? recipeScaledMacros(selectedRecipe, recipeServings) : null;

  function saveProfile(form: FormData) {
    const profileId = String(form.get("profileId") || "");
    const profile: Profile = {
      id: profileId || uid("profile"), firstName: String(form.get("firstName") || "Antoine"), lastName: String(form.get("lastName") || "Dupont"),
      sex: form.get("sex") as Profile["sex"], age: Number(form.get("age") || 25), heightCm: Number(form.get("heightCm") || 175), weightKg: Number(form.get("weightKg") || 70),
      bodyFatPct: Number(form.get("bodyFatPct") || 0) || undefined, activity: Number(form.get("activity") || 1.55), goal: form.get("goal") as Profile["goal"], diet: form.get("diet") as DietType,
      weeklyBudget: Number(form.get("weeklyBudget") || 75), store: form.get("store") as Store, allergies: ALLERGENS.filter(a => form.get(`allergy_${a}`)),
      dislikedFoods: String(form.get("dislikedFoods") || "").split(",").map(x=>x.trim()).filter(Boolean), likedFoods: String(form.get("likedFoods") || "").split(",").map(x=>x.trim()).filter(Boolean),
      trainingDays: [1,2,3,4,5,6,0].filter(d => form.get(`day_${d}`)), maxPrepTime: Number(form.get("maxPrepTime") || 30), cookingLevel: form.get("cookingLevel") as Profile["cookingLevel"],
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
    if (!food || !foodOptions.some(f => f.id === selectedFood)) { alert("Aucun aliment valide sélectionné. Vérifie la recherche ou choisis un aliment dans la liste."); return; }
    const baseQty = quantityToNutritionGrams(food, qty);
    rememberOpenFoodFactsFood(food);
    setState(s => ({ ...s, offFoods: food.source === "openfoodfacts" && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []), logs: [...s.logs, { id: uid("log"), foodId: selectedFood, qty: baseQty, displayQty: qty, displayUnit: isPieceInput(food) ? "piece" : food.unit, meal: selectedMeal, date }] }));
  }
  function addRecipeToJournal(recipe: Recipe) {
    const factor = recipeServings / Math.max(1, recipe.servings);
    const items: MealLogItem[] = recipe.ingredients.map(i => ({ id: uid("log"), foodId: i.foodId, qty: i.qty * factor, displayQty: i.qty * factor, displayUnit: "g", meal: recipe.mealType, date }));
    setState(s => ({ ...s, logs: [...s.logs, ...items] }));
    alert(`Recette ajoutée au journal : ${recipe.title}`);
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
  function addBarcodeFood(food: Food, qtyInput: number, mealForItem: MealType) {
    const baseQty = quantityToNutritionGrams(food, qtyInput);
    setState(s => ({
      ...s,
      offFoods: (s.offFoods || []).some(f => f.id === food.id) ? (s.offFoods || []) : [...(s.offFoods || []), food],
      logs: [...s.logs, { id: uid("log"), foodId: food.id, qty: baseQty, displayQty: qtyInput, displayUnit: isPieceInput(food) ? "piece" : food.unit, meal: mealForItem, date }],
    }));
    setTab("journal");
  }
  function removeLog(id: string) { setState(s => ({ ...s, logs: s.logs.filter(x=>x.id!==id) })); }
  function generate() { if(!activeProfile) return; setState(s => ({ ...s, program: generateProgram(activeProfile, s.recipes, 7) })); setTab("programme"); }
  function addPantry(foodId: string, q: number) {
    const food = foodId ? findFoodAny(foodId) : undefined;
    if (!food || !foodOptions.some(f => f.id === foodId)) { alert("Aucun aliment valide sélectionné pour le placard."); return; }
    const baseQty = quantityToNutritionGrams(food, q);
    setState(s => ({ ...s, offFoods: food.source === "openfoodfacts" && !(s.offFoods || []).some(f => f.id === food.id) ? [...(s.offFoods || []), food] : (s.offFoods || []), pantry: [...s.pantry, { id: uid("pantry"), foodId, qty: baseQty, unit: food.unit, displayQty: q, displayUnit: isPieceInput(food) ? "piece" : food.unit }] }));
  }
  function addWeight(w: number) { setState(s => ({ ...s, weights: [...s.weights, { id: uid("weight"), date: today(), weightKg: w, note: "Pesée à jeun" }] })); }
  function exportJson() { const blob = new Blob([JSON.stringify(state,null,2)], { type:"application/json" }); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="macro-tracker-backup.json"; a.click(); URL.revokeObjectURL(a.href); }
  function importJson(file: File | null) { if(!file) return; file.text().then(t => { try { setState({ ...emptyState, ...JSON.parse(t) }); } catch { alert("Fichier invalide"); } }); }
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
    setState({ ...emptyState, ...next, recipes: next.recipes?.length ? next.recipes : seedRecipes });
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
  function toggleRecipeItem(key: string) { setCheckedRecipeItems(s => ({ ...s, [key]: !s[key] })); }
  function resetRecipeTracking() { setCheckedRecipeItems({}); }

  return <main className="app">
    <header className="header hero">
      <div className="brand">
        <h1>Macro<span>Tracker</span> Pro</h1>
        <div className="hero-badges">
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
    <nav className="tabs">{(["dashboard","profil","journal","catalogue","recettes","programme","courses","placard","poids","sauvegarde"] as Tab[]).map(t => <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{TAB_LABELS[t]}</button>)}</nav>

    {tab === "dashboard" && <section className="grid">
      {!activeProfile && <div className="span-12 notice">Commence par créer un profil. L'app ne crée aucun profil par défaut.</div>}
      <div className="card span-3 kpi"><span className="muted">Calories aujourd'hui</span><br/><strong>{totals.kcal}</strong>{targets && <> / {targets.kcal}</>}<div className="progress"><div style={{width:`${targets ? Math.min(100, totals.kcal/targets.kcal*100) : 0}%`}} /></div></div>
      <div className="card span-3 kpi"><span className="muted">Protéines</span><br/><strong>{totals.protein}g</strong>{targets && <> / {targets.protein}g</>}</div>
      <div className="card span-3 kpi"><span className="muted">Programme</span><br/><strong>{programScore?.score ?? 0}/100</strong><br/><span className="muted">score qualité</span></div>
      <div className="card span-3 kpi"><span className="muted">Courses</span><br/><strong>{shopping.reduce((s,x)=>s+x.price,0).toFixed(2)} €</strong><br/><span className="muted">estimé après placard</span></div>
      <div className="card span-12"><h2>Actions rapides</h2><div className="row"><button className="btn" onClick={()=>setSnapOpen(true)}>📸 Snap mon repas</button><button className="btn" onClick={()=>setBarcodeOpen(true)}>🏷️ Scanner un code-barres</button><button className="btn" disabled={!activeProfile} onClick={generate}>Générer 7 jours</button><button className="btn secondary" onClick={()=>setTab("journal")}>Ajouter un aliment</button><button className="btn secondary" onClick={()=>setTab("recettes")}>Cuisiner une recette</button><button className="btn secondary" onClick={()=>setTab("courses")}>Voir courses</button></div></div>
    </section>}

    {tab === "profil" && <section className="grid">
      <div className="card span-8">
        <div className="space"><div><h2>{activeProfile ? "Modifier le profil actif" : "Créer un profil"}</h2><p className="muted">Renseigne ton objectif, ton activité, ton budget et tes contraintes. Les calories et macros sont recalculées automatiquement.</p></div>{activeProfile && <button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:undefined}))}>Nouveau profil</button>}</div>
        {activeProfile && targets && <div className="target-panel"><div><span>Kcal/j</span><strong>{targets.kcal}</strong></div><div><span>Protéines</span><strong>{targets.protein}g</strong></div><div><span>Glucides</span><strong>{targets.carbs}g</strong></div><div><span>Lipides</span><strong>{targets.fat}g</strong></div></div>}
        <form action={saveProfile} className="grid" key={activeProfile?.id || "new-profile"}>
      <input type="hidden" name="profileId" value={activeProfile?.id || ""}/>
      <div className="span-6"><label>Prénom</label><input name="firstName" placeholder="Antoine" defaultValue={activeProfile?.firstName || ""} /></div><div className="span-6"><label>Nom</label><input name="lastName" placeholder="Dupont" defaultValue={activeProfile?.lastName || ""} /></div>
      <div className="span-3"><label>Sexe</label><select name="sex" defaultValue={activeProfile?.sex || "homme"}><option value="homme">Homme</option><option value="femme">Femme</option></select></div><div className="span-3"><label>Âge</label><input name="age" type="number" defaultValue={activeProfile?.age || 25}/></div><div className="span-3"><label>Taille cm</label><input name="heightCm" type="number" defaultValue={activeProfile?.heightCm || 175}/></div><div className="span-3"><label>Poids kg</label><input name="weightKg" type="number" step="0.1" defaultValue={activeProfile?.weightKg || 70}/></div>
      <div className="span-3"><label>Masse grasse %</label><input name="bodyFatPct" type="number" placeholder="optionnel" defaultValue={activeProfile?.bodyFatPct || ""}/></div><div className="span-3"><label>Activité</label><select name="activity" defaultValue={String(activeProfile?.activity || 1.55)}><option value="1.2">Sédentaire</option><option value="1.375">Léger</option><option value="1.55">Modéré</option><option value="1.725">Élevé</option><option value="1.9">Très élevé</option></select></div><div className="span-3"><label>Objectif</label><select name="goal" defaultValue={activeProfile?.goal || "lean_bulk"}><option value="perte">Perte</option><option value="maintien">Maintien</option><option value="prise_masse">Prise masse</option><option value="lean_bulk">Lean bulk</option></select></div><div className="span-3"><label>Régime</label><select name="diet" defaultValue={activeProfile?.diet || "omnivore"}><option value="omnivore">Omnivore</option><option value="flexitarien">Flexitarien</option><option value="pescetarien">Pescetarien</option><option value="vegetarien">Végétarien</option><option value="vegan">Vegan</option><option value="sans_porc">Sans porc</option></select></div>
      <div className="span-3"><label>Budget/semaine</label><select name="weeklyBudget" defaultValue={String(activeProfile?.weeklyBudget || 75)}><option>50</option><option>75</option><option>100</option><option>150</option><option>200</option></select></div><div className="span-3"><label>Enseigne</label><select name="store" defaultValue={activeProfile?.store || "leclerc"}>{Object.entries(STORES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div><div className="span-3"><label>Temps max repas</label><input name="maxPrepTime" type="number" defaultValue={activeProfile?.maxPrepTime || 30}/></div><div className="span-3"><label>Niveau cuisine</label><select name="cookingLevel" defaultValue={activeProfile?.cookingLevel || "normal"}><option value="etudiant">Étudiant</option><option value="normal">Normal</option><option value="meal_prep">Meal prep</option><option value="famille">Famille</option></select></div>
      <div className="span-6"><label>Aliments aimés, séparés par virgules</label><input name="likedFoods" placeholder="riz, poulet, skyr" defaultValue={activeProfile?.likedFoods.join(", ") || ""}/></div><div className="span-6"><label>Aliments à éviter</label><input name="dislikedFoods" placeholder="thon, fromage, etc." defaultValue={activeProfile?.dislikedFoods.join(", ") || ""}/></div>
      <div className="span-12"><label>Allergies / exclusions</label><div className="row">{ALLERGENS.map(a=><label key={a} className="tag"><input type="checkbox" name={`allergy_${a}`} defaultChecked={!!activeProfile?.allergies.includes(a)} style={{width:"auto"}}/> {a}</label>)}</div></div>
      <div className="span-12"><label>Jours d'entraînement</label><div className="row">{["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"].map((d,i)=><label key={d} className="tag"><input type="checkbox" name={`day_${i}`} defaultChecked={!!activeProfile?.trainingDays.includes(i)} style={{width:"auto"}}/> {d}</label>)}</div></div>
      <div className="span-12"><button className="btn">{activeProfile ? "Mettre à jour le profil" : "Créer le profil"}</button></div>
    </form></div><div className="card span-4"><h3>Profils existants</h3><div className="list">{state.profiles.map(p=><div className="item" key={p.id}><div className="space"><strong>{p.firstName} {p.lastName}</strong><button className="btn secondary" onClick={()=>setState(s=>({...s,activeProfileId:p.id}))}>Activer</button></div><span className="muted">{p.goal} · {p.diet}</span><div className="row" style={{marginTop:8}}><button className="btn danger" onClick={()=>{if(confirm("Supprimer ce profil ?")) setState(s=>({ ...s, profiles: s.profiles.filter(x=>x.id!==p.id), activeProfileId: s.activeProfileId === p.id ? undefined : s.activeProfileId }))}}>Supprimer</button></div></div>)}</div>{!state.profiles.length && <p className="muted">Aucun profil pour le moment.</p>}</div></section>}

    {tab === "journal" && <section className="grid">
      <div className="card span-4"><h2>Ajouter</h2><button className="btn snap-cta" onClick={()=>setSnapOpen(true)}>📸 Snap mon repas (photo → calories)</button><button className="btn secondary snap-cta" onClick={()=>setBarcodeOpen(true)}>🏷️ Scanner un code-barres</button><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /><label>Repas</label><select value={selectedMeal} onChange={e=>setSelectedMeal(e.target.value as MealType)}>{MEALS.map(m=><option key={m}>{m}</option>)}</select><label>Recherche</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="marque, produit ou code-barres..."/><p className="form-help">Recherche locale + Open Food Facts pour les produits de marque.</p>{offLoading && <p className="form-help">Recherche Open Food Facts en cours...</p>}{offError && <p className="form-help bad-text">{offError}</p>}<ProductResults foods={foodOptions.slice(0,10)} selectedId={selectedFood} onSelect={setSelectedFood}/>{!foodOptions.length && !offLoading && <p className="form-help bad-text">Aucun résultat : l'application n’ajoute rien par défaut.</p>}{selectedFoodObj && <ProductCard food={selectedFoodObj} qty={qty} macros={selectedPreview}/>}<QuantityPicker value={qty} onChange={setQty} food={selectedFoodObj}/><div className="macro-preview"><span>{selectedPreview.kcal} kcal</span><span>P {selectedPreview.protein}g</span><span>G {selectedPreview.carbs}g</span><span>L {selectedPreview.fat}g</span><span>Fibres {selectedPreview.fiber}g</span></div><MicroPanel title="Vitamines & minéraux de l'aliment" micros={selectedMicros}/><button className="btn" disabled={!selectedFood || !foodOptions.length || qty <= 0} onClick={addFoodLog}>Ajouter au journal</button></div>
      <div className="card span-8"><h2>Journal du {date}</h2><div className="pillbar"><div className="kpi">Kcal <strong>{totals.kcal}</strong></div><div className="kpi">P <strong>{totals.protein}g</strong></div><div className="kpi">G <strong>{totals.carbs}g</strong></div><div className="kpi">L <strong>{totals.fat}g</strong></div></div><MicroPanel title="Micros cumulés du jour" micros={microsToday}/>{MEALS.map(m=><div className="meal" key={m} style={{marginTop:12}}><div className="meal-head">{m}</div><div className="meal-body list">{dayLogs.filter(l=>l.meal===m).map(l=>{const f=findFoodAny(l.foodId); const kcal = f ? macrosFromBaseGrams(f,l.qty).kcal : 0; return <div className="item space" key={l.id}><span>{f?.name} · {formatQuantity(f, l.qty, l.displayQty, l.displayUnit)} {f && <span className="muted">· {kcal} kcal</span>}</span><button className="btn danger" onClick={()=>removeLog(l.id)}>Retirer</button></div>})}</div></div>)}</div>
    </section>}

    {tab === "catalogue" && <section className="grid"><div className="card span-12"><h2>Catalogue structuré</h2><p className="muted">Base Ciqual/Anses intégrée + recherche Open Food Facts en direct pour les produits de marque, images, code-barres et portions.</p><div className="row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher"/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c === "all" ? "Tous rayons" : c}</option>)}</select></div><div className="scroll"><table className="table"><thead><tr><th>Aliment</th><th>Rayon</th><th>Macros</th><th>Vitamines / minéraux</th><th>Régimes</th><th>Allergènes</th><th>Achat</th></tr></thead><tbody>{visibleFoods.slice(0,500).map(f=><tr key={f.id}><td><div className="catalog-food"><span className="mini-food-icon">{foodIcon(f)}</span><span><strong>{f.name}</strong><br/><span className="muted">{f.brand ? `${f.brand} · ` : ""}{f.state} · {f.reliability} · {sourceLabel(f)}{isPieceInput(f) ? ` · 1 ${f.servingLabel || "pièce"} ≈ ${estimateServingGrams(f)} g` : ""}</span></span></div></td><td>{f.category}</td><td>{f.macros.kcal} kcal · P{f.macros.protein} G{f.macros.carbs} L{f.macros.fat}</td><td><MicroInline food={f}/></td><td>{f.diets.map(d=><span className="tag" key={d}>{d}</span>)}</td><td>{f.allergens.length ? f.allergens.map(a=><span className="tag warn" key={a}>{a}</span>) : <span className="muted">RAS</span>}</td><td>{f.purchaseUnit}</td></tr>)}</tbody></table></div></div></section>}

    {tab === "recettes" && <section className="grid">
      <div className="card span-4"><h2>Recettes</h2><div className="row"><input value={recipeQuery} onChange={e=>setRecipeQuery(e.target.value)} placeholder="Rechercher une recette"/><select value={recipeMealFilter} onChange={e=>setRecipeMealFilter(e.target.value as "all" | MealType)}><option value="all">Tous les repas</option>{MEALS.map(m=><option key={m} value={m}>{m}</option>)}</select></div><div className="list" style={{marginTop:12}}>{filteredRecipes.map(r=>{const m=recipeMacros(r); return <button className={`recipe-list-btn ${selectedRecipe?.id===r.id ? "active" : ""}`} key={r.id} onClick={()=>{setSelectedRecipeId(r.id); resetRecipeTracking(); setRecipeServings(r.servings);}}><strong>{r.title}</strong><span>{m.kcal} kcal · P{m.protein}g · {r.prepTime} min</span></button>})}</div></div>
      <div className="card span-8">{selectedRecipe && <><div className="space"><div><h2>{selectedRecipe.title}</h2><p className="muted">{selectedRecipe.mealType} · {selectedRecipe.prepTime} min · difficulté {selectedRecipe.difficulty} · conservation {selectedRecipe.storageDays} jour(s)</p></div><button className="btn" onClick={()=>addRecipeToJournal(selectedRecipe)}>Ajouter au journal</button></div><div>{selectedRecipe.tags.map(t=><span className="tag" key={t}>{t}</span>)} {selectedRecipe.diets.map(d=><span className="tag warn" key={d}>{d}</span>)}</div><div className="recipe-toolbar"><label>Portions à préparer</label><div className="row"><button className="qty-btn" onClick={()=>setRecipeServings(Math.max(1, recipeServings-1))}>−</button><input type="number" min="1" value={recipeServings} onChange={e=>setRecipeServings(Math.max(1, Number(e.target.value) || 1))}/><button className="qty-btn" onClick={()=>setRecipeServings(recipeServings+1)}>+</button></div></div>{selectedRecipeMacros && <div className="macro-preview"><span>{selectedRecipeMacros.kcal} kcal</span><span>P {selectedRecipeMacros.protein}g</span><span>G {selectedRecipeMacros.carbs}g</span><span>L {selectedRecipeMacros.fat}g</span><span>Fibres {selectedRecipeMacros.fiber}g</span></div>}<h3>Ingrédients</h3><div className="check-list">{selectedRecipe.ingredients.map((it, idx)=>{const f=findFood(it.foodId); const factor=recipeServings/Math.max(1, selectedRecipe.servings); const q=it.qty*factor; const key=`${selectedRecipe.id}_ing_${idx}`; return <label className={`check-item ${checkedRecipeItems[key] ? "done" : ""}`} key={key}><input type="checkbox" checked={!!checkedRecipeItems[key]} onChange={()=>toggleRecipeItem(key)}/><span><strong>{f?.name || it.foodId}</strong><br/><span className="muted">{Math.round(q)} g · {f ? macrosFromBaseGrams(f,q).kcal : 0} kcal</span></span></label>})}</div><h3>Étapes de préparation</h3><div className="check-list">{recipeSteps.map((step, idx)=>{const key=`${selectedRecipe.id}_step_${idx}`; return <label className={`check-item ${checkedRecipeItems[key] ? "done" : ""}`} key={key}><input type="checkbox" checked={!!checkedRecipeItems[key]} onChange={()=>toggleRecipeItem(key)}/><span><strong>Étape {idx+1}</strong><br/><span>{step}</span></span></label>})}</div><div className="row" style={{marginTop:12}}><button className="btn secondary" onClick={resetRecipeTracking}>Réinitialiser le suivi</button><button className="btn" onClick={()=>addRecipeToJournal(selectedRecipe)}>Recette faite → ajouter au journal</button></div></>}</div>
    </section>}

    {tab === "programme" && <section className="grid"><div className="card span-12"><div className="space"><h2>Programme alimentaire</h2><button className="btn" disabled={!activeProfile} onClick={generate}>Générer 7 jours</button></div>{programScore && <div className="notice"><strong>Score {programScore.score}/100</strong><br/>{programScore.notes.join(" · ")}</div>}<div className="list" style={{marginTop:12}}>{state.program.map((pm,i)=>{const r=state.recipes.find(x=>x.id===pm.recipeId); const m=r?recipeMacros(r):null; return <div className="item" key={i}><strong>{pm.date} · {pm.dayType} · {pm.mealType}</strong><br/>{r?.title} {m && <span className="muted">— {m.kcal} kcal, P{m.protein}g</span>}</div>})}</div></div></section>}

    {tab === "courses" && <section className="grid"><div className="card span-12"><h2>Liste de courses</h2><p className="muted">Déduit automatiquement le placard/frigo. Les prix restent indicatifs.</p><div className="scroll"><table className="table"><thead><tr><th>Rayon</th><th>Aliment</th><th>Besoin</th><th>Déjà dispo</th><th>À acheter</th><th>Paquets</th><th>Prix</th></tr></thead><tbody>{shopping.map(x=><tr key={x.foodId}><td>{x.category}</td><td>{x.name}</td><td>{Math.round(x.needed * 10) / 10} {x.unit}</td><td>{Math.round(x.available * 10) / 10} {x.unit}</td><td><strong>{Math.round(x.toBuy * 10) / 10} {x.unit}</strong></td><td>{x.packages} × {x.packageLabel}</td><td>{x.price.toFixed(2)} €</td></tr>)}</tbody></table></div></div></section>}

    {tab === "placard" && <section className="grid"><div className="card span-4"><h2>Ajouter au placard</h2><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher"/><select value={selectedFood} disabled={!foodOptions.length} onChange={e=>setSelectedFood(e.target.value)}>{!foodOptions.length ? <option value="">Aucun aliment trouvé</option> : foodOptions.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>{!foodOptions.length && <p className="form-help bad-text">Aucun aliment trouvé pour ce filtre.</p>}<QuantityPicker value={qty} onChange={setQty} food={selectedFoodObj}/><button className="btn" disabled={!selectedFood || !foodOptions.length || qty <= 0} onClick={()=>addPantry(selectedFood, qty)}>Ajouter</button></div><div className="card span-8"><h2>Placard / frigo</h2><div className="list">{state.pantry.map(p=>{const f=findFoodAny(p.foodId); return <div className="item space" key={p.id}><span>{f?.name} · {formatQuantity(f, p.qty, p.displayQty, p.displayUnit)}</span><button className="btn danger" onClick={()=>setState(s=>({...s,pantry:s.pantry.filter(x=>x.id!==p.id)}))}>Retirer</button></div>})}</div></div></section>}

    {tab === "poids" && <section className="grid"><div className="card span-4"><h2>Pesée à jeun</h2><input type="number" step="0.1" placeholder="Poids du matin" onKeyDown={e=>{if(e.key==='Enter') addWeight(Number((e.target as HTMLInputElement).value))}}/><button className="btn" onClick={()=>{const v=prompt("Poids à jeun ?"); if(v) addWeight(Number(v));}}>Ajouter pesée</button></div><div className="card span-8"><h2>Suivi du poids</h2><p>Moyenne 7 jours : <strong>{average7(state.weights) ?? "—"} kg</strong></p><p className="notice">{activeProfile ? weightTrendRecommendation(activeProfile, state.weights) : "Crée un profil pour obtenir une recommandation."}</p><WeightChart weights={state.weights}/><div className="list">{state.weights.slice(-10).reverse().map(w=><div className="item" key={w.id}>{w.date} · {w.weightKg} kg · <span className="muted">{w.note}</span></div>)}</div></div></section>}

    {tab === "sauvegarde" && <section className="grid">
      <div className="card span-6"><h2>Mon compte & cloud</h2><p className="muted">Gère ta connexion, l’auto-sauvegarde cloud et la synchronisation de tes données entre appareils.</p>{!supabase && <div className="notice">Supabase n'est pas encore configuré. Ajoute les variables <strong>NEXT_PUBLIC_SUPABASE_URL</strong> et <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>.</div>}{session?.user ? <div className="cloud-box"><strong>Connecté</strong><p className="muted">{session.user.email}</p><div className="cloud-status"><span>{autoSync ? "Auto-sauvegarde activée" : "Auto-sauvegarde désactivée"}</span><strong>{lastCloudSaveAt ? `Dernière sauvegarde : ${new Date(lastCloudSaveAt).toLocaleString("fr-FR")}` : "Pas encore sauvegardé"}</strong></div><label className="toggle-line"><input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} style={{width:"auto"}}/> Auto-sauvegarder après chaque modification</label><div className="row"><button className="btn" onClick={saveCloud}>Sauvegarder maintenant</button><button className="btn secondary" onClick={loadCloud}>Charger depuis le cloud</button><button className="btn danger" onClick={signOut}>Déconnexion</button></div></div> : <div className="cloud-box"><label>Email</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="ton@email.com"/><label>Mot de passe</label><input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="8 caractères minimum"/><div className="row"><button className="btn" onClick={signIn} disabled={!supabase || !authEmail || authPassword.length < 6}>Se connecter</button><button className="btn secondary" onClick={signUp} disabled={!supabase || !authEmail || authPassword.length < 6}>Créer un compte</button></div></div>}{authMessage && <p className="notice">{authMessage}</p>}{syncStatus && <p className="notice">{syncStatus}</p>}</div>
      <div className="card span-6"><h2>Sauvegarde locale</h2><p className="muted">Exporte ou importe une sauvegarde JSON complète de ton espace personnel.</p><button className="btn" onClick={exportJson}>Exporter JSON complet</button><label>Importer sauvegarde</label><input type="file" accept="application/json" onChange={e=>importJson(e.target.files?.[0] || null)}/></div>
      <div className="card span-12"><h2>Réinitialisation</h2><div className="row"><button className="btn danger" onClick={()=>setState(s=>({...s,logs:[]}))}>Journal</button><button className="btn danger" onClick={()=>setState(s=>({...s,weights:[]}))}>Poids</button><button className="btn danger" onClick={()=>setState(s=>({...s,pantry:[]}))}>Placard</button><button className="btn danger" onClick={()=>{if(confirm("Tout effacer ?")) setState(emptyState)}}>Tout</button></div></div>
    </section>}

    <SnapModal open={snapOpen} onClose={()=>setSnapOpen(false)} onConfirm={addScannedItems} defaultMeal={selectedMeal} date={date} />
    <BarcodeScanModal open={barcodeOpen} onClose={()=>setBarcodeOpen(false)} onConfirm={addBarcodeFood} defaultMeal={selectedMeal} date={date} />
  </main>;
}

function QuantityPicker({ value, onChange, food }: { value: number; onChange: (value: number) => void; food?: Food }) {
  const unit = unitLabel(food);
  const isPiece = isPieceInput(food);
  const quickValues = isPiece ? [1, 2, 3, 4, 6, 10] : [25, 50, 75, 100, 150, 200, 250, 300, 500];
  const safeChange = (next: number) => onChange(Math.max(0, Math.round((Number.isFinite(next) ? next : 0) * 10) / 10));
  return <div className="quantity-card">
    <div className="space"><label style={{margin:0}}>Quantité</label><span className="muted">{isPiece ? `1 pièce ≈ ${estimateServingGrams(food)} g · calcul Ciqual ajusté` : "Base nutritionnelle : 100 g/ml, calcul ajusté automatiquement"}</span></div>
    <div className="quantity-row">
      <button type="button" className="qty-btn" onClick={()=>safeChange(value - (isPiece ? 1 : 10))}>−</button>
      <input type="number" min="0" step={isPiece ? 1 : 1} value={value} onChange={e=>safeChange(Number(e.target.value))}/>
      <span className="unit-pill">{unit}</span>
      <button type="button" className="qty-btn" onClick={()=>safeChange(value + (isPiece ? 1 : 10))}>+</button>
    </div>
    <div className="quick-qty">{quickValues.map(q => <button type="button" key={q} className={value===q ? "active" : ""} onClick={()=>safeChange(q)}>{q}{isPiece ? "" : "g"}</button>)}</div>
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
function foodIcon(food?: Food) {
  if (!food) return "🍽️";
  if (food.icon) return food.icon;
  const n = food.name.toLowerCase();
  if (/whey|protéine|proteine|isolate|isolat|caseine|caséine|gainer|bcaa|eaa|collagene|collagène/.test(n)) return "🥤";
  if (/creatine|créatine|pre workout|pré workout|booster/.test(n)) return "⚡";
  if (/vitamine|multivitamines|magnesium|magnésium/.test(n)) return "💊";
  if (/electrolytes|électrolytes/.test(n)) return "💧";
  if (/oreo|biscuit|cookie|sablé|sable|madeleine|gâteau|gateau/.test(n)) return "🍪";
  if (/tender|poulet|dinde|viande|steak/.test(n)) return "🍗";
  if (/yaourt|yogourt|skyr|fromage blanc|lait/.test(n)) return "🥛";
  if (/banane|pomme|orange|kiwi|fruit/.test(n)) return "🍌";
  if (/riz|pâtes|pates|pain|céréale|cereale/.test(n)) return "🥖";
  if (/tomate|carotte|salade|légume|legume/.test(n)) return "🥕";
  if (/saumon|thon|poisson/.test(n)) return "🐟";
  return "🍽️";
}
function ProductResults({ foods, selectedId, onSelect }: { foods: Food[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!foods.length) return null;
  return <div className="product-results"><div className="result-title">Meilleurs résultats</div>{foods.map(f => <button type="button" key={f.id} className={`product-choice ${selectedId === f.id ? "active" : ""}`} onClick={() => onSelect(f.id)}><span className="mini-food-icon">{f.imageUrl ? <img src={f.imageUrl} alt=""/> : foodIcon(f)}</span><span className="product-choice-text"><strong>{f.name}</strong><small>{f.brand ? `${f.brand} · ` : ""}{f.macros.kcal} kcal/100g · {f.barcode ? `CB ${f.barcode} · ` : ""}{isPieceInput(f) ? `1 ${f.servingLabel || "portion"} ≈ ${estimateServingGrams(f)} g · ` : ""}{sourceLabel(f)}</small></span><span className={`source-badge ${sourceTone(f)}`}>{sourceLabel(f)}</span></button>)}</div>;
}
function ProductCard({ food, qty, macros }: { food: Food; qty: number; macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; grams: number } }) {
  const portion = isPieceInput(food) ? `1 ${food.servingLabel || "pièce"} ≈ ${estimateServingGrams(food)} g` : "Valeurs pour 100 g/ml";
  const selected = isPieceInput(food) ? `${qty} ${qty > 1 ? `${food.servingLabel || "pièce"}s` : (food.servingLabel || "pièce")} ≈ ${macros.grams} g` : `${qty} ${food.unit}`;
  return <div className="product-card"><div className="product-image" aria-hidden="true">{food.imageUrl ? <img src={food.imageUrl} alt=""/> : <span>{foodIcon(food)}</span>}</div><div className="product-info"><div className="product-topline"><span className={`source-badge ${sourceTone(food)}`}>{sourceLabel(food)}</span><span className={`source-badge ${food.reliability === "estime" ? "estimated" : "manual"}`}>{food.reliability}</span></div><h3>{food.name}</h3><p className="muted">{food.brand ? `Marque : ${food.brand} · ` : ""}{portion}{food.barcode ? ` · Code-barres : ${food.barcode}` : ""}</p><p className="product-selected">Sélection : <strong>{selected}</strong></p>{food.sourceRef && <p className="product-source-note">{food.sourceRef}</p>}<div className="product-macros"><span>{macros.kcal} kcal</span><span>P {macros.protein}g</span><span>G {macros.carbs}g</span><span>L {macros.fat}g</span></div></div></div>;
}

function MicroInline({ food }: { food: Food }) {
  const entries = MICRO_ORDER.filter(k => food.micros?.[k]).slice(0, 5);
  if (!entries.length) return <span className="muted">—</span>;
  return <div>{entries.map(k => <span className="tag" key={k}>{MICRO_LABELS[k].label} {cleanNumber(Number(food.micros?.[k] || 0))}{MICRO_LABELS[k].unit}</span>)}</div>;
}
function MicroPanel({ title, micros }: { title: string; micros: Partial<Record<MicroKey, number>> }) {
  const groups = ["Vitamines", "Minéraux", "Autres"] as const;
  const hasAny = MICRO_ORDER.some(k => Number(micros[k] || 0) > 0);
  if (!hasAny) return <div className="micro-panel"><strong>{title}</strong><p className="muted">Aucune donnée micro disponible pour cet aliment.</p></div>;
  return <div className="micro-panel"><strong>{title}</strong>{groups.map(group => {
    const keys = MICRO_ORDER.filter(k => MICRO_LABELS[k].group === group && Number(micros[k] || 0) > 0);
    if (!keys.length) return null;
    return <div key={group} className="micro-group"><span className="micro-group-title">{group}</span><div className="micro-grid">{keys.map(k => <span key={k}>{MICRO_LABELS[k].label}<strong>{cleanNumber(Number(micros[k] || 0))}{MICRO_LABELS[k].unit}</strong></span>)}</div></div>;
  })}</div>;
}
function WeightChart({ weights }: { weights: WeightLog[] }) {
  const data = [...weights].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  if(data.length < 2) return <div className="chart row" style={{justifyContent:"center"}}>Ajoute au moins 2 pesées</div>;
  const min = Math.min(...data.map(d=>d.weightKg)); const max = Math.max(...data.map(d=>d.weightKg)); const range = Math.max(1, max-min);
  const pts = data.map((d,i)=>`${(i/(data.length-1))*100},${100-((d.weightKg-min)/range)*90-5}`).join(" ");
  return <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}
