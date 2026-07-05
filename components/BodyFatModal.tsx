"use client";

import { useState } from "react";
import { makeT } from "@/lib/i18n";

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
  lang = "fr",
}: {
  open: boolean;
  onClose: () => void;
  onApply: (value: number) => void;
  defaultSex: "homme" | "femme";
  defaultHeight?: number;
  lang?: string;
}) {
  const tr = makeT(lang === "es" ? "es" : "fr");
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
          <h2>{tr("bf.title")}</h2>
          <button className="snap-close" onClick={onClose} aria-label={tr("common.close")}>✕</button>
        </div>

        <p className="muted">{tr("bf.method")}</p>

        <div className="grid" style={{ marginTop: 8 }}>
          <div className="span-6"><label>{tr("prof.sex")}</label><select value={sex} onChange={(e) => setSex(e.target.value as "homme" | "femme")}><option value="homme">{tr("prof.male")}</option><option value="femme">{tr("prof.female")}</option></select></div>
          <div className="span-6"><label>{tr("bf.height")}</label><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="ex. 178" /></div>
          <div className="span-6"><label>{tr("bf.neck")}</label><input inputMode="decimal" value={neck} onChange={(e) => setNeck(e.target.value)} placeholder="ex. 38" /></div>
          <div className="span-6"><label>{tr("bf.waist")}</label><input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="ex. 82" /></div>
          {sex === "femme" && <div className="span-6"><label>{tr("bf.hip")}</label><input inputMode="decimal" value={hip} onChange={(e) => setHip(e.target.value)} placeholder="ex. 96" /></div>}
        </div>

        <div className="bf-result">
          {result !== null ? (
            <><strong>≈ {result} %</strong><span className="muted">{tr("bf.result")}</span></>
          ) : (
            <span className="muted">{tr("bf.enterMeasures")}</span>
          )}
        </div>

        <p className="form-help">{tr("bf.moreAccurate")}</p>
        <p className="form-help" style={{ marginTop: 6 }}>{tr("bf.source")}</p>

        <div className="snap-footer">
          <button className="btn secondary" onClick={onClose}>{tr("common.cancel")}</button>
          <button className="btn" disabled={result === null} onClick={() => { if (result !== null) onApply(result); }}>{tr("bf.use")}</button>
        </div>
      </div>
    </div>
  );
}
