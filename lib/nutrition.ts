import { findFood } from "@/lib/food-engine";
import type { MealLogItem, Profile, Recipe, RecipeIngredient, Targets, WeightLog } from "@/lib/types";

export function calculateTargets(profile: Profile): Targets {
  // Masse maigre (LBM) si la masse grasse est renseignée et plausible.
  const bf = profile.bodyFatPct && profile.bodyFatPct > 3 && profile.bodyFatPct < 60 ? profile.bodyFatPct : undefined;
  const lbm = bf ? profile.weightKg * (1 - bf / 100) : undefined;

  // BMR : Katch-McArdle si LBM connue (plus précis), sinon Mifflin-St Jeor.
  const bmr = lbm
    ? 370 + 21.6 * lbm
    : profile.sex === "homme"
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;

  // Dépense énergétique totale (TDEE), puis ajustement selon l'objectif.
  // Déficits/surplus en pourcentage du TDEE (plus physiologique qu'un forfait fixe).
  const tdee = bmr * profile.activity;
  let kcal = tdee;
  if (profile.goal === "perte") kcal = tdee * 0.80;            // perte de poids : déficit ~20 %
  else if (profile.goal === "seche") kcal = tdee * 0.85;       // sèche : déficit modéré ~15 % (préserve le muscle)
  else if (profile.goal === "prise_masse") kcal = tdee * 1.10; // prise de masse : surplus ~10 %

  // Plancher de sécurité : ne jamais descendre sous le métabolisme de base,
  // ni sous un minimum absolu (1700 kcal homme / 1500 kcal femme).
  const floorKcal = Math.max(bmr, profile.sex === "homme" ? 1700 : 1500);
  if (profile.goal === "perte" || profile.goal === "seche") kcal = Math.max(kcal, floorKcal);

  kcal = Math.round(kcal / 10) * 10;

  // Protéines et lipides calés sur la masse maigre si connue, sinon le poids.
  // Les lipides ne gonflent PAS en prise de masse : le surplus va aux glucides (carburant).
  const lossPhase = profile.goal === "perte" || profile.goal === "seche";
  const ref = lbm ?? profile.weightKg;
  // Protéines : choix de l'utilisateur (g/kg de poids de corps) sinon défaut selon objectif.
  // La sèche vise le plus de protéines (préservation musculaire pendant le déficit).
  const defaultProteinPerKg = lbm
    ? (profile.goal === "seche" ? 2.6 : lossPhase ? 2.4 : 2.2)
    : (profile.goal === "seche" ? 2.2 : lossPhase ? 2.0 : 1.8);
  const fatPerKg = lbm ? 1.0 : 0.9;
  const protein = profile.proteinPerKg && profile.proteinPerKg > 0
    ? Math.round(profile.weightKg * profile.proteinPerKg)
    : Math.round(ref * defaultProteinPerKg);
  const fat = Math.round(Math.max(profile.weightKg * 0.6, ref * fatPerKg)); // plancher hormonal 0,6 g/kg
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((kcal / 1000) * 14); // 14 g / 1000 kcal (reco standard)
  return { kcal, protein, carbs, fat, fiber };
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
  if(profile.goal === "perte" || profile.goal === "seche") {
    if(delta > -0.1) return `Tendance ${delta} kg/semaine : perte trop lente, envisage -100 à -150 kcal/j.`;
    if(delta < -0.8) return `Tendance ${delta} kg/semaine : perte rapide, envisage +100 kcal/j.`;
    return `Tendance ${delta} kg/semaine : rythme de perte correct.`;
  }
  if(profile.goal === "prise_masse") {
    if(delta < 0.1) return `Tendance ${delta} kg/semaine : prise trop lente, envisage +100 à +150 kcal/j.`;
    if(delta > 0.5) return `Tendance ${delta} kg/semaine : prise rapide, baisse légèrement les calories.`;
    return `Tendance ${delta} kg/semaine : prise de masse maîtrisée.`;
  }
  return `Tendance ${delta} kg/semaine : maintien à surveiller.`;
}
