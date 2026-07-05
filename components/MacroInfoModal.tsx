"use client";

export type MacroKind = "protein" | "carbs" | "fat";

const CONTENT: Record<MacroKind, { title: string; color: string; kcal: string; intro: string; types: { name: string; desc: string }[]; tip: string; refs: string }> = {
  protein: {
    title: "Protéines",
    color: "#2f6b2f",
    kcal: "4 kcal / g",
    intro: "Elles construisent et réparent les muscles, la peau, les cheveux et fabriquent enzymes et hormones. C'est le macro clé pour progresser et garder du muscle, surtout en sèche.",
    types: [
      { name: "Animales (complètes)", desc: "Viande, poisson, œufs, produits laitiers, whey : ils contiennent tous les acides aminés essentiels." },
      { name: "Végétales", desc: "Légumineuses, tofu, céréales : souvent incomplètes seules, à combiner (ex. riz + lentilles)." },
    ],
    tip: "Repère : 1,6 à 2,2 g par kg de poids de corps (c'est l'unité des études de référence). Si ton taux de masse grasse est élevé, raisonne plutôt par kg de masse maigre, soit ≈ 2,3 à 3,1 g/kg de masse maigre.",
    refs: "Morton et al., 2018 (méta-analyse, Br J Sports Med) ; position de l'ISSN, Jäger et al., 2017 ; Helms et al., 2014 (recommandations par masse maigre).",
  },
  carbs: {
    title: "Glucides",
    color: "#f3a52c",
    kcal: "4 kcal / g",
    intro: "Le carburant principal du corps et du cerveau, surtout à l'effort. Ce sont eux qu'on augmente quand on veut prendre de la masse.",
    types: [
      { name: "Simples (rapides)", desc: "Fruits, miel, sucre, sodas : énergie immédiate, à limiter sous forme raffinée." },
      { name: "Complexes (amidon)", desc: "Riz, pâtes, pain, pomme de terre, avoine : énergie durable." },
      { name: "Fibres", desc: "Légumes, légumineuses, produits complets : digestion, satiété, glycémie stable." },
    ],
    tip: "Privilégie les complexes et les fibres autour de tes entraînements.",
    refs: "Position de l'ISSN sur la nutrition du sport (Kerksick et al., 2018) ; recommandations OMS/EFSA sur les fibres (≈ 25–30 g/jour).",
  },
  fat: {
    title: "Lipides",
    color: "#8a6bd1",
    kcal: "9 kcal / g",
    intro: "Indispensables aux hormones, au cerveau et à l'absorption des vitamines A, D, E et K. Très caloriques, donc à doser, mais jamais à supprimer.",
    types: [
      { name: "Insaturés (à privilégier)", desc: "Huile d'olive, avocat, noix, poissons gras (oméga-3) : protecteurs cœur/cerveau." },
      { name: "Saturés (avec modération)", desc: "Beurre, viandes grasses, fromage, huile de coco." },
      { name: "Trans (à éviter)", desc: "Produits ultra-transformés, fritures industrielles." },
    ],
    tip: "Repère : environ 0,8 à 1 g par kg, jamais sous 0,6 g/kg (hormones).",
    refs: "Apports de référence EFSA ; un minimum d'environ 0,6–0,8 g/kg est conseillé pour préserver la fonction hormonale (revues en nutrition du sport, ex. Helms et al., 2014).",
  },
};

const CONTENT_ES: Record<MacroKind, { title: string; color: string; kcal: string; intro: string; types: { name: string; desc: string }[]; tip: string; refs: string }> = {
  protein: {
    title: "Proteínas",
    color: "#2f6b2f",
    kcal: "4 kcal / g",
    intro: "Construyen y reparan los músculos, la piel y el cabello, y fabrican enzimas y hormonas. Es el macro clave para progresar y mantener músculo, sobre todo en definición.",
    types: [
      { name: "Animales (completas)", desc: "Carne, pescado, huevos, lácteos, whey: contienen todos los aminoácidos esenciales." },
      { name: "Vegetales", desc: "Legumbres, tofu, cereales: a menudo incompletas por sí solas, conviene combinarlas (ej. arroz + lentejas)." },
    ],
    tip: "Referencia: 1,6 a 2,2 g por kg de peso corporal (es la unidad de los estudios de referencia). Si tu porcentaje de grasa es alto, calcula mejor por kg de masa magra, es decir ≈ 2,3 a 3,1 g/kg de masa magra.",
    refs: "Morton et al., 2018 (metaanálisis, Br J Sports Med); posición de la ISSN, Jäger et al., 2017; Helms et al., 2014 (recomendaciones por masa magra).",
  },
  carbs: {
    title: "Carbohidratos",
    color: "#f3a52c",
    kcal: "4 kcal / g",
    intro: "El combustible principal del cuerpo y del cerebro, sobre todo al hacer ejercicio. Son los que se aumentan cuando se busca ganar volumen.",
    types: [
      { name: "Simples (rápidos)", desc: "Frutas, miel, azúcar, refrescos: energía inmediata, a limitar en forma refinada." },
      { name: "Complejos (almidón)", desc: "Arroz, pasta, pan, patata, avena: energía duradera." },
      { name: "Fibra", desc: "Verduras, legumbres, productos integrales: digestión, saciedad, glucemia estable." },
    ],
    tip: "Prioriza los complejos y la fibra alrededor de tus entrenamientos.",
    refs: "Posición de la ISSN sobre nutrición deportiva (Kerksick et al., 2018); recomendaciones OMS/EFSA sobre la fibra (≈ 25–30 g/día).",
  },
  fat: {
    title: "Grasas",
    color: "#8a6bd1",
    kcal: "9 kcal / g",
    intro: "Indispensables para las hormonas, el cerebro y la absorción de las vitaminas A, D, E y K. Muy calóricas, hay que dosificarlas, pero nunca eliminarlas.",
    types: [
      { name: "Insaturadas (a priorizar)", desc: "Aceite de oliva, aguacate, frutos secos, pescado azul (omega-3): protectores para corazón y cerebro." },
      { name: "Saturadas (con moderación)", desc: "Mantequilla, carnes grasas, queso, aceite de coco." },
      { name: "Trans (a evitar)", desc: "Productos ultraprocesados, fritos industriales." },
    ],
    tip: "Referencia: entre 0,8 y 1 g por kg, nunca por debajo de 0,6 g/kg (hormonas).",
    refs: "Valores de referencia EFSA; se aconseja un mínimo de ≈ 0,6–0,8 g/kg para preservar la función hormonal (revisiones de nutrición deportiva, ej. Helms et al., 2014).",
  },
};

export default function MacroInfoModal({ macro, onClose, lang = "fr" }: { macro: MacroKind | null; onClose: () => void; lang?: string }) {
  if (!macro) return null;
  const c = (lang === "es" ? CONTENT_ES : CONTENT)[macro];
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
        <p className="form-help" style={{ marginTop: 10 }}>{lang === "es" ? "Fuentes: " : "Sources : "}{c.refs}</p>
      </div>
    </div>
  );
}
