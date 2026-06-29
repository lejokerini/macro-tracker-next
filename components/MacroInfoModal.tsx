"use client";

export type MacroKind = "protein" | "carbs" | "fat";

const CONTENT: Record<MacroKind, { title: string; color: string; kcal: string; intro: string; types: { name: string; desc: string }[]; tip: string }> = {
  protein: {
    title: "Protéines",
    color: "#2f6b2f",
    kcal: "4 kcal / g",
    intro: "Elles construisent et réparent les muscles, la peau, les cheveux et fabriquent enzymes et hormones. C'est le macro clé pour progresser et garder du muscle, surtout en sèche.",
    types: [
      { name: "Animales (complètes)", desc: "Viande, poisson, œufs, produits laitiers, whey — contiennent tous les acides aminés essentiels." },
      { name: "Végétales", desc: "Légumineuses, tofu, céréales — souvent incomplètes seules, à combiner (ex. riz + lentilles)." },
    ],
    tip: "Repère : 1,6 à 2,2 g par kg de poids de corps.",
  },
  carbs: {
    title: "Glucides",
    color: "#f3a52c",
    kcal: "4 kcal / g",
    intro: "Le carburant principal du corps et du cerveau, surtout à l'effort. Ce sont eux qu'on augmente quand on veut prendre de la masse.",
    types: [
      { name: "Simples (rapides)", desc: "Fruits, miel, sucre, sodas — énergie immédiate ; à limiter sous forme raffinée." },
      { name: "Complexes (amidon)", desc: "Riz, pâtes, pain, pomme de terre, avoine — énergie durable." },
      { name: "Fibres", desc: "Légumes, légumineuses, produits complets — digestion, satiété, glycémie stable." },
    ],
    tip: "Privilégie les complexes et les fibres autour de tes entraînements.",
  },
  fat: {
    title: "Lipides",
    color: "#8a6bd1",
    kcal: "9 kcal / g",
    intro: "Indispensables aux hormones, au cerveau et à l'absorption des vitamines A, D, E et K. Très caloriques, donc à doser — mais jamais à supprimer.",
    types: [
      { name: "Insaturés (à privilégier)", desc: "Huile d'olive, avocat, noix, poissons gras (oméga-3) — protecteurs cœur/cerveau." },
      { name: "Saturés (avec modération)", desc: "Beurre, viandes grasses, fromage, huile de coco." },
      { name: "Trans (à éviter)", desc: "Produits ultra-transformés, fritures industrielles." },
    ],
    tip: "Repère : environ 0,8 à 1 g par kg, jamais sous 0,6 g/kg (hormones).",
  },
};

export default function MacroInfoModal({ macro, onClose }: { macro: MacroKind | null; onClose: () => void }) {
  if (!macro) return null;
  const c = CONTENT[macro];
  return (
    <div className="snap-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <h2><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.title}</h2>
          <button className="snap-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <p className="macro-info-kcal" style={{ color: c.color }}>{c.kcal}</p>
        <p className="macro-info-intro">{c.intro}</p>
        <div className="macro-info-types">
          {c.types.map((t) => (
            <div className="macro-info-type" key={t.name}>
              <strong>{t.name}</strong>
              <span>{t.desc}</span>
            </div>
          ))}
        </div>
        <p className="notice">{c.tip}</p>
      </div>
    </div>
  );
}
