import { estimateServingGrams, findFood, isPieceInput, unitLabel } from "@/lib/food-engine";
import { calculateTargets, recipeMacros } from "@/lib/nutrition";
import type { MealType, PantryItem, Profile, ProgramMeal, Recipe, Store, Targets } from "@/lib/types";

export function isRecipeAllowed(recipe: Recipe, profile: Profile) {
  if (!recipe.diets.includes(profile.diet)) return false;
  if (recipe.prepTime > profile.maxPrepTime) return false;
  const text = recipe.title.toLowerCase();
  if (profile.dislikedFoods.some(x => x && text.includes(x.toLowerCase()))) return false;
  const allergenConflict = recipe.ingredients.some(it => findFood(it.foodId)?.allergens.some(a => profile.allergies.includes(a)));
  if (allergenConflict) return false;
  if (profile.avoidSoy && recipe.ingredients.some(it => findFood(it.foodId)?.allergens.includes("soja"))) return false;
  return true;
}

// Répartition des calories de la journée par repas (la somme des ratios fait 1).
function mealDistribution(profile: Profile): { mealType: MealType; ratio: number }[] {
  const fasting = profile.fasting || (profile.intermittentFasting ? "16_8" : "none");
  switch (fasting) {
    case "16_8": // fenêtre 8h : pas de petit-déjeuner → déjeuner, dîner, collation
      return [{ mealType: "Déjeuner", ratio: 0.40 }, { mealType: "Dîner", ratio: 0.40 }, { mealType: "Collation", ratio: 0.20 }];
    case "18_6": // fenêtre 6h : 2 repas, sans collation
      return [{ mealType: "Déjeuner", ratio: 0.50 }, { mealType: "Dîner", ratio: 0.50 }];
    case "20_4": // fenêtre 4h (Warrior) : repas léger + gros dîner
      return [{ mealType: "Déjeuner", ratio: 0.30 }, { mealType: "Dîner", ratio: 0.70 }];
    case "omad": // un seul repas par jour
      return [{ mealType: "Dîner", ratio: 1 }];
    default:
      return [{ mealType: "Petit-déjeuner", ratio: 0.25 }, { mealType: "Déjeuner", ratio: 0.35 }, { mealType: "Dîner", ratio: 0.30 }, { mealType: "Collation", ratio: 0.10 }];
  }
}

export function generateProgram(profile: Profile, recipes: Recipe[], days = 7): ProgramMeal[] {
  const allowed = recipes.filter(r => isRecipeAllowed(r, profile));
  const meals: ProgramMeal[] = [];
  const distribution = mealDistribution(profile);
  const targetKcal = calculateTargets(profile).kcal;
  const today = new Date();
  for (let d=0; d<days; d++) {
    const date = new Date(today); date.setDate(today.getDate()+d);
    const iso = date.toISOString().slice(0,10);
    const dayIdx = date.getDay();
    const dayType = profile.trainingDays.includes(dayIdx) ? "entrainement" : "repos";
    distribution.forEach(({ mealType, ratio }, i) => {
      const pool = allowed.filter(r => r.mealType === mealType);
      if (!pool.length) return;
      const chosen = pool[(d + i) % pool.length];
      const baseKcal = recipeMacros(chosen).kcal;
      // Facteur de portion pour atteindre les kcal visées du repas (borné pour rester réaliste).
      const factor = baseKcal > 0 ? Math.min(3, Math.max(0.5, Math.round((targetKcal * ratio / baseKcal) * 10) / 10)) : 1;
      meals.push({ date: iso, dayType, mealType, recipeId: chosen.id, factor });
    });
  }
  return meals;
}

export function scoreProgram(program: ProgramMeal[], recipes: Recipe[], targets: Targets, weeklyBudget: number, store: Store) {
  const byDate = new Map<string, { kcal:number; protein:number; carbs:number; fat:number; cost:number; titles:Set<string> }>();
  program.forEach(pm => {
    const r = recipes.find(x => x.id === pm.recipeId); if (!r) return;
    const f = pm.factor ?? 1;
    const m = recipeMacros(r); const cost = estimateRecipeCost(r, store) * f;
    const day = byDate.get(pm.date) ?? { kcal:0, protein:0, carbs:0, fat:0, cost:0, titles:new Set<string>() };
    day.kcal += m.kcal * f; day.protein += m.protein * f; day.carbs += m.carbs * f; day.fat += m.fat * f; day.cost += cost; day.titles.add(r.title);
    byDate.set(pm.date, day);
  });
  const days = [...byDate.values()]; if(!days.length) return { score:0, cost:0, notes:["Aucun programme généré"], avgProtein:0, avgKcal:0 };
  const avg = days.reduce((a,d)=>({ kcal:a.kcal+d.kcal, protein:a.protein+d.protein, carbs:a.carbs+d.carbs, fat:a.fat+d.fat, cost:a.cost+d.cost, titles:a.titles }), {kcal:0,protein:0,carbs:0,fat:0,cost:0,titles:new Set<string>()});
  avg.kcal/=days.length; avg.protein/=days.length; avg.carbs/=days.length; avg.fat/=days.length;
  const cost = days.reduce((s,d)=>s+d.cost,0);
  let score = 100;
  score -= Math.min(30, Math.abs(avg.kcal - targets.kcal) / targets.kcal * 100);
  score -= Math.min(20, Math.max(0, targets.protein - avg.protein) / targets.protein * 100);
  if(cost > weeklyBudget) score -= Math.min(25, (cost-weeklyBudget)/weeklyBudget*100);
  const variety = new Set(program.map(p=>p.recipeId)).size;
  if(variety < 6) score -= 10;
  const notes = [`Coût estimé ${cost.toFixed(2)} € / budget ${weeklyBudget} €`, `Moyenne/jour : ${Math.round(avg.kcal)} kcal, P ${Math.round(avg.protein)}g`, `Variété : ${variety} recettes différentes`];
  return { score: Math.max(0, Math.round(score)), cost, notes, avgProtein: Math.round(avg.protein), avgKcal: Math.round(avg.kcal) };
}

function packageBaseGrams(food: NonNullable<ReturnType<typeof findFood>>) {
  const serving = estimateServingGrams(food);
  if (food.unit === "piece") {
    // Certains produits à l'unité ont packageSize = nombre de pièces (bananes, œufs, yaourts),
    // d'autres ont packageSize = poids du paquet en grammes (Oreo 154 g, tenders 500 g).
    // Cette règle évite de transformer par erreur un paquet de 154 g en 154 pièces.
    return food.packageSize <= 50 ? food.packageSize * serving : food.packageSize;
  }
  return Math.max(1, food.packageSize);
}

function estimateCostFromBaseGrams(food: NonNullable<ReturnType<typeof findFood>>, baseGrams: number, store: Store) {
  // Toutes les estimations de prix sont ramenées en €/kg ou €/L pour éviter les explosions
  // de prix dues aux unités pièces/paquets. Les quantités du moteur restent stockées en g/ml.
  const unitPrice = food.prices[store] || 0;
  return (Math.max(0, baseGrams) / 1000) * unitPrice;
}

export function estimateRecipeCost(recipe: Recipe, store: Store) {
  return recipe.ingredients.reduce((sum,it)=>{
    const f=findFood(it.foodId); if(!f) return sum;
    return sum + estimateCostFromBaseGrams(f, it.qty, store);
  }, 0);
}

export function buildShoppingList(program: ProgramMeal[], recipes: Recipe[], pantry: PantryItem[], store: Store) {
  const needs = new Map<string, number>();
  program.forEach(pm => { const r=recipes.find(x=>x.id===pm.recipeId); const f = pm.factor ?? 1; r?.ingredients.forEach(it => needs.set(it.foodId, (needs.get(it.foodId) || 0) + it.qty * f)); });
  const pantryMap = new Map<string, number>(); pantry.forEach(p => pantryMap.set(p.foodId, (pantryMap.get(p.foodId)||0)+p.qty));
  return [...needs.entries()].map(([foodId, qty]) => {
    const f = findFood(foodId);
    const available = pantryMap.get(foodId) || 0;
    const toBuy = Math.max(0, qty - available);
    if (!f) return { foodId, name: foodId, category: "Autre", unit: "g", needed: qty, available, toBuy, packageLabel: "", packages: 0, price: 0 };
    const serving = estimateServingGrams(f);
    const packageBase = packageBaseGrams(f);
    const packages = toBuy > 0 ? Math.ceil(toBuy / Math.max(1, packageBase)) : 0;
    const price = +estimateCostFromBaseGrams(f, toBuy, store).toFixed(2);
    const displayDivisor = isPieceInput(f) ? serving : 1;
    return {
      foodId,
      name: f.name,
      category: f.category,
      unit: unitLabel(f),
      needed: qty / displayDivisor,
      available: available / displayDivisor,
      toBuy: toBuy / displayDivisor,
      packageLabel: f.purchaseUnit,
      packages,
      price
    };
  }).sort((a,b)=>a.category.localeCompare(b.category,'fr') || a.name.localeCompare(b.name,'fr'));
}

export function cheaperAlternative(foodId: string, profile: Profile) {
  const f = findFood(foodId); if(!f) return null;
  const candidates = [
    ["Saumon pavé", "Sardines"], ["Saumon pavé", "Maquereau"], ["Quinoa", "Riz basmati"], ["Amandes", "Cacahuètes"], ["Blanc de poulet", "Œufs"], ["Skyr", "Fromage blanc"]
  ];
  const pair = candidates.find(([from]) => f.name.includes(from));
  return pair?.[1] ?? null;
}
