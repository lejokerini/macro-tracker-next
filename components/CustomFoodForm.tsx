"use client";

import { useRef, useState } from "react";
import type { Food } from "@/lib/types";
import { makeCustomFood, type CustomFoodInput } from "@/lib/food-engine";
import { compressImage } from "@/lib/image";
import { makeT } from "@/lib/i18n";

type LabelResponse = {
  label?: {
    name: string; brand?: string; per: "100g" | "100ml";
    kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugars?: number; salt?: number; servingGrams?: number;
  };
  error?: string;
};

type Fields = {
  name: string; brand: string; per: "100g" | "100ml";
  kcal: string; protein: string; carbs: string; fat: string; fiber: string; sugars: string; salt: string; servingGrams: string;
};

const fmt = (n?: number) => (n === undefined || n === null || !Number.isFinite(n) ? "" : String(n).replace(".", ","));
const parse = (s: string) => {
  const x = Number(s.replace(",", ".").trim());
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

function fieldsFrom(food?: Food, initialName = ""): Fields {
  if (!food) return { name: initialName, brand: "", per: "100g", kcal: "", protein: "", carbs: "", fat: "", fiber: "", sugars: "", salt: "", servingGrams: "" };
  return {
    name: food.name,
    brand: food.brand || "",
    per: food.unit === "ml" ? "100ml" : "100g",
    kcal: fmt(food.macros.kcal),
    protein: fmt(food.macros.protein),
    carbs: fmt(food.macros.carbs),
    fat: fmt(food.macros.fat),
    fiber: fmt(food.macros.fiber),
    sugars: fmt(food.micros?.sugars),
    salt: fmt(food.micros?.salt),
    servingGrams: fmt(food.servingGrams),
  };
}

// Formulaire « Créer un aliment » : saisie des valeurs de l'étiquette, ou lecture
// automatique de la photo du tableau nutritionnel. Sert aussi quand un code-barres
// est introuvable : le produit créé est retenu avec son code pour le prochain scan.
export default function CustomFoodForm({
  barcode,
  editing,
  initialName = "",
  lang = "fr",
  submitLabel,
  onSave,
  onCancel,
}: {
  barcode?: string;
  editing?: Food;
  initialName?: string;
  lang?: string;
  submitLabel?: string;
  onSave: (food: Food) => void;
  onCancel?: () => void;
}) {
  const tr = makeT(lang === "es" ? "es" : "fr");
  const [f, setF] = useState<Fields>(() => fieldsFrom(editing, initialName));
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState("");
  const [readOk, setReadOk] = useState(false);
  const [fromPhoto, setFromPhoto] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const kcal = parse(f.kcal), protein = parse(f.protein), carbs = parse(f.carbs), fat = parse(f.fat);
  const computed = Math.round(protein * 4 + carbs * 4 + fat * 9);
  // Cohérence : les calories annoncées doivent correspondre à peu près aux macros.
  const mismatch = kcal > 0 && computed > 0 && Math.abs(kcal - computed) > Math.max(40, kcal * 0.25);
  const unitWord = f.per === "100ml" ? "100 ml" : "100 g";

  async function readLabel(file: File) {
    setReading(true);
    setReadMsg(tr("cf.reading"));
    setReadOk(false);
    try {
      const img = await compressImage(file, 1600, "etiquette.jpg");
      const form = new FormData();
      form.append("image", img);
      form.append("mode", "label");
      form.append("lang", lang === "es" ? "es" : "fr");
      const res = await fetch("/api/scan-photo", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as LabelResponse;
      if (!res.ok || !data.label) {
        setReadMsg(data.error || tr("cf.readFail"));
        return;
      }
      const l = data.label;
      setF((x) => ({
        ...x,
        name: x.name || l.name,
        brand: x.brand || l.brand || "",
        per: l.per,
        kcal: fmt(l.kcal),
        protein: fmt(l.protein),
        carbs: fmt(l.carbs),
        fat: fmt(l.fat),
        fiber: fmt(l.fiber),
        sugars: fmt(l.sugars),
        salt: fmt(l.salt),
        servingGrams: x.servingGrams || fmt(l.servingGrams),
      }));
      setFromPhoto(true);
      setReadOk(true);
      setReadMsg(tr("cf.readDone"));
    } catch {
      setReadMsg(tr("cf.readFail"));
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (!f.name.trim()) { setError(tr("cf.errName")); return; }
    if (kcal <= 0 && computed <= 0) { setError(tr("cf.errValues")); return; }
    if (protein + carbs + fat > 105) { setError(tr("cf.errTooMuch")); return; }
    const input: CustomFoodInput = {
      id: editing?.id,
      name: f.name,
      brand: f.brand,
      barcode: editing?.barcode || barcode,
      per: f.per,
      kcal: kcal > 0 ? kcal : computed,
      protein, carbs, fat,
      fiber: parse(f.fiber),
      sugars: parse(f.sugars) || undefined,
      salt: parse(f.salt) || undefined,
      servingGrams: parse(f.servingGrams) || undefined,
      fromLabelPhoto: fromPhoto,
    };
    onSave(makeCustomFood(input));
  }

  return (
    <div className="custom-food-form">
      <div className="cf-photo">
        <button type="button" className="btn secondary" disabled={reading} onClick={() => fileRef.current?.click()}>
          {reading ? tr("cf.readingBtn") : tr("cf.photoBtn")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) readLabel(file); }}
        />
        <p className={`form-help ${readMsg && !readOk && !reading ? "bad-text" : ""}`}>{readMsg || tr("cf.photoHelp")}</p>
      </div>

      <div className="cf-grid">
        <div className="cf-wide"><label>{tr("cf.name")}</label><input value={f.name} onChange={set("name")} placeholder={tr("cf.namePh")} /></div>
        <div className="cf-wide"><label>{tr("cf.brand")}</label><input value={f.brand} onChange={set("brand")} placeholder={tr("cf.optional")} /></div>
        <div className="cf-wide">
          <label>{tr("cf.valuesFor")}</label>
          <div className="row">
            {(["100g", "100ml"] as const).map((p) => (
              <button key={p} type="button" className={`filter-chip ${f.per === p ? "active" : ""}`} onClick={() => setF((x) => ({ ...x, per: p }))}>
                {p === "100g" ? "100 g" : "100 ml"}
              </button>
            ))}
          </div>
        </div>
        <div><label>{tr("cf.kcal")}</label><input inputMode="decimal" value={f.kcal} onChange={set("kcal")} placeholder="kcal" /></div>
        <div><label>{tr("cf.protein")}</label><input inputMode="decimal" value={f.protein} onChange={set("protein")} placeholder="g" /></div>
        <div><label>{tr("cf.carbs")}</label><input inputMode="decimal" value={f.carbs} onChange={set("carbs")} placeholder="g" /></div>
        <div><label>{tr("cf.fat")}</label><input inputMode="decimal" value={f.fat} onChange={set("fat")} placeholder="g" /></div>
        <div><label>{tr("cf.fiber")}</label><input inputMode="decimal" value={f.fiber} onChange={set("fiber")} placeholder="g" /></div>
        <div><label>{tr("cf.sugars")}</label><input inputMode="decimal" value={f.sugars} onChange={set("sugars")} placeholder="g" /></div>
        <div><label>{tr("cf.salt")}</label><input inputMode="decimal" value={f.salt} onChange={set("salt")} placeholder="g" /></div>
        <div><label>{tr("cf.serving")}</label><input inputMode="decimal" value={f.servingGrams} onChange={set("servingGrams")} placeholder={tr("cf.optional")} /></div>
      </div>
      <p className="form-help">{tr("cf.per")} {unitWord}. {barcode ? `${tr("cf.barcodeKept")} ${barcode}.` : ""}</p>
      {mismatch && <p className="notice">{tr("cf.mismatch").replace("{kcal}", String(kcal)).replace("{computed}", String(computed))}</p>}
      {error && <p className="form-help bad-text">{error}</p>}
      <div className="row cf-actions">
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>{tr("common.cancel")}</button>}
        <button type="button" className="btn" onClick={save}>{submitLabel || tr("cf.save")}</button>
      </div>
    </div>
  );
}
