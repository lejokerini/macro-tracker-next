"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import type { Food, MealType } from "@/lib/types";
import { fetchOpenFoodFactsByBarcode } from "@/lib/openfoodfacts";
import { estimateServingGrams, isPieceInput } from "@/lib/food-engine";

const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];

type Phase = "scan" | "fetching" | "found" | "notfound" | "error";
type QUnit = "piece" | "g" | "cl";

// Convertit la quantité saisie (dans l'unité choisie) en grammes pour les calculs.
function toBaseGrams(food: Food, qty: number, unit: QUnit) {
  if (unit === "piece") return qty * estimateServingGrams(food);
  if (unit === "cl") return qty * 10; // 1 cl ≈ 10 g/ml
  return qty; // g
}
function macrosFor(food: Food, grams: number) {
  const f = Math.max(0, grams) / 100;
  return {
    grams: Math.round(grams),
    kcal: Math.round(food.macros.kcal * f),
    protein: Math.round(food.macros.protein * f * 10) / 10,
    carbs: Math.round(food.macros.carbs * f * 10) / 10,
    fat: Math.round(food.macros.fat * f * 10) / 10,
  };
}
function unitLabelOf(unit: QUnit, food: Food) {
  if (unit === "piece") return `${food.servingLabel || "pièce"}(s)`;
  return unit;
}

export default function BarcodeScanModal({
  open,
  onClose,
  onConfirm,
  defaultMeal,
  date,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (food: Food, baseGrams: number, displayQty: number, displayUnit: QUnit, meal: MealType) => void;
  defaultMeal: MealType;
  date: string;
}) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [product, setProduct] = useState<Food | null>(null);
  const [qty, setQty] = useState(100);
  const [unit, setUnit] = useState<QUnit>("g");
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [nnInfo, setNnInfo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lookupGuard = useRef(false);

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }

  async function lookup(code: string) {
    const clean = code.trim();
    if (!clean || lookupGuard.current) return;
    lookupGuard.current = true;
    stopCamera();
    setLastCode(clean);
    setPhase("fetching");
    try {
      const food = await fetchOpenFoodFactsByBarcode(clean);
      if (food) {
        setProduct(food);
        const defUnit: QUnit = isPieceInput(food) ? "piece" : food.unit === "ml" ? "cl" : "g";
        setUnit(defUnit);
        setQty(defUnit === "piece" ? 1 : defUnit === "cl" ? 25 : 100);
        setPhase("found");
      } else {
        setPhase("notfound");
      }
    } catch {
      setErrorMsg("Recherche Open Food Facts indisponible. Réessaie ou saisis le code à la main.");
      setPhase("error");
    } finally {
      lookupGuard.current = false;
    }
  }

  // Démarre / arrête la caméra selon la phase.
  useEffect(() => {
    if (!open || phase !== "scan") return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result) lookup(result.getText());
        });
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setErrorMsg("Caméra inaccessible. Autorise la caméra dans le navigateur, ou saisis le code à la main.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      lookupGuard.current = false;
    }
  }, [open]);

  if (!open) return null;

  function close() {
    stopCamera();
    setPhase("scan");
    setProduct(null);
    setErrorMsg("");
    setLastCode("");
    setManualCode("");
    onClose();
  }
  function rescan() {
    setProduct(null);
    setErrorMsg("");
    setPhase("scan");
  }

  const baseGrams = product ? toBaseGrams(product, qty, unit) : 0;
  const preview = product ? macrosFor(product, baseGrams) : null;
  const step = unit === "piece" ? 1 : unit === "cl" ? 5 : 10;

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>🏷️ Scanner un code-barres</h2>
          <button className="snap-close" onClick={close} aria-label="Fermer">
            ✕
          </button>
        </div>

        {phase === "scan" && (
          <>
            <div className="barcode-scanner">
              <video ref={videoRef} muted playsInline />
              <div className="barcode-frame" />
            </div>
            <p className="snap-status barcode-hint">Vise le code-barres du produit…</p>
            <div className="barcode-manual">
              <label>Ou saisis le code manuellement</label>
              <div className="row">
                <input
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="ex. 7622210449283"
                />
                <button className="btn secondary" disabled={manualCode.length < 8} onClick={() => lookup(manualCode)}>
                  Chercher
                </button>
              </div>
            </div>
          </>
        )}

        {phase === "fetching" && <p className="snap-status">Recherche du produit… ({lastCode})</p>}

        {phase === "notfound" && (
          <div className="barcode-message">
            <p className="snap-status snap-error">Produit introuvable pour le code {lastCode}.</p>
            <p className="muted">Tous les produits ne sont pas dans Open Food Facts. Tu peux réessayer ou l'ajouter via la recherche par nom.</p>
            <button className="btn" onClick={rescan}>Scanner à nouveau</button>
          </div>
        )}

        {phase === "error" && (
          <div className="barcode-message">
            <p className="snap-status snap-error">{errorMsg}</p>
            <div className="barcode-manual">
              <label>Saisir le code manuellement</label>
              <div className="row">
                <input
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="ex. 7622210449283"
                />
                <button className="btn secondary" disabled={manualCode.length < 8} onClick={() => lookup(manualCode)}>
                  Chercher
                </button>
              </div>
            </div>
            <button className="btn" onClick={rescan}>Réessayer la caméra</button>
          </div>
        )}

        {phase === "found" && product && preview && (
          <>
            <div className="product-card">
              <div className="product-image" aria-hidden="true">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" />
                ) : (
                  <span>{product.icon || "🏷️"}</span>
                )}
              </div>
              <div className="product-info">
                <h3>{product.name}</h3>
                <p className="muted">
                  {product.brand ? `${product.brand} · ` : ""}Code {product.barcode}
                  {unit === "piece" ? ` · 1 ${product.servingLabel || "portion"} ≈ ${estimateServingGrams(product)} g` : ""}
                </p>
                {(product.nutriScore || product.novaGroup) && (
                  <div className="product-topline" style={{ marginBottom: 6 }}>
                    {product.nutriScore && <span className={`nutri-badge nutri-${product.nutriScore}`}>{product.nutriScore.toUpperCase()}</span>}
                    {product.novaGroup && <span className={`nova-badge nova-${product.novaGroup}`}>NOVA {product.novaGroup}</span>}
                    <button type="button" className="info-link" onClick={() => setNnInfo(true)} aria-label="Comprendre le Nutri-Score et le groupe NOVA">ⓘ</button>
                  </div>
                )}
                <div className="product-macros">
                  <span>{preview.kcal} kcal</span>
                  <span>P {preview.protein}g</span>
                  <span>G {preview.carbs}g</span>
                  <span>L {preview.fat}g</span>
                </div>
              </div>
            </div>

            <div className="unit-select">
              <span className="muted">Unité :</span>
              {(["piece", "g", "cl"] as QUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`filter-chip ${unit === u ? "active" : ""}`}
                  onClick={() => { setUnit(u); setQty(u === "piece" ? 1 : u === "cl" ? 25 : 100); }}
                >
                  {u === "piece" ? "Pièce" : u}
                </button>
              ))}
            </div>
            <div className="snap-item-row">
              <label>Quantité</label>
              <button className="qty-btn" onClick={() => setQty((q) => Math.max(0, Math.round((q - step) * 10) / 10))}>
                −
              </button>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="unit-pill">{unitLabelOf(unit, product)}</span>
              <button className="qty-btn" onClick={() => setQty((q) => Math.round((q + step) * 10) / 10)}>
                +
              </button>
            </div>
            {unit !== "g" && <p className="muted" style={{ margin: "0 0 8px" }}>≈ {preview.grams} g au total</p>}

            <div className="snap-footer">
              <div className="snap-meal">
                <label>Repas du {date}</label>
                <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                  {MEALS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <button className="btn secondary" onClick={rescan}>Rescanner</button>
                <button
                  className="btn"
                  disabled={qty <= 0}
                  onClick={() => {
                    onConfirm(product, toBaseGrams(product, qty, unit), qty, unit, meal);
                    close();
                  }}
                >
                  Ajouter au journal
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {nnInfo && (
        <div className="snap-overlay" role="dialog" aria-modal="true" onClick={() => setNnInfo(false)}>
          <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="snap-head"><h2>Nutri-Score &amp; NOVA</h2><button className="snap-close" onClick={() => setNnInfo(false)} aria-label="Fermer">✕</button></div>
            <div className="macro-info-type"><strong>Nutri-Score{product?.nutriScore ? ` · ce produit :${product.nutriScore.toUpperCase()}` : ""}</strong><span>Une note de <strong>A (meilleur) à E</strong> résumant la qualité nutritionnelle pour 100 g/mL : elle compare les éléments favorables (fibres, protéines, fruits/légumes) à ceux à limiter (calories, sucres, acides gras saturés, sel).</span></div>
            <div className="macro-info-type"><strong>Groupe NOVA{product?.novaGroup ? ` · ce produit :${product.novaGroup}` : ""}</strong><span>Classe les aliments selon leur degré de transformation : 1 = brut · 2 = ingrédient culinaire · 3 = transformé · <strong>4 = ultra-transformé</strong>.</span></div>
            <p className="notice" style={{ marginTop: 12 }}>Complémentaires : le Nutri-Score juge la composition, NOVA la transformation. Un bon Nutri-Score peut coexister avec un produit ultra-transformé.</p>
            <p className="form-help" style={{ marginTop: 10 }}>Sources : Nutri-Score : Santé publique France (modèle FSA/Ofcom). NOVA : Monteiro CA et al., Public Health Nutrition, 2019. Données Open Food Facts.</p>
          </div>
        </div>
      )}
    </div>
  );
}
