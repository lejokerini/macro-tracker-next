"use client";

// Petits composants d'affichage de l'app (graphiques, badges, fenêtres d'information…),
// sortis de MacroTrackerApp.tsx pour l'alléger. Aucun changement de comportement.
import { useState } from "react";
import { estimateServingGrams, isPieceInput } from "@/lib/food-engine";
import { MICRO_LABELS, MICRO_ORDER, type MicroKey } from "@/lib/micros";
import type { Food, WeightLog } from "@/lib/types";

export function cleanNumber(value: number) { return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 100) / 100; }

export function QuantityPicker({ value, onChange, food, unit, onUnitChange }: { value: number; onChange: (value: number) => void; food?: Food; unit?: "piece" | "g" | "cl"; onUnitChange?: (u: "piece" | "g" | "cl") => void }) {
  const controlled = unit !== undefined && onUnitChange !== undefined;
  const effUnit: "piece" | "g" | "cl" | "ml" = controlled ? unit! : (isPieceInput(food) ? "piece" : food?.unit === "ml" ? "ml" : "g");
  const isPiece = effUnit === "piece";
  const quickValues = isPiece ? [1, 2, 3, 4, 6, 10] : effUnit === "cl" ? [10, 15, 20, 25, 33, 50] : [25, 50, 75, 100, 150, 200, 250, 300, 500];
  const stepV = isPiece ? 1 : effUnit === "cl" ? 5 : 10;
  const pill = isPiece ? `${food?.servingLabel || "pièce"}(s)` : effUnit;
  const safeChange = (next: number) => onChange(Math.max(0, Math.round((Number.isFinite(next) ? next : 0) * 10) / 10));
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <div className="quantity-card">
    {controlled && <div className="unit-select"><span className="muted">Unité :</span>{(["piece", "g", "cl"] as const).map(u2 => <button key={u2} type="button" className={`filter-chip ${unit === u2 ? "active" : ""}`} onClick={() => onUnitChange!(u2)}>{u2 === "piece" ? "Pièce" : u2}</button>)}</div>}
    <div className="space"><label style={{margin:0}}>Quantité</label><span className="muted">{isPiece ? `1 ${food?.servingLabel || "pièce"} ≈ ${estimateServingGrams(food)} g` : "Base 100 g/ml, calcul ajusté"}</span></div>
    <div className="quantity-row">
      <button type="button" className="qty-btn" onClick={()=>safeChange(value - stepV)}>−</button>
      <input type="text" inputMode="decimal" value={focused ? text : String(value)} onFocus={e=>{ setFocused(true); setText(String(value)); e.currentTarget.select(); }} onBlur={()=>setFocused(false)} onChange={e=>{ const t=e.target.value; setText(t); if(t.trim()==="") return; const n=Number(t.replace(",",".")); if(Number.isFinite(n)) safeChange(n); }}/>
      <span className="unit-pill">{pill}</span>
      <button type="button" className="qty-btn" onClick={()=>safeChange(value + stepV)}>+</button>
    </div>
    <div className="quick-qty">{quickValues.map(q => <button type="button" key={q} className={value===q ? "active" : ""} onClick={()=>safeChange(q)}>{q}{isPiece ? "" : effUnit}</button>)}</div>
  </div>;
}

export function sourceLabel(food: Food) {
  if (food.source === "ciqual") return "Ciqual / Anses";
  if (food.source === "openfoodfacts") return "Open Food Facts";
  if (food.source === "manual") return "Base app";
  return "Estimé";
}
function sourceTone(food: Food) {
  if (food.source === "ciqual") return "ciqual";
  if (food.source === "openfoodfacts") return "off";
  if (food.reliability === "estime") return "estimated";
  return "manual";
}
function NutriScoreBadge({ grade }: { grade?: string }) {
  if (!grade || !/^[a-e]$/i.test(grade)) return null;
  return <span className={`nutri-badge nutri-${grade.toLowerCase()}`} title="Nutri-Score (qualité nutritionnelle, A = meilleur)">{grade.toUpperCase()}</span>;
}
function NovaBadge({ group }: { group?: number }) {
  if (!group || ![1, 2, 3, 4].includes(group)) return null;
  const labels: Record<number, string> = { 1: "Non transformé", 2: "Peu transformé", 3: "Transformé", 4: "Ultra-transformé" };
  return <span className={`nova-badge nova-${group}`} title={`NOVA ${group} · ${labels[group]}`}>NOVA {group}</span>;
}
function deaccent(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
export function foodIcon(food?: Food) {
  if (!food) return "🍽️";
  if (food.icon) return food.icon;
  const n = deaccent(food.name);
  const has = (re: RegExp) => re.test(n);

  // Compléments
  if (has(/whey|proteine|isolat|isolate|caseine|gainer|\bbcaa\b|\beaa\b|collagene/)) return "🥤";
  if (has(/creatine|pre ?workout|booster/)) return "⚡";
  if (has(/multivitamine|vitamine|magnesium|omega|complement/)) return "💊";
  if (has(/electrolyte/)) return "💧";

  // Œufs & produits laitiers
  if (has(/oeuf|œuf/)) return "🥚";
  if (has(/yaourt|yogourt|skyr|fromage blanc|petit suisse|fromage frais/)) return "🥛";
  if (has(/fromage|comte|emmental|camembert|\bbrie\b|chevre|mozzarella|parmesan|cheddar|feta|raclette|gruyere|gouda|roquefort|cantal/)) return "🧀";
  if (has(/\blait\b|creme fraiche|beurre/)) return "🥛";

  // Viandes, abats & charcuterie
  if (has(/abat|foie|rognon|tripe|\blangue\b|gesier|ris de|andouille|cervelle/)) return "🍖";
  if (has(/poulet|dinde|volaille|caille|pintade|tender/)) return "🍗";
  if (has(/boeuf|steak|bavette|entrecote|bifteck|veau|agneau|mouton|\bporc\b|jambon|lardon|saucisse|merguez|chorizo|salami|bacon|magret|canard|gigot|escalope|viande|hache/)) return "🥩";

  // Poissons & fruits de mer
  if (has(/saumon|thon|cabillaud|colin|merlu|truite|maquereau|sardine|hareng|\bsole\b|lieu|dorade|anchois|poisson|surimi|morue/)) return "🐟";
  if (has(/crevette|gambas|crabe|homard|langoustine|moule|huitre|coquille|calamar|poulpe|seiche|fruits de mer/)) return "🦐";
  if (has(/sushi|maki|sashimi/)) return "🍣";

  // Plats & féculents
  if (has(/pizza/)) return "🍕";
  if (has(/burger|hamburger/)) return "🍔";
  if (has(/sandwich|wrap|kebab|panini|hot ?dog/)) return "🥪";
  if (has(/pates|spaghetti|penne|tagliatelle|lasagne|raviol|macaroni|coquillette|nouille/)) return "🍝";
  if (has(/\briz\b|risotto|paella/)) return "🍚";
  if (has(/frite|pomme de terre|patate|puree/)) return "🍟";
  if (has(/\bpain\b|baguette|brioche|biscotte|pita|tortilla/)) return "🍞";
  if (has(/cereale|avoine|muesli|granola|flocon|boulgour|semoule|quinoa|couscous/)) return "🥣";

  // Fruits
  if (has(/banane/)) return "🍌";
  if (has(/pomme(?! de terre)/)) return "🍎";
  if (has(/poire/)) return "🍐";
  if (has(/orange|clementine|mandarine/)) return "🍊";
  if (has(/\blime\b|citron/)) return "🍋";
  if (has(/kiwi/)) return "🥝";
  if (has(/fraise/)) return "🍓";
  if (has(/framboise|myrtille|\bmure\b|cassis|groseille|fruits rouges/)) return "🫐";
  if (has(/raisin/)) return "🍇";
  if (has(/pasteque/)) return "🍉";
  if (has(/melon/)) return "🍈";
  if (has(/ananas/)) return "🍍";
  if (has(/mangue/)) return "🥭";
  if (has(/cerise/)) return "🍒";
  if (has(/peche|abricot|nectarine|brugnon/)) return "🍑";
  if (has(/avocat/)) return "🥑";

  // Légumes
  if (has(/tomate/)) return "🍅";
  if (has(/carotte/)) return "🥕";
  if (has(/\bmais\b/)) return "🌽";
  if (has(/champignon|cepe|girolle/)) return "🍄";
  if (has(/brocoli|\bchou\b|salade|laitue|epinard|courgette|poireau|haricot vert|poivron|aubergine|concombre|courge|navet|fenouil|asperge|artichaut|legume/)) return "🥦";
  if (has(/oignon|echalote/)) return "🧅";
  if (has(/lentille|pois chiche|haricot|\bfeve\b|legumineuse|flageolet|\bpois\b/)) return "🫘";

  // Noix, huiles, sucré & boissons
  if (has(/noix|amande|noisette|cajou|pistache|cacahuete|pignon/)) return "🥜";
  if (has(/huile|\bolive/)) return "🫒";
  if (has(/chocolat|cacao/)) return "🍫";
  if (has(/glace|sorbet|creme glacee/)) return "🍨";
  if (has(/gateau|\bcake\b|tarte|patisserie|crepe|gaufre|\bflan\b|mousse/)) return "🍰";
  if (has(/oreo|biscuit|cookie|sable|madeleine|barre/)) return "🍪";
  if (has(/bonbon|confiserie|nougat|caramel/)) return "🍬";
  if (has(/miel|confiture|sirop/)) return "🍯";
  if (has(/cafe|expresso|espresso/)) return "☕";
  if (has(/\bthe\b|infusion|tisane/)) return "🍵";
  if (has(/\bjus\b|smoothie|nectar/)) return "🧃";
  if (has(/soda|cola|limonade/)) return "🥤";
  if (has(/\beau\b|water/)) return "💧";
  if (has(/\bvin\b|champagne|rhum|whisky|cognac|vodka|aperitif/)) return "🍷";
  if (has(/biere|cidre/)) return "🍺";

  // Repli par rayon
  const c = deaccent(food.category);
  if (/fruit|legume/.test(c)) return "🥗";
  if (/viande|poisson|proteine/.test(c)) return "🍖";
  if (/laitier|cremerie/.test(c)) return "🥛";
  if (/cereale|pain/.test(c)) return "🍞";
  if (/complement/.test(c)) return "💊";
  if (/boisson/.test(c)) return "🥤";
  return "🍽️";
}
export function ProductResults({ foods, selectedId, onSelect }: { foods: Food[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!foods.length) return null;
  return <div className="product-results"><div className="result-title">Meilleurs résultats</div>{foods.map(f => <button type="button" key={f.id} className={`product-choice ${selectedId === f.id ? "active" : ""}`} onClick={() => onSelect(f.id)}><span className="mini-food-icon">{f.imageUrl ? <img src={f.imageUrl} alt=""/> : foodIcon(f)}</span><span className="product-choice-text"><strong>{f.name}</strong><small>{f.brand ? `${f.brand} · ` : ""}{f.macros.kcal} kcal/100g · {f.barcode ? `CB ${f.barcode} · ` : ""}{isPieceInput(f) ? `1 ${f.servingLabel || "portion"} ≈ ${estimateServingGrams(f)} g · ` : ""}{sourceLabel(f)}</small></span><span className={`source-badge ${sourceTone(f)}`}>{sourceLabel(f)}</span></button>)}</div>;
}
export function ProductCard({ food, qty, macros, isFavorite, onToggleFavorite }: { food: Food; qty: number; macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; grams: number }; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  const [nnInfo, setNnInfo] = useState(false);
  const portion = isPieceInput(food) ? `1 ${food.servingLabel || "pièce"} ≈ ${estimateServingGrams(food)} g` : "Valeurs pour 100 g/ml";
  const selected = isPieceInput(food) ? `${qty} ${qty > 1 ? `${food.servingLabel || "pièce"}s` : (food.servingLabel || "pièce")} ≈ ${macros.grams} g` : `${qty} ${food.unit}`;
  return <><div className="product-card"><div className="product-image" aria-hidden="true">{food.imageUrl ? <img src={food.imageUrl} alt=""/> : <span>{foodIcon(food)}</span>}</div><div className="product-info"><div className="product-topline"><span className={`source-badge ${sourceTone(food)}`}>{sourceLabel(food)}</span><span className={`source-badge ${food.reliability === "estime" ? "estimated" : "manual"}`}>{food.reliability}</span><NutriScoreBadge grade={food.nutriScore}/><NovaBadge group={food.novaGroup}/>{(food.nutriScore || food.novaGroup) ? <button type="button" className="info-link" onClick={()=>setNnInfo(true)} aria-label="Comprendre le Nutri-Score et le groupe NOVA">ⓘ</button> : null}{onToggleFavorite &&<button type="button" className={`fav-btn ${isFavorite ? "on" : ""}`} onClick={onToggleFavorite} aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}>{isFavorite ? "★" : "☆"}</button>}</div><h3>{food.name}</h3><p className="muted">{food.brand ? `Marque : ${food.brand} · ` : ""}{portion}{food.barcode ? ` · Code-barres : ${food.barcode}` : ""}</p><p className="product-selected">Sélection : <strong>{selected}</strong></p>{food.ingredientsText && <p className="ingredients-note"><strong>Ingrédients :</strong> {food.ingredientsText.length > 240 ? `${food.ingredientsText.slice(0, 240)}…` : food.ingredientsText}</p>}{food.sourceRef && <p className="product-source-note">{food.sourceRef}</p>}<div className="product-macros"><span>{macros.kcal} kcal</span><span>P {macros.protein}g</span><span>G {macros.carbs}g</span><span>L {macros.fat}g</span></div></div></div><NutriNovaInfoModal open={nnInfo} onClose={()=>setNnInfo(false)} grade={food.nutriScore} group={food.novaGroup}/></>;
}

export function MicroInline({ food }: { food: Food }) {
  const entries = MICRO_ORDER.filter(k => food.micros?.[k]).slice(0, 5);
  if (!entries.length) return <span className="muted">—</span>;
  return <div>{entries.map(k => <span className="tag" key={k}>{MICRO_LABELS[k].label} {cleanNumber(Number(food.micros?.[k] || 0))}{MICRO_LABELS[k].unit}</span>)}</div>;
}
export function MicroPanel({ title, micros, onInfo }: { title: string; micros: Partial<Record<MicroKey, number>>; onInfo?: (k: MicroKey) => void }) {
  const groups = ["Vitamines", "Minéraux", "Autres"] as const;
  const hasAny = MICRO_ORDER.some(k => Number(micros[k] || 0) > 0);
  if (!hasAny) return <div className="micro-panel"><strong>{title}</strong><p className="muted">Aucune donnée micro disponible pour cet aliment.</p></div>;
  return <div className="micro-panel"><strong>{title}</strong>{onInfo && <p className="form-help" style={{margin:"4px 0 0"}}>Touche un élément pour son rôle et l'apport conseillé.</p>}{groups.map(group => {
    const keys = MICRO_ORDER.filter(k => MICRO_LABELS[k].group === group && Number(micros[k] || 0) > 0);
    if (!keys.length) return null;
    return <div key={group} className="micro-group"><span className="micro-group-title">{group}</span><div className="micro-grid">{keys.map(k => {
      const info = MICRO_LABELS[k];
      const v = cleanNumber(Number(micros[k] || 0));
      const pct = info.rda ? Math.round((Number(micros[k] || 0) / info.rda) * 100) : 0;
      return <button key={k} type="button" className="micro-cell" onClick={() => onInfo?.(k)} disabled={!onInfo}><span>{info.label}{onInfo && <span className="info-i">i</span>}</span><strong>{v}{info.unit}<small>{info.limit ? `${pct}% max` : `${pct}% VNR`}</small></strong></button>;
    })}</div></div>;
  })}</div>;
}
export function ProgressRing({ value, max, color, top, bottom }: { value: number; max: number; color: string; top: string; bottom: string }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = C * (1 - pct);
  return (
    <svg viewBox="0 0 128 128" className="ring" role="img" aria-label={`${top} ${bottom}`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" className="ring-num">{top}</text>
      <text x="64" y="82" textAnchor="middle" className="ring-sub">{bottom}</text>
    </svg>
  );
}
export function MacroPie({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9;
  const tot = pK + cK + fK;
  const shares = tot > 0 ? [pK / tot, cK / tot, fK / tot] : [0, 0, 0];
  const colors = ["#2f6b2f", "#f3a52c", "#8a6bd1"];
  let acc = 0;
  const arcs = shares.map((s) => {
    const len = s * C;
    const off = -acc * C;
    acc += s;
    return { dash: `${len} ${C - len}`, off };
  });
  return (
    <svg viewBox="0 0 128 128" className="ring" role="img" aria-label="Répartition des macros">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="16" />
      {tot > 0 && arcs.map((a, i) => (
        <circle key={i} cx="64" cy="64" r={r} fill="none" stroke={colors[i]} strokeWidth="16" strokeDasharray={a.dash} strokeDashoffset={a.off} transform="rotate(-90 64 64)" />
      ))}
      <text x="64" y="68" textAnchor="middle" className="ring-sub">{tot > 0 ? "P · G · L" : "—"}</text>
    </svg>
  );
}
export function bmiCategory(bmi: number): { label: string; tone: string } {
  if (bmi < 18.5) return { label: "Maigreur", tone: "warn" };
  if (bmi < 25) return { label: "Corpulence normale", tone: "" };
  if (bmi < 30) return { label: "Surpoids", tone: "warn" };
  return { label: "Obésité", tone: "bad" };
}
export function BmiInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>L&apos;IMC (indice de masse corporelle)</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">L&apos;IMC = poids (kg) ÷ taille² (m). C&apos;est un repère <strong>simple et rapide</strong> pour situer ta corpulence : maigreur (&lt; 18,5), normal (18,5–25), surpoids (25–30), obésité (&gt; 30).</p>
        <div className="macro-info-type"><strong>À quoi ça sert</strong><span>Un premier indicateur du risque lié au poids, facile à calculer et utile pour un suivi grossier dans le temps.</span></div>
        <div className="macro-info-type"><strong>Ses limites</strong><span>Il ne distingue PAS le muscle de la graisse : une personne musclée peut être classée « surpoids » sans excès de gras. Il ignore aussi la répartition des graisses, l&apos;âge, le sexe et l&apos;origine. Ce n&apos;est pas un diagnostic.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Si tu fais du sport, le <strong>taux de masse grasse</strong> (estimable dans ton profil) et le <strong>tour de taille</strong> sont bien plus parlants que l&apos;IMC seul.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Source : classification de l&apos;OMS (Organisation mondiale de la Santé).</p>
      </div>
    </div>
  );
}
function NutriNovaInfoModal({ open, onClose, grade, group }: { open: boolean; onClose: () => void; grade?: string; group?: number }) {
  if (!open) return null;
  const novaLabels: Record<number, string> = { 1: "Non transformé ou minimalement transformé", 2: "Ingrédient culinaire transformé", 3: "Aliment transformé", 4: "Aliment ultra-transformé" };
  const g = grade && /^[a-e]$/i.test(grade) ? grade.toUpperCase() : null;
  const n = group && [1, 2, 3, 4].includes(group) ? group : null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Nutri-Score &amp; NOVA</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>

        <div className="macro-info-type"><strong>Nutri-Score{g ? ` · ce produit :${g}` : ""}</strong><span>Une note de <strong>A (meilleur) à E</strong> qui résume la qualité nutritionnelle pour 100 g/mL. Elle compare les éléments <strong>favorables</strong> (fibres, protéines, fruits/légumes) aux éléments à <strong>limiter</strong> (calories, sucres, acides gras saturés, sel). C&apos;est un repère de comparaison entre produits d&apos;une même catégorie, pas un feu vert/rouge absolu.</span></div>

        <div className="macro-info-type"><strong>Groupe NOVA{n ? ` · ce produit :${n} (${novaLabels[n]})` : ""}</strong><span>Classe les aliments selon leur <strong>degré de transformation</strong> :<br/>1 = brut ou peu transformé (fruit, œuf, viande) · 2 = ingrédient culinaire (huile, sel) · 3 = transformé (conserve, pain, fromage) · <strong>4 = ultra-transformé</strong> (additifs, arômes, préparations industrielles). Un NOVA élevé n&apos;est pas « interdit », mais une alimentation riche en ultra-transformés est associée à de moins bons résultats de santé.</span></div>

        <p className="notice" style={{ marginTop: 12 }}>Ces deux indicateurs sont <strong>complémentaires</strong> : le Nutri-Score juge la composition nutritionnelle, NOVA le degré de transformation. Un produit peut avoir un bon Nutri-Score tout en étant ultra-transformé.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Nutri-Score : Santé publique France (modèle de profilage nutritionnel FSA/Ofcom). NOVA : Monteiro CA et al., « Ultra-processed foods: what they are and how to identify them », Public Health Nutrition, 2019. Données produits : Open Food Facts.</p>
      </div>
    </div>
  );
}
export function CaloriesInfoModal({ open, onClose, targetKcal, manual }: { open: boolean; onClose: () => void; targetKcal: number; manual: boolean }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Comment tes calories/jour sont calculées</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        {targetKcal > 0 && <p className="macro-info-kcal" style={{ color: "var(--primary)" }}>Ta cible actuelle : {targetKcal} kcal/jour{manual ? " (fixée manuellement)" : ""}</p>}
        {manual
          ? <p className="macro-info-intro">Tu as <strong>fixé toi-même</strong> ta cible calorique dans ton profil : l&apos;app l&apos;utilise telle quelle et en déduit tes macros. Vide ce champ pour revenir au calcul automatique décrit ci-dessous.</p>
          : <p className="macro-info-intro">Ta cible est calculée en <strong>trois temps</strong>, à partir de ton profil :</p>}
        <div className="macro-info-type"><strong>1. Métabolisme de base</strong><span>Les calories brûlées au repos, estimées par l&apos;équation de <strong>Mifflin-St Jeor</strong> (ou <strong>Katch-McArdle</strong> si ta masse grasse est renseignée). Voir l&apos;info « Métabolisme de base » dans ton profil pour le détail des formules.</span></div>
        <div className="macro-info-type"><strong>2. × ton niveau d&apos;activité</strong><span>On multiplie par un facteur d&apos;activité (sédentaire ≈ 1,2 · léger ≈ 1,375 · modéré ≈ 1,55 · élevé ≈ 1,725 · très élevé ≈ 1,9) pour obtenir ta <strong>dépense énergétique totale</strong> (TDEE).</span></div>
        <div className="macro-info-type"><strong>3. Ajustement selon l&apos;objectif</strong><span>Perte de poids : −20 % · Sèche : −15 % (plus doux pour préserver le muscle) · Maintien : 0 % · Prise de masse : +10 %.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Un <strong>plancher de sécurité</strong> empêche de descendre sous ton métabolisme de base, ni sous 1700 kcal (homme) / 1500 kcal (femme). Et tu peux toujours imposer ta propre valeur dans le profil (« Calories/jour »).</p>
        <p className="notice" style={{ marginTop: 8 }}>Ce sont des <strong>estimations</strong> : la dépense réelle varie d&apos;une personne à l&apos;autre. Le plus fiable reste d&apos;ajuster sur 2-3 semaines selon l&apos;évolution de ton poids.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Mifflin MD &amp; St Jeor ST et al., Am J Clin Nutr, 1990 (métabolisme de base) ; FAO/WHO/UNU, « Human energy requirements », 2004 (niveaux d&apos;activité) ; Helms et al., 2014 et position de l&apos;ISSN (Jäger et al., 2017) pour un déficit préservant la masse musculaire.</p>
      </div>
    </div>
  );
}
export function MetabolismInfoModal({ open, onClose, sex }: { open: boolean; onClose: () => void; sex: "homme" | "femme" }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>Le métabolisme de base</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">Le <strong>métabolisme de base</strong> (MB) correspond aux calories que ton corps dépense au repos complet sur 24 h, juste pour se maintenir en vie (cœur, respiration, cerveau, température…). C&apos;est la base à partir de laquelle on ajoute ton activité pour obtenir ta dépense totale.</p>
        <div className="macro-info-type"><strong>Comment l&apos;app le calcule</strong><span>Par défaut avec l&apos;équation de <strong>Mifflin-St Jeor</strong> (la plus fiable sans mesure) :<br/>Homme : 10 × poids(kg) + 6,25 × taille(cm) − 5 × âge + 5<br/>Femme : 10 × poids(kg) + 6,25 × taille(cm) − 5 × âge − 161{sex === "femme" ? " (ta formule)" : " (l'autre)"}</span></div>
        <div className="macro-info-type"><strong>Si ta masse grasse est renseignée</strong><span>L&apos;app utilise alors <strong>Katch-McArdle</strong>, basée sur la masse maigre : MB = 370 + 21,6 × masse maigre(kg). Plus précis pour les personnes sportives.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Tu connais ta valeur (mesurée en calorimétrie, ou donnée par une balance/montre) ? Renseigne-la dans le champ « Métabolisme de base » du profil, l&apos;app l&apos;utilisera à la place de l&apos;estimation.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : Mifflin MD &amp; St Jeor ST et al., « A new predictive equation for resting energy expenditure », Am J Clin Nutr, 1990 ; Katch &amp; McArdle, Exercise Physiology (masse maigre).</p>
      </div>
    </div>
  );
}
export function HydrationInfoModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: number }) {
  if (!open) return null;
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>💧 L&apos;objectif d&apos;hydratation</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-intro">Ton objectif est estimé à environ <strong>35 mL d&apos;eau par kg de poids de corps</strong> et par jour (avec un minimum de 1,5 L), soit ta cible actuelle de <strong>{(goal / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} L</strong>.</p>
        <div className="macro-info-type"><strong>D&apos;où vient ce repère</strong><span>Les autorités de santé situent les besoins hydriques autour de <strong>2,0 L/jour pour les femmes</strong> et <strong>2,5 L/jour pour les hommes</strong> (eau des boissons). La règle des ~30 à 40 mL/kg est un repère clinique courant, adapté à ton poids.</span></div>
        <p className="notice" style={{ marginTop: 12 }}>Ce n&apos;est qu&apos;un repère : tes besoins montent avec la chaleur, l&apos;effort et la transpiration. Une partie de l&apos;eau vient aussi des aliments. Fie-toi aussi à ta soif et à la couleur de tes urines.</p>
        <p className="form-help" style={{ marginTop: 10 }}>Sources : EFSA, Scientific Opinion on Dietary Reference Values for water, EFSA Journal 2010 ; National Academies (IOM), Dietary Reference Intakes for Water, 2005.</p>
      </div>
    </div>
  );
}
export function MicroDetailModal({ micro, onClose }: { micro: MicroKey | null; onClose: () => void }) {
  if (!micro) return null;
  const info = MICRO_LABELS[micro];
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head"><h2>{info.label}</h2><button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p className="macro-info-kcal" style={{ color: "var(--primary)" }}>{info.limit ? "Maximum conseillé" : "Apport de référence"} : {info.rda} {info.unit}/jour</p>
        <p className="macro-info-intro">{info.role}</p>
        <div className="macro-info-type"><strong>Où en trouver</strong><span>{info.sources}</span></div>
        <p className="notice" style={{ marginTop: 12 }}>{info.limit ? "Il s'agit d'un maximum : l'objectif est de rester en dessous." : "Valeur de référence adulte (EFSA / UE, proche des recommandations OMS). Les besoins varient selon l'âge, le sexe et l'activité."}</p>
        <p className="form-help" style={{ marginTop: 10 }}>Source : valeurs nutritionnelles de référence EFSA / UE ; recommandations OMS pour le sel et les sucres.</p>
      </div>
    </div>
  );
}
export function HistoryChart({ points, target }: { points: { kcal: number; label: string }[]; target?: number }) {
  if (points.length < 2) return <div className="chart row" style={{ justifyContent: "center" }}>Pas encore assez de données pour tracer une courbe.</div>;
  const values = points.map(p => p.kcal);
  const maxV = Math.max(target || 0, ...values, 1);
  const range = Math.max(1, maxV);
  const y = (v: number) => 100 - (v / range) * 90 - 5;
  const line = points.map((p, i) => `${(i / (points.length - 1)) * 100},${y(p.kcal)}`).join(" ");
  const targetY = target ? y(target) : null;
  return (
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      {targetY !== null && <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.45" />}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export function TdeeSparkline({ points }: { points: { label: string; tdee: number }[] }) {
  if (points.length < 2) return null;
  const vals = points.map(p => p.tdee);
  const min = Math.min(...vals); const max = Math.max(...vals); const range = Math.max(1, max - min);
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * 100},${100 - ((p.tdee - min) / range) * 80 - 10}`).join(" ");
  return <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height: 60 }}><polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" /></svg>;
}

export function WeightChart({ weights, targetWeightKg, targetDate, trendPerWeek }: { weights: WeightLog[]; targetWeightKg?: number; targetDate?: string; trendPerWeek?: number | null }) {
  const data = [...weights].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  if(data.length < 2) return <div className="chart row" style={{justifyContent:"center"}}>Ajoute au moins 2 pesées</div>;
  const DAY = 86400000;
  const t = (s: string) => new Date(s + "T00:00:00").getTime();
  const last = data[data.length - 1];
  const t0 = t(data[0].date); const lastT = t(last.date);
  // Point de projection : soit vers l'objectif (poids + date), soit extrapolation de la tendance sur 4 semaines.
  let projEnd: { time: number; w: number } | null = null;
  if (targetWeightKg && targetWeightKg > 0 && targetDate && t(targetDate) > lastT) {
    projEnd = { time: t(targetDate), w: targetWeightKg };
  } else if (trendPerWeek != null && Math.abs(trendPerWeek) > 0.02) {
    projEnd = { time: lastT + 28 * DAY, w: Math.round((last.weightKg + trendPerWeek * 4) * 10) / 10 };
  }
  const tEnd = projEnd ? Math.max(lastT, projEnd.time) : lastT;
  const spanT = Math.max(1, tEnd - t0);
  const allW = data.map(d => d.weightKg);
  if (projEnd) allW.push(projEnd.w);
  if (targetWeightKg && targetWeightKg > 0) allW.push(targetWeightKg);
  const min = Math.min(...allW); const max = Math.max(...allW); const range = Math.max(1, max - min);
  const x = (time: number) => ((time - t0) / spanT) * 100;
  const y = (w: number) => 100 - ((w - min) / range) * 90 - 5;
  const pts = data.map(d => `${x(t(d.date))},${y(d.weightKg)}`).join(" ");
  const projPts = projEnd ? `${x(lastT)},${y(last.weightKg)} ${x(projEnd.time)},${y(projEnd.w)}` : null;
  const targetY = (targetWeightKg && targetWeightKg > 0) ? y(targetWeightKg) : null;
  return (
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      {targetY != null && <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 2" opacity="0.35" />}
      {projPts && <polyline points={projPts} fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" opacity="0.55" />}
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
