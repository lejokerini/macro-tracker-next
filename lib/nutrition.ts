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

// ---------------------------------------------------------------------------
// Ravitaillement d'effort (endurance) : glucides, hydratation et sodium à viser
// PENDANT une sortie longue (course, vélo...) pour tenir le seuil de performance.
// Bases : ISSN / ACSM / Jeukendrup (glucides/h selon la durée), 400-800 mL/h d'eau,
// 300-1000 mg/h de sodium selon la chaleur et la sudation.
// Remarque : en aigu, ce sont les glucides + l'eau + le sodium qui portent la
// performance ; les vitamines relèvent surtout de la récupération et du quotidien.
// ---------------------------------------------------------------------------
export type EffortIntensity = "facile" | "modere" | "intense";
export type EffortFuel = {
  hours: number;
  needsFuel: boolean;
  carbsPerHour: number; carbsTotal: number; carbType: "none" | "simple" | "mix";
  fluidPerHour: number; fluidTotal: number;
  sodiumPerHour: number; sodiumTotal: number;
  intervalMin: number;
  preMealCarbs: number | null;
  postCarbs: number; postProtein: number;
};
// Récap hebdomadaire : synthèse des 7 derniers jours pour une carte partageable.
export function weeklyRecap(logs: MealLogItem[], weights: WeightLog[], days = 7) {
  const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayList: string[] = [];
  for (let i = 0; i < days; i++) { const d = new Date(); d.setDate(d.getDate() - i); dayList.push(localISO(d)); }
  const inWindow = new Set(dayList);
  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0, daysLogged = 0;
  for (const d of dayList) {
    const m = logMacros(logs, d);
    if (m.kcal > 0) { daysLogged++; totalKcal += m.kcal; totalP += m.protein; totalC += m.carbs; totalF += m.fat; }
  }
  const foodCount: Record<string, number> = {};
  for (const l of logs) { if (inWindow.has(l.date)) foodCount[l.foodId] = (foodCount[l.foodId] || 0) + 1; }
  let topId: string | null = null, topN = 0;
  for (const [id, c] of Object.entries(foodCount)) { if (c > topN) { topN = c; topId = id; } }
  const topFood = topId ? (findFood(topId)?.name ?? null) : null;
  const inPeriod = weights.filter((w) => inWindow.has(w.date)).sort((a, b) => a.date.localeCompare(b.date));
  const weightChange = inPeriod.length >= 2 ? Math.round((inPeriod[inPeriod.length - 1].weightKg - inPeriod[0].weightKg) * 100) / 100 : null;
  const div = daysLogged || 1;
  return {
    daysLogged,
    avgKcal: Math.round(totalKcal / div),
    avgProtein: Math.round(totalP / div),
    avgCarbs: Math.round(totalC / div),
    avgFat: Math.round(totalF / div),
    totalKcal: Math.round(totalKcal),
    weightChange,
    topFood,
  };
}

// Zones d'entraînement (modèle à 5 zones). Bornes en % : ACSM, Guidelines for Exercise
// Testing and Prescription, 2018. Seuils calculés par la FC de réserve (Karvonen 1957)
// si la FC de repos est connue (plus précis), sinon en % de la FC max. Logique de
// distribution d'intensité : Seiler, 2010.
export type TrainingZone = { key: string; lowPct: number; highPct: number; lowBpm: number; highBpm: number };
export function trainingZones(fcMax: number, fcRest?: number): { method: "hrr" | "hrmax"; zones: TrainingZone[] } {
  const bounds: [string, number, number][] = [["z1", 50, 60], ["z2", 60, 70], ["z3", 70, 80], ["z4", 80, 90], ["z5", 90, 100]];
  const useHrr = !!(fcRest && fcRest > 0 && fcRest < fcMax);
  const rest = fcRest as number;
  const bpm = (pct: number) => useHrr ? Math.round((pct / 100) * (fcMax - rest) + rest) : Math.round((pct / 100) * fcMax);
  const zones = bounds.map(([key, lo, hi]) => ({ key, lowPct: lo, highPct: hi, lowBpm: bpm(lo), highBpm: bpm(hi) }));
  return { method: useHrr ? "hrr" : "hrmax", zones };
}

export function effortFueling(opts: { durationMin: number; intensity: EffortIntensity; weightKg: number; heat?: boolean }): EffortFuel {
  const durationMin = Math.max(0, opts.durationMin || 0);
  const hours = durationMin / 60;
  const w = opts.weightKg && opts.weightKg > 0 ? opts.weightKg : 70;

  // Glucides par heure selon la durée (glucose simple puis mélange glucose-fructose au-delà de 2h30).
  let carbsPerHour = 0;
  let carbType: EffortFuel["carbType"] = "none";
  if (durationMin < 60) { carbsPerHour = 0; carbType = "none"; }
  else if (durationMin < 90) { carbsPerHour = 30; carbType = "simple"; }
  else if (durationMin < 150) { carbsPerHour = 60; carbType = "simple"; }
  else { carbsPerHour = 90; carbType = "mix"; }
  if (opts.intensity === "intense" && carbsPerHour > 0 && carbsPerHour < 90) carbsPerHour += 10;
  const needsFuel = carbsPerHour > 0;
  const carbsTotal = Math.round(carbsPerHour * hours);

  // Hydratation : 400-800 mL/h, majorée à l'effort intense et à la chaleur.
  let fluidPerHour = 500;
  if (opts.intensity === "intense") fluidPerHour += 100;
  if (opts.heat) fluidPerHour += 200;
  fluidPerHour = Math.min(800, fluidPerHour);
  const fluidTotal = Math.round(fluidPerHour * hours);

  // Sodium : 400 mg/h de base, jusqu'à ~1000 mg/h par forte chaleur / grosse sudation.
  let sodiumPerHour = 400;
  if (opts.intensity === "intense") sodiumPerHour += 100;
  if (opts.heat) sodiumPerHour += 300;
  sodiumPerHour = Math.min(1000, sodiumPerHour);
  const sodiumTotal = Math.round(sodiumPerHour * hours);

  // Avant : repas pré-effort riche en glucides pour les sorties > 90 min (~2 g/kg, 1 à 3 h avant).
  const preMealCarbs = durationMin >= 90 ? Math.round(w * 2) : null;
  // Après : fenêtre de récupération, ~1 g/kg de glucides et ~0,3 g/kg de protéines.
  const postCarbs = Math.round(w * 1);
  const postProtein = Math.round(w * 0.3);

  return {
    hours: Math.round(hours * 10) / 10,
    needsFuel,
    carbsPerHour, carbsTotal, carbType,
    fluidPerHour, fluidTotal,
    sodiumPerHour, sodiumTotal,
    intervalMin: 20,
    preMealCarbs, postCarbs, postProtein,
  };
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
