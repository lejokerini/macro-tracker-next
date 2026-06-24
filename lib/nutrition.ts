import { findFood } from "@/lib/food-engine";
import type { MealLogItem, Profile, Recipe, RecipeIngredient, Targets, WeightLog } from "@/lib/types";

export function calculateTargets(profile: Profile): Targets {
  const bmr = profile.sex === "homme"
    ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
    : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;
  let kcal = bmr * profile.activity;
  if (profile.goal === "perte") kcal -= 400;
  if (profile.goal === "prise_masse") kcal += 350;
  if (profile.goal === "lean_bulk") kcal += 180;
  kcal = Math.round(kcal / 10) * 10;
  const protein = Math.round(profile.weightKg * (profile.goal === "perte" ? 2.0 : 1.8));
  const fat = Math.round(profile.weightKg * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

export function sumIngredients(items: RecipeIngredient[] | { foodId:string; qty:number }[]) {
  return items.reduce((acc, it) => {
    const f = findFood(it.foodId); if (!f) return acc;
    const r = it.qty / 100;
    acc.kcal += f.macros.kcal * r; acc.protein += f.macros.protein * r; acc.carbs += f.macros.carbs * r; acc.fat += f.macros.fat * r; acc.fiber += f.macros.fiber * r;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}
export function roundedMacros(m: ReturnType<typeof sumIngredients>) { return { kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat), fiber: Math.round(m.fiber) }; }
export function recipeMacros(recipe: Recipe) { return roundedMacros(sumIngredients(recipe.ingredients)); }
export function logMacros(logs: MealLogItem[], date: string) { return roundedMacros(sumIngredients(logs.filter(l => l.date === date).map(l => ({ foodId: l.foodId, qty: l.qty })))); }
export function average7(weights: WeightLog[]) { const sorted=[...weights].sort((a,b)=>a.date.localeCompare(b.date)); const last=sorted.slice(-7); if(!last.length) return null; return +(last.reduce((s,w)=>s+w.weightKg,0)/last.length).toFixed(2); }
export function weightTrendRecommendation(profile: Profile, weights: WeightLog[]) {
  const sorted=[...weights].sort((a,b)=>a.date.localeCompare(b.date));
  if(sorted.length < 14) return "Ajoute au moins 14 pesées à jeun pour obtenir une recommandation fiable.";
  const prev=sorted.slice(-14,-7), recent=sorted.slice(-7);
  const a=(x:WeightLog[])=>x.reduce((s,w)=>s+w.weightKg,0)/x.length;
  const delta=+(a(recent)-a(prev)).toFixed(2);
  if(profile.goal === "perte") {
    if(delta > -0.1) return `Tendance ${delta} kg/semaine : perte trop lente, envisage -100 à -150 kcal/j.`;
    if(delta < -0.8) return `Tendance ${delta} kg/semaine : perte rapide, envisage +100 kcal/j.`;
    return `Tendance ${delta} kg/semaine : rythme de perte correct.`;
  }
  if(profile.goal === "prise_masse" || profile.goal === "lean_bulk") {
    if(delta < 0.1) return `Tendance ${delta} kg/semaine : prise trop lente, envisage +100 à +150 kcal/j.`;
    if(delta > 0.5) return `Tendance ${delta} kg/semaine : prise rapide, baisse légèrement les calories.`;
    return `Tendance ${delta} kg/semaine : prise de masse maîtrisée.`;
  }
  return `Tendance ${delta} kg/semaine : maintien à surveiller.`;
}
