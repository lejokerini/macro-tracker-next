"use client";

import { useRef, useState } from "react";
import type { MealType } from "@/lib/types";
import { toEditableItem, type EditableScanItem, type ScanItem } from "@/lib/calsnap";
import { makeT } from "@/lib/i18n";

const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];

// Comptage des analyses photo/texte par jour et par appareil (protège le quota partagé de l'API).
function snapDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getSnapUsage(): number {
  try {
    const raw = localStorage.getItem("macrolens-snap-usage");
    if (!raw) return 0;
    const obj = JSON.parse(raw) as { date?: string; count?: number };
    return obj.date === snapDayKey() ? obj.count || 0 : 0;
  } catch {
    return 0;
  }
}
function bumpSnapUsage() {
  try {
    localStorage.setItem("macrolens-snap-usage", JSON.stringify({ date: snapDayKey(), count: getSnapUsage() + 1 }));
  } catch {}
}

const CONFIDENCE_LABEL: Record<EditableScanItem["confidence"], { key: string; color: string }> = {
  high: { key: "snap.confHigh", color: "#15803d" },
  medium: { key: "snap.confMedium", color: "#b45309" },
  low: { key: "snap.confLow", color: "#b91c1c" },
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

// Compresse/redimensionne l'image avant l'envoi (gain de débit et de coût d'analyse).
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ? new File([blob], "meal.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export default function SnapModal({
  open,
  onClose,
  onConfirm,
  onScanBarcode,
  defaultMeal,
  date,
  dailyLimit = 12,
  isPremium = false,
  lang = "fr",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: EditableScanItem[], meal: MealType) => void;
  onScanBarcode?: () => void;
  defaultMeal: MealType;
  date: string;
  dailyLimit?: number;
  isPremium?: boolean;
  lang?: string;
}) {
  const tr = makeT(lang === "es" ? "es" : "fr");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<EditableScanItem[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [description, setDescription] = useState("");
  const [hint, setHint] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [listening, setListening] = useState(false);
  const [editUid, setEditUid] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const lastFile = useRef<File | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  if (!open) return null;

  function toggleDictation() {
    if (listening) { recognitionRef.current?.stop?.(); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as ArrayLike<any>).map((r) => r[0].transcript).join(" ");
      setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function reset() {
    setPreview("");
    setItems([]);
    setError("");
    setAnalyzed(false);
    setLoading(false);
    setDescription("");
    setHint("");
    setCorrecting(false);
    setListening(false);
    recognitionRef.current?.stop?.();
    lastFile.current = null;
  }
  function close() {
    reset();
    onClose();
  }

  async function runAnalysis(payload: { file?: File | null; text?: string; hint?: string }) {
    if (getSnapUsage() >= dailyLimit) {
      setLoading(false);
      setError(isPremium
        ? `Limite quotidienne atteinte (${dailyLimit} analyses). Réessaie demain, ou utilise le code-barres / la recherche.`
        : `Limite du plan gratuit atteinte (${dailyLimit} analyses photo/jour). Passe en Premium pour la photo illimitée, ou utilise le scan code-barres / la recherche (gratuits et illimités).`);
      return;
    }
    setLoading(true);
    setError("");
    bumpSnapUsage();
    try {
      const form = new FormData();
      if (payload.file) form.append("image", payload.file);
      if (payload.text) form.append("text", payload.text);
      if (payload.hint) form.append("hint", payload.hint);
      form.append("lang", lang);
      const res = await fetch("/api/scan-photo", { method: "POST", body: form });
      const data = (await res.json()) as { items?: ScanItem[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Analyse impossible pour le moment.");
        return;
      }
      const editable = (data.items || []).map(toEditableItem);
      setItems(editable);
      setAnalyzed(true);
      setCorrecting(false);
      if (!editable.length) setError("Aucun aliment détecté. Réessaie avec une photo plus nette, ou décris ton repas.");
    } catch {
      setError("Connexion impossible au service d'analyse.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setError("");
    setAnalyzed(false);
    setItems([]);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
    const compressed = await compressImage(file);
    lastFile.current = compressed;
    runAnalysis({ file: compressed, text: description.trim() || undefined });
  }

  function handleText() {
    const text = description.trim();
    if (text.length < 3) return;
    setError("");
    setItems([]);
    setAnalyzed(false);
    setPreview("");
    lastFile.current = null;
    runAnalysis({ text });
  }

  function handleCorrect() {
    const h = hint.trim();
    if (!h) return;
    runAnalysis({ file: lastFile.current, text: lastFile.current ? "" : description.trim(), hint: h });
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
      return { kcal: acc.kcal + s.kcal, protein: Math.round((acc.protein + s.protein) * 10) / 10, carbs: Math.round((acc.carbs + s.carbs) * 10) / 10, fat: Math.round((acc.fat + s.fat) * 10) / 10 };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>{tr("snap.title")}</h2>
          <button className="snap-close" onClick={close} aria-label={tr("common.close")}>✕</button>
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0] || null)} />
        <input ref={libraryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0] || null)} />

        {!preview && !analyzed && (
          <div className="snap-capture-zone">
            <p className="muted">{tr("snap.intro")}</p>
            <div className="snap-describe">
              <label>{tr("snap.describeLabel")}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("snap.describePlaceholder")} rows={2} />
              <p className="form-help">{tr("snap.describeHelp")}</p>
              {speechSupported && <button type="button" className={`btn secondary ${listening ? "mic-on" : ""}`} onClick={toggleDictation}>{listening ? tr("snap.listening") : tr("snap.dictate")}</button>}
            </div>
            <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => cameraRef.current?.click()}>{tr("snap.takePhoto")}</button>
              <button className="btn secondary" onClick={() => libraryRef.current?.click()}>{tr("snap.import")}</button>
              {onScanBarcode && <button className="btn secondary" onClick={() => { reset(); onScanBarcode(); }}>{tr("snap.barcode")}</button>}
              <button className="btn secondary" disabled={description.trim().length < 3} onClick={handleText}>{tr("snap.analyzeDesc")}</button>
            </div>
          </div>
        )}

        {preview && (
          <div className="snap-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Aperçu du repas" />
            <button className="btn secondary" onClick={reset}>{tr("snap.retake")}</button>
          </div>
        )}

        {loading && <p className="snap-status">{tr("snap.analyzing")}</p>}
        {error && (
          <div className="snap-fallback">
            <p className="snap-status snap-error" style={{ margin: 0 }}>{error}</p>
            {onScanBarcode && (
              <div className="row" style={{ justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn secondary" onClick={() => { reset(); onScanBarcode(); }}>{tr("snap.scanBarcode")}</button>
                <button className="btn secondary" onClick={close}>{tr("snap.searchFood")}</button>
              </div>
            )}
          </div>
        )}

        {analyzed && items.length > 0 && (
          <>
            <div className="snap-results">
              {items.map((it) => {
                const s = scaled(it);
                const conf = CONFIDENCE_LABEL[it.confidence];
                return (
                  <div className="snap-item" key={it.uid}>
                    <div className="snap-item-top">
                      <input className="snap-name" value={it.name} onChange={(e) => updateItem(it.uid, { name: e.target.value })} />
                      <button className="snap-remove" onClick={() => removeItem(it.uid)} aria-label={tr("journal.remove")}>✕</button>
                    </div>
                    <div className="snap-item-row">
                      <label>{tr("snap.portion")}</label>
                      <button className="qty-btn" onClick={() => updateItem(it.uid, { grams: Math.max(0, it.grams - 10) })}>−</button>
                      <input type="text" inputMode="decimal" value={editUid === it.uid ? editText : String(it.grams)} onFocus={(e) => { setEditUid(it.uid); setEditText(String(it.grams)); e.currentTarget.select(); }} onBlur={() => setEditUid(null)} onChange={(e) => { const t = e.target.value; setEditText(t); if (t.trim() === "") return; const n = Number(t.replace(",", ".")); if (Number.isFinite(n)) updateItem(it.uid, { grams: Math.max(0, n) }); }} />
                      <span className="unit-pill">g</span>
                      <button className="qty-btn" onClick={() => updateItem(it.uid, { grams: it.grams + 10 })}>+</button>
                    </div>
                    <div className="snap-macros">
                      <span>{s.kcal} kcal</span><span>P {s.protein}g</span><span>G {s.carbs}g</span><span>L {s.fat}g</span>
                    </div>
                    <span className="snap-confidence" style={{ color: conf.color }}>{tr(conf.key)}</span>
                  </div>
                );
              })}
            </div>

            <div className="snap-total">
              <strong>{tr("snap.total")}{totals.kcal} kcal</strong>
              <span>P {totals.protein}g · G {totals.carbs}g · L {totals.fat}g</span>
            </div>

            {!correcting ? (
              <button className="btn secondary snap-correct-btn" onClick={() => setCorrecting(true)}>{tr("snap.correct")}</button>
            ) : (
              <div className="snap-describe">
                <label>{tr("snap.whatsWrong")}</label>
                <textarea value={hint} onChange={(e) => setHint(e.target.value)} placeholder={tr("snap.correctPlaceholder")} rows={2} />
                <button className="btn" disabled={hint.trim().length < 2 || loading} onClick={handleCorrect}>{tr("snap.reanalyze")}</button>
              </div>
            )}

            <div className="snap-footer">
              <div className="snap-meal">
                <label>{tr("snap.mealOf")}{date}</label>
                <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                  {MEALS.map((m) => (<option key={m} value={m}>{tr("meal."+m)}</option>))}
                </select>
              </div>
              <button className="btn" disabled={!items.length} onClick={() => { onConfirm(items.filter((it) => it.grams > 0), meal); close(); }}>{tr("journal.addToJournal")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
