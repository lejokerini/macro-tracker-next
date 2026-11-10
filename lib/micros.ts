// Micronutriments suivis par l'app : libellés, unités, apports de référence et rôle.
export type MicroKey = "sugars" | "salt" | "calcium" | "iron" | "magnesium" | "potassium" | "sodium" | "zinc" | "vitA" | "vitD" | "vitE" | "vitC" | "vitB1" | "vitB2" | "vitB3" | "vitB6" | "vitB9" | "vitB12";

export type MicroInfo = { label: string; unit: string; group: "Vitamines" | "Minéraux" | "Autres"; rda: number; limit?: boolean; role: string; sources: string };
// rda = apport de référence adulte (valeurs de référence EFSA/UE, proches des recommandations OMS).
// limit = il s'agit d'un maximum à ne pas dépasser plutôt que d'une cible.
export const MICRO_LABELS: Record<MicroKey, MicroInfo> = {
  sugars: { label: "Sucres", unit: "g", group: "Autres", rda: 50, limit: true, role: "Glucides simples, source d'énergie rapide. En excès (surtout sucres ajoutés), favorisent la prise de poids, les caries et les pics de glycémie.", sources: "Sodas, jus, confiseries, pâtisseries, fruits." },
  salt: { label: "Sel", unit: "g", group: "Autres", rda: 5, limit: true, role: "Apporte le sodium. En excès, augmente la tension artérielle et le risque cardiovasculaire. L'OMS recommande moins de 5 g/jour.", sources: "Plats préparés, charcuterie, pain, fromage, snacks." },
  calcium: { label: "Calcium", unit: "mg", group: "Minéraux", rda: 1000, role: "Construction des os et des dents, contraction musculaire, coagulation et transmission nerveuse.", sources: "Produits laitiers, légumes verts, amandes, eaux calciques." },
  iron: { label: "Fer", unit: "mg", group: "Minéraux", rda: 14, role: "Transport de l'oxygène dans le sang (hémoglobine) et production d'énergie. Un manque cause fatigue et anémie.", sources: "Viande rouge, boudin, légumineuses, épinards." },
  magnesium: { label: "Magnésium", unit: "mg", group: "Minéraux", rda: 375, role: "Fonction musculaire et nerveuse, production d'énergie, réduit la fatigue. Souvent insuffisant.", sources: "Chocolat noir, oléagineux, céréales complètes, légumineuses." },
  potassium: { label: "Potassium", unit: "mg", group: "Minéraux", rda: 3500, role: "Équilibre hydrique, régulation de la tension, fonction musculaire et nerveuse. Contrebalance le sodium.", sources: "Banane, pomme de terre, légumineuses, légumes." },
  sodium: { label: "Sodium", unit: "mg", group: "Minéraux", rda: 2000, limit: true, role: "Équilibre hydrique et influx nerveux. Vient surtout du sel ; à limiter pour la tension.", sources: "Sel, plats préparés, charcuterie, fromage." },
  zinc: { label: "Zinc", unit: "mg", group: "Minéraux", rda: 10, role: "Immunité, cicatrisation, synthèse des protéines, fertilité et testostérone.", sources: "Viande, fruits de mer (huîtres), graines, légumineuses." },
  vitA: { label: "Vit. A", unit: "µg", group: "Vitamines", rda: 800, role: "Vision (surtout nocturne), santé de la peau et des muqueuses, immunité.", sources: "Foie, œufs, beurre, carotte et patate douce (béta-carotène)." },
  vitD: { label: "Vit. D", unit: "µg", group: "Vitamines", rda: 15, role: "Fixation du calcium sur les os, immunité, humeur. Très souvent déficitaire en hiver.", sources: "Poissons gras, jaune d'œuf, exposition au soleil." },
  vitE: { label: "Vit. E", unit: "mg", group: "Vitamines", rda: 12, role: "Antioxydant : protège les cellules du vieillissement et les membranes.", sources: "Huiles végétales, oléagineux, avocat." },
  vitC: { label: "Vit. C", unit: "mg", group: "Vitamines", rda: 80, role: "Immunité, antioxydant, formation du collagène, et améliore l'absorption du fer végétal.", sources: "Agrumes, kiwi, poivron, fruits rouges, persil." },
  vitB1: { label: "B1", unit: "mg", group: "Vitamines", rda: 1.1, role: "Transforme les glucides en énergie ; essentielle au système nerveux.", sources: "Céréales complètes, porc, légumineuses." },
  vitB2: { label: "B2", unit: "mg", group: "Vitamines", rda: 1.4, role: "Production d'énergie, santé de la peau, des yeux et des muqueuses.", sources: "Produits laitiers, œufs, abats, amandes." },
  vitB3: { label: "B3", unit: "mg", group: "Vitamines", rda: 16, role: "Métabolisme énergétique, peau et système nerveux.", sources: "Viande, poisson, céréales, cacahuètes." },
  vitB6: { label: "B6", unit: "mg", group: "Vitamines", rda: 1.4, role: "Métabolisme des protéines et fabrication des neurotransmetteurs (humeur).", sources: "Viande, poisson, banane, pomme de terre." },
  vitB9: { label: "B9", unit: "µg", group: "Vitamines", rda: 330, role: "Renouvellement cellulaire et formation du sang. Cruciale avant et pendant la grossesse.", sources: "Légumes verts à feuilles, légumineuses, foie." },
  vitB12: { label: "B12", unit: "µg", group: "Vitamines", rda: 2.5, role: "Formation des globules rouges et fonctionnement du système nerveux. Absente des végétaux : à supplémenter si vegan.", sources: "Viande, poisson, œufs, produits laitiers." },
};
export const MICRO_ORDER = Object.keys(MICRO_LABELS) as MicroKey[];
