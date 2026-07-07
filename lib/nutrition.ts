import { findFood } from "@/lib/food-engine";
import type { MealLogItem, Profile, Recipe, RecipeIngredient, Targets, WeightLog } from "@/lib/types";

export function calculateTargets(profile: Profile): Targets {
  // Masse maigre (LBM) si la masse grasse est renseignée et plausible.
  const bf = profile.bodyFatPct && profile.bodyFatPct > 3 && profile.bodyFatPct < 60 ? profile.bodyFatPct : undefined;
  const lbm = bf ? profile.weightKg * (1 - bf / 100) : undefined;

  // BMR : Katch-McArdle si LBM connue (plus précis), sinon Mifflin-St Jeor.
  const computedBmr = lbm
    ? 370 + 21.6 * lbm
    : profile.sex === "homme"
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;
  // L'utilisateur peut fournir son propre métabolisme de base (mesuré / connu).
  const bmr = profile.customBmr && profile.customBmr > 0 ? profile.customBmr : computedBmr;

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

  // Calories/jour choisies manuellement par l'utilisateur : elles priment sur le calcul.
  if (profile.customKcal && profile.customKcal > 0) kcal = Math.round(profile.customKcal / 10) * 10;

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
// TDEE réel (calibré) : dépense estimée à partir des calories réellement loggées et de
// l'évolution du poids sur la période. Bilan énergétique : 1 kg ≈ 7700 kcal.
// TDEE ≈ apport moyen − (variation de poids en kcal / nombre de jours).
export function adaptiveTDEE(logs: MealLogItem[], weights: WeightLog[], periodDays = 21, asOf: Date = new Date()) {
  const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const asOfISO = localISO(asOf);
  const dayList: string[] = [];
  for (let i = 0; i < periodDays; i++) { const d = new Date(asOf); d.setDate(d.getDate() - i); dayList.push(localISO(d)); }
  const loggedKcal = dayList.map((d) => logMacros(logs, d).kcal).filter((k) => k > 0);
  const daysLogged = loggedKcal.length;
  const cutoff = new Date(asOf); cutoff.setDate(cutoff.getDate() - periodDays);
  const inPeriod = weights.filter((w) => w.date >= localISO(cutoff) && w.date <= asOfISO).sort((a, b) => a.date.localeCompare(b.date));
  const fail = { reliable: false as const, daysLogged, weighs: inPeriod.length, tdee: null, avgIntake: null, weightChange: null, spanDays: null };
  if (daysLogged < 14 || inPeriod.length < 4) return fail;
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const spanDays = Math.max(1, Math.round((new Date(inPeriod[inPeriod.length - 1].date).getTime() - new Date(inPeriod[0].date).getTime()) / 86400000));
  if (spanDays < 10) return { ...fail, spanDays };
  const avgIntake = avg(loggedKcal);
  const firstAvg = avg(inPeriod.slice(0, 3).map((w) => w.weightKg));
  const lastAvg = avg(inPeriod.slice(-3).map((w) => w.weightKg));
  const weightChange = lastAvg - firstAvg;
  const dailyBalance = (weightChange * 7700) / spanDays;
  const tdee = Math.round((avgIntake - dailyBalance) / 10) * 10;
  return { reliable: true as const, daysLogged, weighs: inPeriod.length, tdee, avgIntake: Math.round(avgIntake), weightChange: Math.round(weightChange * 100) / 100, spanDays };
}

// Historique du TDEE réel : une fenêtre glissante de `periodDays` recalculée chaque semaine
// sur les `weeks` dernières semaines. Retourne uniquement les points fiables.
export function tdeeHistory(logs: MealLogItem[], weights: WeightLog[], weeks = 6, periodDays = 21): { label: string; tdee: number }[] {
  const out: { label: string; tdee: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const asOf = new Date(); asOf.setDate(asOf.getDate() - w * 7);
    const r = adaptiveTDEE(logs, weights, periodDays, asOf);
    if (r.reliable) out.push({ label: `${String(asOf.getDate()).padStart(2, "0")}/${String(asOf.getMonth() + 1).padStart(2, "0")}`, tdee: r.tdee });
  }
  return out;
}

// Tendance de poids en kg/semaine : moyenne des 7 dernières pesées moins la moyenne des 7 précédentes.
export function weightTrendPerWeek(weights: WeightLog[]): number | null {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) return null;
  const prev = sorted.slice(-14, -7), recent = sorted.slice(-7);
  const avg = (x: WeightLog[]) => x.reduce((s, w) => s + w.weightKg, 0) / x.length;
  return Math.round((avg(recent) - avg(prev)) * 100) / 100;
}
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
