"use client";

import { useState } from "react";

function parseNum(v: string) {
  const x = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(x) ? x : 0;
}

// Estimation au mètre ruban (méthode US Navy), mesures en cm.
function navyBodyFat(sex: "homme" | "femme", height: number, neck: number, waist: number, hip: number): number | null {
  if (height <= 0 || neck <= 0 || waist <= 0) return null;
  let bf: number;
  if (sex === "femme") {
    const v = waist + hip - neck;
    if (hip <= 0 || v <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(v) + 0.22100 * Math.log10(height)) - 450;
  } else {
    const v = waist - neck;
    if (v <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(v) + 0.15456 * Math.log10(height)) - 450;
  }
  if (!Number.isFinite(bf)) return null;
  return Math.min(60, Math.max(3, Math.round(bf * 10) / 10));
}

export default function BodyFatModal({
  open,
  onClose,
  onApply,
  defaultSex,
  defaultHeight,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (value: number) => void;
  defaultSex: "homme" | "femme";
  defaultHeight?: number;
}) {
  const [sex, setSex] = useState<"homme" | "femme">(defaultSex);
  const [height, setHeight] = useState(defaultHeight ? String(defaultHeight) : "");
  const [neck, setNeck] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");

  if (!open) return null;

  const result = navyBodyFat(sex, parseNum(height), parseNum(neck), parseNum(waist), parseNum(hip));

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>Estimer ma masse grasse</h2>
          <button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <p className="muted">Méthode US Navy, au mètre ruban (mesures en cm, à jeun le matin). Mesure le cou sous la pomme d&apos;Adam, et le tour de taille au niveau du nombril.</p>

        <div className="grid" style={{ marginTop: 8 }}>
          <div className="span-6"><label>Sexe</label><select value={sex} onChange={(e) => setSex(e.target.value as "homme" | "femme")}><option value="homme">Homme</option><option value="femme">Femme</option></select></div>
          <div className="span-6"><label>Taille (cm)</label><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="ex. 178" /></div>
          <div className="span-6"><label>Cou (cm)</label><input inputMode="decimal" value={neck} onChange={(e) => setNeck(e.target.value)} placeholder="ex. 38" /></div>
          <div className="span-6"><label>Tour de taille (cm)</label><input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="ex. 82" /></div>
          {sex === "femme" && <div className="span-6"><label>Tour de hanches (cm)</label><input inputMode="decimal" value={hip} onChange={(e) => setHip(e.target.value)} placeholder="ex. 96" /></div>}
        </div>

        <div className="bf-result">
          {result !== null ? (
            <><strong>≈ {result} %</strong><span className="muted">de masse grasse estimée</span></>
          ) : (
            <span className="muted">Renseigne les mesures pour obtenir une estimation.</span>
          )}
        </div>

        <p className="form-help">Plus précis : une pince à plis cutanés (méthode Jackson-Pollock 3 plis) ou une balance à impédancemètre. Toutes ces méthodes restent des estimations (±3-4 %).</p>
        <p className="form-help" style={{ marginTop: 6 }}>Source de la méthode : Hodgdon &amp; Beckett, « Prediction of percent body fat for U.S. Navy men/women from body circumferences and height », Naval Health Research Center, 1984.</p>

        <div className="snap-footer">
          <button className="btn secondary" onClick={onClose}>Annuler</button>
          <button className="btn" disabled={result === null} onClick={() => { if (result !== null) onApply(result); }}>Utiliser cette valeur</button>
        </div>
      </div>
    </div>
  );
}
