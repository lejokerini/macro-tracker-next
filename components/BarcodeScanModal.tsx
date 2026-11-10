"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import type { Food, MealType } from "@/lib/types";
import { fetchOpenFoodFactsByBarcode } from "@/lib/openfoodfacts";
import { barcodeVariants, estimateServingGrams, isPieceInput } from "@/lib/food-engine";
import { isValidFoodBarcode } from "@/lib/barcode";
import { makeT } from "@/lib/i18n";
import CustomFoodForm from "@/components/CustomFoodForm";

// Lecteur de codes-barres intégré au navigateur (Chrome Android, Safari récent) :
// plus rapide et plus fiable que la lecture en JavaScript quand il existe.
type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = { new (opts: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };
const FOOD_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

async function createNativeDetector(): Promise<NativeDetector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? [];
    const formats = FOOD_FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Ctor({ formats }) : null;
  } catch {
    return null;
  }
}

type TrackCaps = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };

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
  lang = "fr",
  findLocal,
  onCreateFood,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (food: Food, baseGrams: number, displayQty: number, displayUnit: QUnit, meal: MealType) => void;
  defaultMeal: MealType;
  date: string;
  lang?: string;
  /** Produits déjà connus sur ce téléphone (scannés ou créés) : réponse immédiate, même hors ligne. */
  findLocal?: (code: string) => Food | undefined;
  /** Enregistre un produit créé par l'utilisateur (code-barres introuvable). */
  onCreateFood?: (food: Food) => void;
}) {
  const tr = makeT(lang === "es" ? "es" : "fr");
  const [phase, setPhase] = useState<Phase>("scan");
  const [product, setProduct] = useState<Food | null>(null);
  const [qty, setQty] = useState(100);
  const [unit, setUnit] = useState<QUnit>("g");
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [nnInfo, setNnInfo] = useState(false);
  const [qtyText, setQtyText] = useState("");
  const [qtyFocused, setQtyFocused] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [manualError, setManualError] = useState("");
  const [creating, setCreating] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lookupGuard = useRef(false);
  const lastRead = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  function stopCamera() {
    stopRef.current?.();
    stopRef.current = null;
    trackRef.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
  }

  function showProduct(food: Food, cached: boolean) {
    setProduct(food);
    setFromCache(cached);
    const defUnit: QUnit = isPieceInput(food) ? "piece" : food.unit === "ml" ? "cl" : "g";
    setUnit(defUnit);
    setQty(defUnit === "piece" ? 1 : defUnit === "cl" ? 25 : 100);
    setPhase("found");
  }

  // Code tapé à la main : on vérifie la clé avant d'interroger la base.
  function manualLookup() {
    if (!isValidFoodBarcode(manualCode)) { setManualError(tr("bc.invalidCode")); return; }
    setManualError("");
    lookup(manualCode);
  }

  async function lookup(code: string) {
    const clean = code.replace(/\D/g, "");
    if (!clean || lookupGuard.current) return;
    lookupGuard.current = true;
    stopCamera();
    setLastCode(clean);
    setCreating(false);
    // 1. Déjà connu sur ce téléphone : instantané, même sans réseau.
    const local = findLocal?.(clean);
    if (local) {
      showProduct(local, true);
      lookupGuard.current = false;
      return;
    }
    setPhase("fetching");
    try {
      // 2. Open Food Facts (un UPC à 12 chiffres peut y être enregistré avec un 0 devant).
      let food: Food | null = null;
      for (const variant of barcodeVariants(clean)) {
        food = await fetchOpenFoodFactsByBarcode(variant);
        if (food) break;
      }
      if (food) showProduct(food, false);
      else setPhase("notfound");
    } catch {
      setErrorMsg(typeof navigator !== "undefined" && navigator.onLine === false ? tr("bc.errOffline") : tr("bc.errOff"));
      setPhase("error");
    } finally {
      lookupGuard.current = false;
    }
  }

  // Code lu par la caméra : clé de contrôle vérifiée ; avec le lecteur JavaScript, on
  // attend deux lectures identiques de suite pour écarter les erreurs de lecture.
  function handleRead(raw: string, trusted: boolean) {
    const code = raw.replace(/\D/g, "");
    if (!isValidFoodBarcode(code)) return;
    const now = Date.now();
    const confirmed = trusted || (lastRead.current.code === code && now - lastRead.current.at < 1500);
    lastRead.current = { code, at: now };
    if (!confirmed || lookupGuard.current) return;
    try { navigator.vibrate?.(60); } catch { /* vibration non disponible */ }
    lookup(code);
  }

  async function setupTrack(track?: MediaStreamTrack) {
    if (!track) return;
    trackRef.current = track;
    const caps = (track.getCapabilities?.() || {}) as TrackCaps;
    setTorchAvailable(!!caps.torch);
    if (caps.focusMode?.includes("continuous")) {
      try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }); } catch { /* mise au point non réglable */ }
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  // Démarre / arrête la caméra selon la phase.
  useEffect(() => {
    if (!open || phase !== "scan") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    const video = videoRef.current;
    const stop = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
    stopRef.current = stop;
    (async () => {
      try {
        const native = await createNativeDetector();
        if (cancelled || !video) return;
        if (native) {
          // Lecteur natif : caméra arrière en haute définition, analyse ~8 fois par seconde.
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          await setupTrack(stream.getVideoTracks()[0]);
          const tick = async () => {
            if (cancelled) return;
            if (video.readyState >= 2) {
              try {
                const codes = await native.detect(video);
                for (const c of codes) handleRead(c.rawValue, true);
              } catch { /* image non analysable, on continue */ }
            }
            if (!cancelled) timer = setTimeout(tick, 120);
          };
          tick();
        } else {
          // Repli JavaScript (ZXing), limité aux codes alimentaires pour aller plus vite.
          const hints = new Map<DecodeHintType, unknown>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
          controls = await reader.decodeFromConstraints(
            { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            video,
            (result) => { if (result) handleRead(result.getText(), false); },
          );
          if (cancelled) { controls.stop(); return; }
          const src = video.srcObject;
          if (src instanceof MediaStream) await setupTrack(src.getVideoTracks()[0]);
        }
      } catch {
        if (!cancelled) {
          setErrorMsg(tr("bc.errCamera"));
          setPhase("error");
        }
      }
    })();
    return () => {
      stop();
      if (stopRef.current === stop) stopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      lookupGuard.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function close() {
    stopCamera();
    setPhase("scan");
    setProduct(null);
    setErrorMsg("");
    setLastCode("");
    setManualCode("");
    setCreating(false);
    onClose();
  }
  function rescan() {
    setProduct(null);
    setErrorMsg("");
    setManualCode("");
    setManualError("");
    setCreating(false);
    lastRead.current = { code: "", at: 0 };
    setPhase("scan");
  }
  function saveCreated(food: Food) {
    onCreateFood?.(food);
    setCreating(false);
    showProduct(food, false);
  }

  const baseGrams = product ? toBaseGrams(product, qty, unit) : 0;
  const preview = product ? macrosFor(product, baseGrams) : null;
  const step = unit === "piece" ? 1 : unit === "cl" ? 5 : 10;

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>{tr("bc.title")}</h2>
          <button className="snap-close" onClick={close} aria-label={tr("common.close")}>
            ✕
          </button>
        </div>

        {phase === "scan" && (
          <>
            <div className="barcode-scanner">
              <video ref={videoRef} muted playsInline />
              <div className="barcode-frame" />
              {torchAvailable && (
                <button type="button" className={`barcode-torch ${torchOn ? "on" : ""}`} onClick={toggleTorch} aria-pressed={torchOn}>
                  {torchOn ? tr("bc.torchOff") : tr("bc.torchOn")}
                </button>
              )}
            </div>
            <p className="snap-status barcode-hint">{tr("bc.aim")}</p>
            <div className="barcode-manual">
              <label>{tr("bc.manualLabel")}</label>
              <div className="row">
                <input
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => { setManualCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 14)); setManualError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && manualCode.length >= 8) manualLookup(); }}
                  placeholder="ex. 7622210449283"
                />
                <button className="btn secondary" disabled={manualCode.length < 8} onClick={manualLookup}>
                  {tr("bc.search")}
                </button>
              </div>
              {manualError && <p className="form-help bad-text">{manualError}</p>}
            </div>
          </>
        )}

        {phase === "fetching" && <p className="snap-status">{tr("bc.searching")}({lastCode})</p>}

        {phase === "notfound" && (
          <div className="barcode-message">
            <p className="snap-status snap-error">{tr("bc.notFoundPre")}{lastCode}.</p>
            <p className="muted">{tr("bc.notFoundCreate")}</p>
            <CustomFoodForm barcode={lastCode} lang={lang} submitLabel={tr("bc.createSave")} onSave={saveCreated} onCancel={rescan} />
          </div>
        )}

        {phase === "error" && (
          <div className="barcode-message">
            <p className="snap-status snap-error">{errorMsg}</p>
            <div className="barcode-manual">
              <label>{tr("bc.manualLabel2")}</label>
              <div className="row">
                <input
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => { setManualCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 14)); setManualError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && manualCode.length >= 8) manualLookup(); }}
                  placeholder="ex. 7622210449283"
                />
                <button className="btn secondary" disabled={manualCode.length < 8} onClick={manualLookup}>
                  {tr("bc.search")}
                </button>
              </div>
              {manualError && <p className="form-help bad-text">{manualError}</p>}
            </div>
            {lastCode && !creating && (
              <button className="btn secondary" onClick={() => setCreating(true)}>{tr("bc.createManual")}</button>
            )}
            {lastCode && creating && (
              <CustomFoodForm barcode={lastCode} lang={lang} submitLabel={tr("bc.createSave")} onSave={saveCreated} onCancel={() => setCreating(false)} />
            )}
            <button className="btn" onClick={rescan}>{tr("bc.retryCamera")}</button>
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
                {fromCache && <p className="form-help" style={{ margin: "0 0 4px" }}>{tr("bc.fromCache")}</p>}
                <p className="muted">
                  {product.brand ? `${product.brand} · ` : ""}{tr("bc.code")}{product.barcode || lastCode}
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
              <span className="muted">{tr("bc.unit")}</span>
              {(["piece", "g", "cl"] as QUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`filter-chip ${unit === u ? "active" : ""}`}
                  onClick={() => { setUnit(u); setQty(u === "piece" ? 1 : u === "cl" ? 25 : 100); }}
                >
                  {u === "piece" ? tr("bc.piece") : u}
                </button>
              ))}
            </div>
            <div className="snap-item-row">
              <label>{tr("bc.quantity")}</label>
              <button className="qty-btn" onClick={() => setQty((q) => Math.max(0, Math.round((q - step) * 10) / 10))}>
                −
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={qtyFocused ? qtyText : String(qty)}
                onFocus={(e) => { setQtyFocused(true); setQtyText(String(qty)); e.currentTarget.select(); }}
                onBlur={() => setQtyFocused(false)}
                onChange={(e) => { const t = e.target.value; setQtyText(t); if (t.trim() === "") return; const n = Number(t.replace(",", ".")); if (Number.isFinite(n)) setQty(Math.max(0, n)); }}
              />
              <span className="unit-pill">{unitLabelOf(unit, product)}</span>
              <button className="qty-btn" onClick={() => setQty((q) => Math.round((q + step) * 10) / 10)}>
                +
              </button>
            </div>
            {unit !== "g" && <p className="muted" style={{ margin: "0 0 8px" }}>≈ {preview.grams} {tr("bc.gTotal")}</p>}

            <div className="snap-footer">
              <div className="snap-meal">
                <label>{tr("snap.mealOf")}{date}</label>
                <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                  {MEALS.map((m) => (
                    <option key={m} value={m}>{tr("meal."+m)}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <button className="btn secondary" onClick={rescan}>{tr("bc.rescan")}</button>
                <button
                  className="btn"
                  disabled={qty <= 0}
                  onClick={() => {
                    onConfirm(product, toBaseGrams(product, qty, unit), qty, unit, meal);
                    close();
                  }}
                >
                  {tr("journal.addToJournal")}
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
