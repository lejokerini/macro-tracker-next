"use client";

import { useRef, useState } from "react";
import type { MealType } from "@/lib/types";
import { toEditableItem, type EditableScanItem, type ScanItem } from "@/lib/calsnap";

const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];

const CONFIDENCE_LABEL: Record<EditableScanItem["confidence"], { text: string; color: string }> = {
  high: { text: "Confiance élevée", color: "#15803d" },
  medium: { text: "Confiance moyenne", color: "#b45309" },
  low: { text: "Confiance faible", color: "#b91c1c" },
};

function scaled(item: EditableScanItem) {
  const f = Math.max(0, item.grams) / 100;
  return {
    kcal: Math.round(item.per100.kcal * f),
    protein: Math.round(item.per100.protein * f * 10) / 10,
    carbs: Math.round(item.per100.carbs * f * 10) / 10,
    fat: Math.round(item.per100.fat * f * 10) / 10,
  };
}

export default function SnapModal({
  open,
  onClose,
  onConfirm,
  defaultMeal,
  date,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: EditableScanItem[], meal: MealType) => void;
  defaultMeal: MealType;
  date: string;
}) {
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<EditableScanItem[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setPreview("");
    setItems([]);
    setError("");
    setAnalyzed(false);
    setLoading(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setError("");
    setAnalyzed(false);
    setItems([]);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ""));
    reader.readAsDataURL(file);

    setLoading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/scan-photo", { method: "POST", body: form });
      const data = (await res.json()) as { items?: ScanItem[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Analyse impossible pour le moment.");
        return;
      }
      const editable = (data.items || []).map(toEditableItem);
      setItems(editable);
      setAnalyzed(true);
      if (!editable.length) setError("Aucun aliment détecté. Réessaie avec une photo plus nette ou plus proche.");
    } catch {
      setError("Connexion impossible au service d'analyse.");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(uid: string, patch: Partial<EditableScanItem>) {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }
  function removeItem(uid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  }

  const totals = items.reduce(
    (acc, it) => {
      const s = scaled(it);
      return {
        kcal: acc.kcal + s.kcal,
        protein: Math.round((acc.protein + s.protein) * 10) / 10,
        carbs: Math.round((acc.carbs + s.carbs) * 10) / 10,
        fat: Math.round((acc.fat + s.fat) * 10) / 10,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>📸 Snap mon repas</h2>
          <button className="snap-close" onClick={close} aria-label="Fermer">
            ✕
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />

        {!preview && (
          <div className="snap-capture-zone">
            <p className="muted">Prends ton repas en photo, l'IA estime les calories et les macros.</p>
            <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => cameraRef.current?.click()}>
                📷 Prendre une photo
              </button>
              <button className="btn secondary" onClick={() => libraryRef.current?.click()}>
                🖼️ Importer une image
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div className="snap-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Aperçu du repas" />
            <button className="btn secondary" onClick={() => { reset(); }}>
              Reprendre une photo
            </button>
          </div>
        )}

        {loading && <p className="snap-status">Analyse en cours…</p>}
        {error && <p className="snap-status snap-error">{error}</p>}

        {analyzed && items.length > 0 && (
          <>
            <div className="snap-results">
              {items.map((it) => {
                const s = scaled(it);
                const conf = CONFIDENCE_LABEL[it.confidence];
                return (
                  <div className="snap-item" key={it.uid}>
                    <div className="snap-item-top">
                      <input
                        className="snap-name"
                        value={it.name}
                        onChange={(e) => updateItem(it.uid, { name: e.target.value })}
                      />
                      <button className="snap-remove" onClick={() => removeItem(it.uid)} aria-label="Retirer">
                        ✕
                      </button>
                    </div>
                    <div className="snap-item-row">
                      <label>Portion</label>
                      <button
                        className="qty-btn"
                        onClick={() => updateItem(it.uid, { grams: Math.max(0, it.grams - 10) })}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={it.grams}
                        onChange={(e) => updateItem(it.uid, { grams: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <span className="unit-pill">g</span>
                      <button className="qty-btn" onClick={() => updateItem(it.uid, { grams: it.grams + 10 })}>
                        +
                      </button>
                    </div>
                    <div className="snap-macros">
                      <span>{s.kcal} kcal</span>
                      <span>P {s.protein}g</span>
                      <span>G {s.carbs}g</span>
                      <span>L {s.fat}g</span>
                    </div>
                    <span className="snap-confidence" style={{ color: conf.color }}>
                      {conf.text}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="snap-total">
              <strong>Total : {totals.kcal} kcal</strong>
              <span>P {totals.protein}g · G {totals.carbs}g · L {totals.fat}g</span>
            </div>

            <div className="snap-footer">
              <div className="snap-meal">
                <label>Repas du {date}</label>
                <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                  {MEALS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn"
                disabled={!items.length}
                onClick={() => {
                  onConfirm(items.filter((it) => it.grams > 0), meal);
                  close();
                }}
              >
                Ajouter au journal
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
