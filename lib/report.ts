import { COACH_PROGRAMS, isCoachProgram, logMacros } from "@/lib/nutrition";
import type { MealLogItem, Profile, Targets, WeightLog } from "@/lib/types";

// Bilan de la semaine à envoyer au coach (WhatsApp ou partage) : alimentation des
// 7 derniers jours, poids moyen comparé à la semaine précédente et, si un programme
// de Lilian Cattani est choisi, position par rapport à la zone visée.

export type WeeklyReport = {
  text: string;
  daysLogged: number;
  avg: { kcal: number; protein: number; carbs: number; fat: number };
  weightAvg: number | null;
  weightPrevAvg: number | null;
  weightDeltaKg: number | null;
  weightDeltaPct: number | null;
  zone: "ok" | "sous" | "dessus" | null;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const LABELS = {
  fr: {
    title: "Bilan Macrolens", week: "semaine du", to: "au", range: "à", sep: " : ", program: "Programme", target: "Objectif",
    journal: "Journal", day: "jour", days: "jours", of: "sur", average: "Moyenne", protOk: "Protéines atteintes", noLog: "aucun repas noté cette semaine",
    weight: "Poids", weightAvg: "moyenne", weighIns: "pesées", vsPrev: "par rapport à la semaine précédente",
    noPrev: "pas de pesée la semaine précédente", noWeight: "aucune pesée cette semaine",
    zone: "Zone du programme", perWeek: "par semaine", inZone: "dans la zone", below: "sous la zone", above: "au-dessus de la zone",
    feeling: "Ressenti", coachAdvice: "Règle du programme : on ajuste de 150 kcal seulement après deux semaines de suite hors zone.",
    locale: "fr-FR",
  },
  es: {
    title: "Balance Macrolens", week: "semana del", to: "al", range: "a", sep: ": ", program: "Programa", target: "Objetivo",
    journal: "Diario", day: "día", days: "días", of: "de", average: "Media", protOk: "Proteínas alcanzadas", noLog: "ninguna comida registrada esta semana",
    weight: "Peso", weightAvg: "media", weighIns: "pesajes", vsPrev: "respecto a la semana anterior",
    noPrev: "sin pesaje la semana anterior", noWeight: "ningún pesaje esta semana",
    zone: "Zona del programa", perWeek: "por semana", inZone: "dentro de la zona", below: "por debajo de la zona", above: "por encima de la zona",
    feeling: "Sensaciones", coachAdvice: "Regla del programa: se ajustan 150 kcal solo tras dos semanas seguidas fuera de la zona.",
    locale: "es-ES",
  },
};

const PROGRAM_NAMES = {
  fr: { masse: "Prise de masse, 12 semaines", seche: "Sèche, 10 semaines", forme: "Remise en forme, 8 semaines", combat: "Prépa physique sports de combat, 8 semaines" },
  es: { masse: "Volumen, 12 semanas", seche: "Definición, 10 semanas", forme: "Puesta en forma, 8 semanas", combat: "Preparación física para deportes de combate, 8 semanas" },
};

export function buildWeeklyReport(opts: {
  profile?: Profile;
  logs: MealLogItem[];
  weights: WeightLog[];
  targets: Targets | null;
  feeling?: string;
  asOf?: Date;
  lang?: "fr" | "es";
}): WeeklyReport {
  const lang = opts.lang === "es" ? "es" : "fr";
  const L = LABELS[lang];
  const asOf = opts.asOf ? new Date(opts.asOf) : new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(asOf); d.setDate(d.getDate() - i); days.push(iso(d)); }
  const prevStart = new Date(asOf); prevStart.setDate(prevStart.getDate() - 13);
  const prevEnd = new Date(asOf); prevEnd.setDate(prevEnd.getDate() - 7);

  const n0 = (x: number) => Math.round(x).toLocaleString(L.locale);
  const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString(L.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = (x: number, f: (v: number) => string) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${f(Math.abs(x))}`;
  const dateLabel = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(L.locale, { day: "numeric", month: "long" });

  // Alimentation
  const perDay = days.map((d) => logMacros(opts.logs, d)).filter((m) => m.kcal > 0);
  const daysLogged = perDay.length;
  const sum = perDay.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const avg = daysLogged
    ? { kcal: Math.round(sum.kcal / daysLogged), protein: Math.round(sum.protein / daysLogged), carbs: Math.round(sum.carbs / daysLogged), fat: Math.round(sum.fat / daysLogged) }
    : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const protDays = opts.targets ? perDay.filter((m) => m.protein >= opts.targets!.protein * 0.9).length : 0;

  // Poids : moyenne des pesées de la semaine contre celle de la semaine précédente.
  const inRange = (from: string, to: string) => opts.weights.filter((w) => w.date >= from && w.date <= to);
  const mean = (xs: WeightLog[]) => (xs.length ? xs.reduce((s, w) => s + w.weightKg, 0) / xs.length : null);
  const week = inRange(days[0], days[6]);
  const prev = inRange(iso(prevStart), iso(prevEnd));
  const weightAvg = mean(week);
  const weightPrevAvg = mean(prev);
  const weightDeltaKg = weightAvg !== null && weightPrevAvg !== null ? Math.round((weightAvg - weightPrevAvg) * 100) / 100 : null;
  const weightDeltaPct = weightDeltaKg !== null && weightPrevAvg ? Math.round((weightDeltaKg / weightPrevAvg) * 10000) / 100 : null;

  const program = opts.profile && isCoachProgram(opts.profile.coachProgram) ? opts.profile.coachProgram : null;
  let zone: WeeklyReport["zone"] = null;
  if (program && weightDeltaPct !== null) {
    const z = COACH_PROGRAMS[program];
    zone = weightDeltaPct < z.weeklyMinPct ? "sous" : weightDeltaPct > z.weeklyMaxPct ? "dessus" : "ok";
  }

  const lines: string[] = [];
  lines.push(`📋 ${L.title}${L.sep}${L.week} ${dateLabel(days[0])} ${L.to} ${dateLabel(days[6])}`);
  if (opts.profile) {
    const who = `${opts.profile.firstName || ""} ${opts.profile.lastName || ""}`.trim();
    lines.push([who, program ? `${L.program}${L.sep}${PROGRAM_NAMES[lang][program]}` : ""].filter(Boolean).join(" · "));
  }
  if (opts.targets) lines.push(`${L.target}${L.sep}${n0(opts.targets.kcal)} kcal · P ${n0(opts.targets.protein)} g · G ${n0(opts.targets.carbs)} g · L ${n0(opts.targets.fat)} g`);
  lines.push("");
  if (daysLogged) {
    lines.push(`🍽️ ${L.journal}${L.sep}${daysLogged} ${daysLogged > 1 ? L.days : L.day} ${L.of} 7`);
    const pct = opts.targets?.kcal ? ` (${Math.round((avg.kcal / opts.targets.kcal) * 100)} %)` : "";
    lines.push(`${L.average}${L.sep}${n0(avg.kcal)} kcal${pct} · P ${n0(avg.protein)} g · G ${n0(avg.carbs)} g · L ${n0(avg.fat)} g`);
    if (opts.targets) lines.push(`${L.protOk}${L.sep}${protDays} ${protDays > 1 ? L.days : L.day} ${L.of} ${daysLogged}`);
  } else {
    lines.push(`🍽️ ${L.journal}${L.sep}${L.noLog}`);
  }
  lines.push("");
  if (weightAvg !== null) {
    let w = `⚖️ ${L.weight}${L.sep}${L.weightAvg} ${n1(weightAvg)} kg (${week.length} ${L.weighIns})`;
    if (weightDeltaKg !== null && weightDeltaPct !== null) w += `, ${signed(weightDeltaKg, n1)} kg ${L.vsPrev} (${signed(weightDeltaPct, (v) => v.toLocaleString(L.locale, { maximumFractionDigits: 2 }))} %)`;
    else w += `, ${L.noPrev}`;
    lines.push(w);
    if (program && zone) {
      const z = COACH_PROGRAMS[program];
      const range = `${signed(z.weeklyMinPct, (v) => v.toLocaleString(L.locale))} ${L.range} ${signed(z.weeklyMaxPct, (v) => v.toLocaleString(L.locale))} % ${L.perWeek}`;
      lines.push(`${L.zone} (${range})${L.sep}${zone === "ok" ? L.inZone : zone === "sous" ? L.below : L.above}`);
      if (zone !== "ok") lines.push(L.coachAdvice);
    }
  } else {
    lines.push(`⚖️ ${L.weight}${L.sep}${L.noWeight}`);
  }
  const feeling = opts.feeling?.trim();
  if (feeling) { lines.push(""); lines.push(`💬 ${L.feeling}${L.sep}${feeling}`); }

  return { text: lines.join("\n"), daysLogged, avg, weightAvg, weightPrevAvg, weightDeltaKg, weightDeltaPct, zone };
}
