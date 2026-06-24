import { rawFoods } from "@/data/raw-foods";
import { ciqualFoods } from "@/data/ciqual-foods.generated";
import type { DietType, Food, Store } from "@/lib/types";

export const STORES: Record<Store, { label: string; factor: number }> = {
  leclerc: { label: "E.Leclerc", factor: 0.92 },
  intermarche: { label: "Intermarché", factor: 1.0 },
  carrefour: { label: "Carrefour", factor: 1.06 },
  auchan: { label: "Auchan", factor: 1.03 },
  lidl: { label: "Lidl", factor: 0.84 },
  aldi: { label: "Aldi", factor: 0.82 },
  monoprix: { label: "Monoprix", factor: 1.28 },
};

const CATEGORY_BASE_PRICE: Record<string, number> = {
  "Céréales & Pain": 3.0,
  "Fruits & Légumes": 3.8,
  "Viandes, Poissons & Protéines": 13.5,
  "Produits Laitiers & Crèmerie": 7.0,
  "Épicerie, Huiles & Condiments": 6.0,
  "Plaisirs, Surgelés & Divers": 8.0,
  "Compléments alimentaires": 28.0,
};

const PRICE_OVERRIDES: Record<string, number> = {
  "Riz basmati": 2.4, "Riz complet": 2.7, "Pâtes spaghetti": 1.8, "Pâtes penne": 1.8, "Semoule de blé": 1.9,
  "Flocons d'avoine": 2.0, "Baguette": 3.2, "Pain complet": 4.2, "Pain de mie": 2.9,
  "Banane": 1.9, "Pomme Golden": 2.6, "Pomme Gala": 2.8, "Orange": 2.3, "Carotte": 1.7, "Pomme de terre cuite": 1.7,
  "Blanc de poulet": 10.5, "Poulet blanc grillé": 12.0, "Œufs": 4.2, "Œuf entier (cru / référence)": 4.2,
  "Steak haché": 11.5, "Thon en boîte": 12.5, "Saumon pavé": 22, "Cabillaud": 17, "Tofu ferme": 8.5,
  "Lait demi-écrémé": 1.15, "Fromage blanc": 2.7, "Skyr": 4.8, "Yaourt grec": 4.5, "Yaourt au sucre": 2.6,
  "Oreo Original": 9.5, "Tenders de poulet": 13.5,
  "Whey protéine concentrée": 23.0, "Whey isolate": 32.0, "Créatine monohydrate": 34.0, "Caséine micellaire": 28.0,
  "Huile d'olive": 8.5, "Amandes": 12, "Noix": 11, "Miel": 8, "Chocolat noir": 11,
};

function stripEmoji(cat: string) { return cat.replace(/^[^\p{L}\p{N}]+\s*/u, "").trim(); }
export function normalizeFoodText(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

export function inferAllergens(name: string): string[] {
  const n = normalizeFoodText(name); const a = new Set<string>();
  if (/pain|pate|pates|spaghetti|penne|tagliatelles|coquillettes|farfalle|lasagne|semoule|boulgour|ble|farine|biscotte|croissant|brioche|chapelure|crouton|tortilla de ble|seitan|orge|epeautre|pain/.test(n)) a.add("gluten");
  if (/lait|beurre|yaourt|fromage|creme|emmental|comte|camembert|brie|chevre|mozzarella|parmesan|roquefort|cantal|reblochon|raclette|ricotta|mascarpone|feta|cheddar|gorgonzola|morbier|skyr/.test(n)) a.add("lait");
  if (/oeuf|œuf|mayonnaise/.test(n)) a.add("oeufs");
  if (/tofu|tempeh|soja|miso|edamame/.test(n)) a.add("soja");
  if (/amande|noisette|noix|pistache|pecan|cajou|bresil|pignon|chataigne/.test(n)) a.add("fruits_a_coque");
  if (/saumon|thon|cabillaud|colin|truite|maquereau|sardine|hareng|merlu|sole|raie|surimi|anchois|poisson/.test(n)) a.add("poisson");
  if (/crevette|gambas|langoustine|crabe|homard|langouste/.test(n)) a.add("crustaces");
  if (/moule|huitre|calamar|poulpe|saint-jacques|escargot/.test(n)) a.add("mollusques");
  if (/sesame|tahini/.test(n)) a.add("sesame");
  if (/moutarde/.test(n)) a.add("moutarde");
  if (/celeri/.test(n)) a.add("celeri");
  if (/vin|champagne|biere|cidre|rhum|cognac|whisky|armagnac|calvados/.test(n)) a.add("alcool");
  return [...a];
}

export function inferDiets(name: string): DietType[] {
  const n = normalizeFoodText(name); const all: DietType[] = ["omnivore", "flexitarien", "sans_porc"];
  const pork = /porc|jambon|lardon|saucisson|chorizo|andouillette|pate|rillettes/.test(n);
  const meat = /poulet|dinde|canard|boeuf|bœuf|steak|porc|jambon|agneau|veau|lapin|boudin|tripes|foie|saucisse|merguez|lardon|chorizo|pate|rillettes/.test(n);
  const fish = /saumon|thon|cabillaud|colin|truite|maquereau|sardine|hareng|merlu|sole|raie|crevette|gambas|moule|huitre|calamar|poulpe|crabe|homard|surimi|anchois|poisson/.test(n);
  const animalDairyEgg = /lait|beurre|yaourt|fromage|creme|oeuf|œuf|miel/.test(n);
  if (!pork) all.push("pescetarien");
  if (!pork && !meat && !fish) all.push("vegetarien");
  if (!pork && !meat && !fish && !animalDairyEgg) all.push("vegan");
  return [...new Set(all)];
}

function inferState(name: string): Food["state"] { const n=normalizeFoodText(name); if(/cuit|cuite|cuites|grille|grillee|surgel/.test(n)) return "cuit"; if(/boite|conserve|egoutte/.test(n)) return "egoutte"; if(/pizza|quiche|sauce|soupe|gaspacho|taboule|prepare/.test(n)) return "prepare"; return "standard"; }
function inferUnit(name: string): Food["unit"] { const n=normalizeFoodText(name); if(/lait|jus|eau|vin|biere|cidre|huile|vinaigre|sirop|creme liquide/.test(n)) return "ml"; if(/oeuf|croissant|pain au chocolat|banane|pomme |orange|kiwi|avocat/.test(n)) return "piece"; return "g"; }
function inferPackageSize(name: string, unit: Food["unit"]) { const n=normalizeFoodText(name); if(unit==="ml") return 1000; if(/oeuf/.test(n)) return 12; if(/baguette|pizza|quiche/.test(n)) return 1; if(/epice|poivre|sel|levure|safran/.test(n)) return 50; return 1000; }
function inferPurchaseLabel(unit: Food["unit"], size: number) { if(unit==="ml") return size>=1000 ? "bouteille 1 L" : `flacon ${size} ml`; if(unit==="piece") return size===12 ? "douzaine" : "pièce"; return size>=1000 ? "paquet 1 kg" : `paquet ${size} g`; }
function priceFor(name: string, category: string, store: Store) { const base=PRICE_OVERRIDES[name] ?? CATEGORY_BASE_PRICE[category] ?? 5; return +(base * STORES[store].factor).toFixed(2); }

const localFoods: Food[] = rawFoods.map((f, index) => {
  const category = stripEmoji(f.cat);
  const unit = inferUnit(f.name);
  const packageSize = inferPackageSize(f.name, unit);
  const prices = Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: priceFor(f.name, category, key as Store) }), {} as Record<Store, number>);
  return {
    id: `food_${index + 1}`,
    name: f.name,
    category,
    state: inferState(f.name),
    unit,
    purchaseUnit: inferPurchaseLabel(unit, packageSize),
    packageSize,
    usableInRecipe: !/eau minerale|eau gazeuse|vin|champagne|biere|cidre|rhum|cognac|whisky|armagnac|calvados|chewing-gum|pastilles/.test(normalizeFoodText(f.name)),
    diets: inferDiets(f.name),
    allergens: inferAllergens(f.name),
    prices,
    macros: { kcal: f.kcal, protein: f.p, carbs: f.g, fat: f.l, fiber: Number(f.f || 0) },
    micros: { vitA: Number(f.vitA || 0), vitC: Number(f.vitC || 0), ca: Number(f.ca || 0), fe: Number(f.fe || 0), mg: Number(f.mg || 0), na: Number(f.na || 0) },
    reliability: index < 240 ? "standard" : "estime",
    source: index < 240 ? "manual" : "estimated",
    sourceRef: index < 240 ? "Base interne initiale à fiabiliser" : "Estimation par famille d’aliments",
  } satisfies Food;
});


const brandedFoods: Food[] = [
  {
    id: "brand_oreo_original",
    name: "Oreo Original",
    category: "Plaisirs, Surgelés & Divers",
    state: "standard",
    unit: "piece",
    purchaseUnit: "paquet biscuits",
    packageSize: 154,
    usableInRecipe: true,
    diets: ["omnivore", "flexitarien", "sans_porc", "vegetarien"],
    allergens: ["gluten", "soja"],
    prices: Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: priceFor("Oreo Original", "Plaisirs, Surgelés & Divers", key as Store) }), {} as Record<Store, number>),
    macros: { kcal: 476, protein: 5.4, carbs: 68, fat: 19, fiber: 2.5 },
    micros: { sugars: 38, salt: 0.73, sodium: 292, calcium: 32, iron: 4.2 },
    reliability: "standard",
    source: "openfoodfacts",
    sourceRef: "Produit de marque à vérifier au code-barres selon le paquet",
    brand: "Oreo",
    barcode: "7622210449283",
    aliases: ["oreo", "oréo", "biscuit oreo", "biscuits oreo", "oreo original", "cookie oreo"],
    icon: "🍪",
    servingLabel: "biscuit",
    servingGrams: 11
  },
  {
    id: "brand_tenders_poulet",
    name: "Tenders de poulet",
    category: "Viandes, Poissons & Protéines",
    state: "prepare",
    unit: "piece",
    purchaseUnit: "barquette / sachet",
    packageSize: 500,
    usableInRecipe: true,
    diets: ["omnivore", "flexitarien", "sans_porc"],
    allergens: ["gluten"],
    prices: Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: priceFor("Tenders de poulet", "Viandes, Poissons & Protéines", key as Store) }), {} as Record<Store, number>),
    macros: { kcal: 255, protein: 17, carbs: 17, fat: 13, fiber: 1.1 },
    micros: { sugars: 1.4, salt: 1.5, sodium: 600, iron: 1.0, potassium: 260 },
    reliability: "estime",
    source: "manual",
    sourceRef: "Valeur moyenne pour tenders panés ; vérifier la marque si possible",
    brand: "Générique",
    aliases: ["tenders", "tender", "chicken tenders", "tenders poulet", "poulet pane", "poulet pané", "aiguillette panée"],
    icon: "🍗",
    servingLabel: "tender",
    servingGrams: 45
  },
  {
    id: "brand_yaourt_sucre",
    name: "Yaourt au sucre",
    category: "Produits Laitiers & Crèmerie",
    state: "standard",
    unit: "piece",
    purchaseUnit: "pack de yaourts",
    packageSize: 4,
    usableInRecipe: true,
    diets: ["omnivore", "flexitarien", "sans_porc", "pescetarien", "vegetarien"],
    allergens: ["lait"],
    prices: Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: priceFor("Yaourt au sucre", "Produits Laitiers & Crèmerie", key as Store) }), {} as Record<Store, number>),
    macros: { kcal: 95, protein: 3.7, carbs: 14.5, fat: 2.7, fiber: 0 },
    micros: { sugars: 14.5, salt: 0.12, sodium: 48, calcium: 125, potassium: 170, vitB2: 0.18, vitB12: 0.35 },
    reliability: "standard",
    source: "manual",
    sourceRef: "Valeur moyenne pour yaourt nature sucré ; vérifier la marque si besoin",
    brand: "Générique",
    aliases: ["yaourt sucre", "yaourt sucré", "yaourt au sucre", "yogourt sucre", "yoghourt sucre"],
    icon: "🥛",
    servingLabel: "pot",
    servingGrams: 125
  }
];



type SupplementSeed = {
  id: string;
  name: string;
  brand?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingGrams: number;
  servingLabel?: string;
  packageSize?: number;
  priceKg?: number;
  icon?: string;
  aliases?: string[];
  allergens?: string[];
  diets?: DietType[];
  micros?: Record<string, number>;
  source?: Food["source"];
  reliability?: Food["reliability"];
  sourceRef?: string;
};

const supplementSeeds: SupplementSeed[] = [
  { id:"supp_whey_concentree_generique", name:"Whey protéine concentrée", brand:"Générique", kcal:390, protein:78, carbs:8, fat:6, fiber:0, servingGrams:30, priceKg:23, icon:"🥤", aliases:["whey", "proteine whey", "protéine whey", "whey concentrate", "whey concentrée"], allergens:["lait"] },
  { id:"supp_whey_isolate_generique", name:"Whey isolate", brand:"Générique", kcal:370, protein:86, carbs:3, fat:1.5, fiber:0, servingGrams:30, priceKg:32, icon:"🥤", aliases:["isolate", "isolat", "whey isolate", "isolat whey", "iso whey"], allergens:["lait"] },
  { id:"supp_whey_native_generique", name:"Whey native", brand:"Générique", kcal:380, protein:82, carbs:5, fat:3, fiber:0, servingGrams:30, priceKg:34, icon:"🥤", aliases:["whey native", "native whey", "proteine native"], allergens:["lait"] },
  { id:"supp_clear_whey_generique", name:"Clear whey isolate", brand:"Générique", kcal:350, protein:85, carbs:2, fat:0.5, fiber:0, servingGrams:25, priceKg:42, icon:"🧃", aliases:["clear whey", "clear isolate", "proteine clear"], allergens:["lait"] },
  { id:"supp_caseine_generique", name:"Caséine micellaire", brand:"Générique", kcal:365, protein:78, carbs:6, fat:2, fiber:0, servingGrams:30, priceKg:28, icon:"🥤", aliases:["caseine", "caséine", "micellar casein", "casein"], allergens:["lait"] },
  { id:"supp_vegan_protein_generique", name:"Protéine végétale pois/riz", brand:"Générique", kcal:380, protein:75, carbs:8, fat:5, fiber:5, servingGrams:30, priceKg:28, icon:"🌱", aliases:["proteine vegan", "protéine vegan", "proteine vegetale", "pois riz", "vegan protein"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_gainer_generique", name:"Gainer prise de masse", brand:"Générique", kcal:385, protein:25, carbs:60, fat:5, fiber:2, servingGrams:100, priceKg:15, icon:"🥤", aliases:["gainer", "mass gainer", "prise de masse", "weight gainer"], allergens:["lait"] },
  { id:"supp_creatine_generique", name:"Créatine monohydrate", brand:"Générique", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:500, priceKg:34, icon:"⚡", aliases:["creatine", "créatine", "creatine monohydrate", "créatine monohydrate"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_collagene_peptides", name:"Collagène peptides", brand:"Générique", kcal:360, protein:90, carbs:0, fat:0, fiber:0, servingGrams:10, servingLabel:"dose", packageSize:300, priceKg:45, icon:"🧴", aliases:["collagene", "collagène", "peptides collagene", "collagen peptides"], allergens:[], diets:["omnivore", "flexitarien", "sans_porc"] },
  { id:"supp_bcaa_generique", name:"BCAA poudre", brand:"Générique", kcal:400, protein:100, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:300, priceKg:40, icon:"⚡", aliases:["bcaa", "acides amines", "acides aminés"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_eaa_generique", name:"EAA poudre", brand:"Générique", kcal:400, protein:100, carbs:0, fat:0, fiber:0, servingGrams:10, servingLabel:"dose", packageSize:300, priceKg:48, icon:"⚡", aliases:["eaa", "essential amino acids", "acides amines essentiels", "acides aminés essentiels"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_maltodextrine", name:"Maltodextrine", brand:"Générique", kcal:380, protein:0, carbs:95, fat:0, fiber:0, servingGrams:30, servingLabel:"dose", packageSize:1000, priceKg:8, icon:"🥤", aliases:["maltodextrine", "malto", "glucides poudre"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_dextrose", name:"Dextrose", brand:"Générique", kcal:400, protein:0, carbs:100, fat:0, fiber:0, servingGrams:30, servingLabel:"dose", packageSize:1000, priceKg:7, icon:"🥤", aliases:["dextrose", "glucose poudre"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_preworkout_generique", name:"Pré-workout poudre", brand:"Générique", kcal:120, protein:0, carbs:30, fat:0, fiber:0, servingGrams:12, servingLabel:"dose", packageSize:300, priceKg:55, icon:"⚡", aliases:["pre workout", "pré workout", "booster", "preworkout"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_electrolytes", name:"Électrolytes poudre", brand:"Générique", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:250, priceKg:35, icon:"💧", aliases:["electrolytes", "électrolytes", "sels mineraux", "sels minéraux", "hydratation"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], micros:{ sodium: 12000, potassium: 6000, magnesium: 1200 } },
  { id:"supp_omega3_capsules", name:"Oméga-3 capsules", brand:"Générique", kcal:900, protein:0, carbs:0, fat:100, fiber:0, servingGrams:1, servingLabel:"capsule", packageSize:180, priceKg:120, icon:"🐟", aliases:["omega 3", "oméga 3", "omega-3", "huile poisson", "fish oil"], allergens:["poisson"], diets:["omnivore", "flexitarien", "pescetarien", "sans_porc"] },
  { id:"supp_magnesium", name:"Magnésium bisglycinate", brand:"Générique", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:2, servingLabel:"dose", packageSize:120, priceKg:90, icon:"💊", aliases:["magnesium", "magnésium", "bisglycinate"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], micros:{ magnesium: 14000 } },
  { id:"supp_vitamine_d3", name:"Vitamine D3", brand:"Générique", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:1, servingLabel:"gélule", packageSize:120, priceKg:120, icon:"💊", aliases:["vitamine d", "vitamine d3", "d3"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "sans_porc"] },
  { id:"supp_multivitamines", name:"Multivitamines", brand:"Générique", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:1, servingLabel:"comprimé", packageSize:120, priceKg:80, icon:"💊", aliases:["multivitamines", "multi vitamines", "vitamines"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },

  { id:"supp_on_gold_standard", name:"Gold Standard 100% Whey", brand:"Optimum Nutrition", kcal:390, protein:78, carbs:8, fat:4, fiber:0, servingGrams:30, priceKg:32, icon:"🥤", aliases:["optimum nutrition", "on whey", "gold standard", "gold standard whey", "whey optimum"], allergens:["lait", "soja"] },
  { id:"supp_on_serious_mass", name:"Serious Mass", brand:"Optimum Nutrition", kcal:380, protein:16, carbs:75, fat:2, fiber:3, servingGrams:100, priceKg:15, icon:"🥤", aliases:["serious mass", "optimum nutrition gainer", "on serious mass"], allergens:["lait", "soja"] },
  { id:"supp_myprotein_impact_whey", name:"Impact Whey Protein", brand:"MyProtein", kcal:400, protein:80, carbs:6, fat:7, fiber:0, servingGrams:25, priceKg:24, icon:"🥤", aliases:["myprotein", "impact whey", "my protein whey", "whey myprotein"], allergens:["lait"] },
  { id:"supp_myprotein_impact_isolate", name:"Impact Whey Isolate", brand:"MyProtein", kcal:370, protein:90, carbs:2, fat:1, fiber:0, servingGrams:25, priceKg:35, icon:"🥤", aliases:["impact whey isolate", "myprotein isolate", "isolat myprotein"], allergens:["lait"] },
  { id:"supp_myprotein_clear_whey", name:"Clear Whey Isolate", brand:"MyProtein", kcal:350, protein:80, carbs:2, fat:0.5, fiber:0, servingGrams:25, priceKg:42, icon:"🧃", aliases:["myprotein clear whey", "clear whey myprotein"], allergens:["lait"] },
  { id:"supp_myprotein_creatine", name:"Créatine monohydrate", brand:"MyProtein", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:500, priceKg:32, icon:"⚡", aliases:["myprotein creatine", "créatine myprotein", "creatine myprotein"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"] },
  { id:"supp_nutripure_whey_native", name:"Whey native", brand:"Nutripure", kcal:382, protein:82, carbs:5, fat:4, fiber:0, servingGrams:30, priceKg:37, icon:"🥤", aliases:["nutripure", "whey nutripure", "nutripure whey native"], allergens:["lait"] },
  { id:"supp_nutripure_isolate", name:"Isolat de whey native", brand:"Nutripure", kcal:365, protein:87, carbs:2.5, fat:1.5, fiber:0, servingGrams:30, priceKg:42, icon:"🥤", aliases:["nutripure isolate", "isolat nutripure", "nutripure isolat"], allergens:["lait"] },
  { id:"supp_prozis_real_whey", name:"100% Real Whey", brand:"Prozis", kcal:390, protein:76, carbs:9, fat:5, fiber:0, servingGrams:30, priceKg:24, icon:"🥤", aliases:["prozis", "real whey", "prozis whey"], allergens:["lait", "soja"] },
  { id:"supp_foodspring_whey", name:"Whey Protein", brand:"Foodspring", kcal:390, protein:78, carbs:7, fat:5, fiber:0, servingGrams:30, priceKg:36, icon:"🥤", aliases:["foodspring", "foodspring whey", "whey foodspring"], allergens:["lait"] },
  { id:"supp_decathlon_aptania_whey", name:"Whey Protein", brand:"Decathlon / Aptonia", kcal:390, protein:76, carbs:9, fat:5, fiber:0, servingGrams:30, priceKg:21, icon:"🥤", aliases:["decathlon whey", "aptonia", "aptonia whey", "whey decathlon"], allergens:["lait", "soja"] },
  { id:"supp_eric_favre_iso_zero", name:"Iso Zero", brand:"Eric Favre", kcal:365, protein:86, carbs:3, fat:1.5, fiber:0, servingGrams:30, priceKg:37, icon:"🥤", aliases:["eric favre", "iso zero", "eric favre whey"], allergens:["lait"] },
  { id:"supp_eafit_pure_whey", name:"Pure Whey", brand:"Eafit", kcal:390, protein:75, carbs:8, fat:5, fiber:0, servingGrams:30, priceKg:32, icon:"🥤", aliases:["eafit", "pure whey", "eafit whey"], allergens:["lait", "soja"] },
  { id:"supp_scitec_whey_professional", name:"100% Whey Professional", brand:"Scitec Nutrition", kcal:390, protein:73, carbs:8, fat:6, fiber:0, servingGrams:30, priceKg:30, icon:"🥤", aliases:["scitec", "scitec whey", "whey professional"], allergens:["lait", "soja"] },
  { id:"supp_biotech_iso_whey_zero", name:"Iso Whey Zero", brand:"BioTechUSA", kcal:370, protein:88, carbs:2, fat:1.5, fiber:0, servingGrams:30, priceKg:39, icon:"🥤", aliases:["biotechusa", "bio tech usa", "iso whey zero", "whey zero"], allergens:["lait"] },
  { id:"supp_dymatize_iso100", name:"ISO100", brand:"Dymatize", kcal:365, protein:86, carbs:3, fat:1, fiber:0, servingGrams:30, priceKg:46, icon:"🥤", aliases:["dymatize", "iso100", "dymatize iso 100", "dymatize iso100"], allergens:["lait", "soja"] },
  { id:"supp_isopure_zero_carb", name:"Zero Carb", brand:"Isopure", kcal:350, protein:85, carbs:0, fat:1, fiber:0, servingGrams:30, priceKg:48, icon:"🥤", aliases:["isopure", "isopure zero carb", "zero carb whey"], allergens:["lait"] },
  { id:"supp_bulk_pure_whey", name:"Pure Whey Protein", brand:"Bulk", kcal:395, protein:77, carbs:7, fat:6, fiber:0, servingGrams:30, priceKg:24, icon:"🥤", aliases:["bulk", "bulk whey", "pure whey bulk"], allergens:["lait"] },
  { id:"supp_qnt_metapure", name:"Metapure Zero Carb", brand:"QNT", kcal:365, protein:86, carbs:2, fat:1, fiber:0, servingGrams:30, priceKg:42, icon:"🥤", aliases:["qnt", "metapure", "qnt metapure", "metapure zero carb"], allergens:["lait"] },
  { id:"supp_weider_premium_whey", name:"Premium Whey", brand:"Weider", kcal:390, protein:76, carbs:7, fat:6, fiber:0, servingGrams:30, priceKg:34, icon:"🥤", aliases:["weider", "weider whey", "premium whey"], allergens:["lait", "soja"] },
  { id:"supp_esn_designer_whey", name:"Designer Whey", brand:"ESN", kcal:390, protein:77, carbs:7, fat:5, fiber:0, servingGrams:30, priceKg:32, icon:"🥤", aliases:["esn", "designer whey", "esn whey"], allergens:["lait"] },
  { id:"supp_yamamoto_isofuji", name:"Iso-FUJI", brand:"Yamamoto Nutrition", kcal:365, protein:86, carbs:3, fat:1, fiber:0, servingGrams:30, priceKg:44, icon:"🥤", aliases:["yamamoto", "iso fuji", "isofuji", "yamamoto iso fuji"], allergens:["lait"] },

  { id:"supp_raptor_whey_protein", name:"Whey Protein", brand:"Raptor Nutrition", kcal:390, protein:76, carbs:8, fat:6, fiber:0, servingGrams:30, priceKg:27, icon:"🥤", aliases:["raptor", "raptor nutrition", "raptor whey", "whey raptor", "whey raptor nutrition", "proteine raptor", "protéine raptor"], allergens:["lait", "soja"], sourceRef:"Valeur moyenne pour whey Raptor Nutrition : vérifier l’étiquette selon goût/formule." },
  { id:"supp_raptor_whey_isolate", name:"Whey Isolate", brand:"Raptor Nutrition", kcal:365, protein:86, carbs:3, fat:1.5, fiber:0, servingGrams:30, priceKg:37, icon:"🥤", aliases:["raptor isolate", "raptor nutrition isolate", "isolate raptor", "iso raptor", "whey isolate raptor", "isolat raptor"], allergens:["lait"], sourceRef:"Valeur moyenne pour isolate Raptor Nutrition : vérifier l’étiquette selon goût/formule." },
  { id:"supp_raptor_clear_whey", name:"Clear Whey", brand:"Raptor Nutrition", kcal:350, protein:84, carbs:2, fat:0.5, fiber:0, servingGrams:25, priceKg:42, icon:"🧃", aliases:["raptor clear whey", "clear whey raptor", "clear raptor", "raptor clear"], allergens:["lait"], sourceRef:"Valeur moyenne pour clear whey Raptor Nutrition : vérifier l’étiquette selon goût/formule." },
  { id:"supp_raptor_mass_gainer", name:"Mass Gainer", brand:"Raptor Nutrition", kcal:385, protein:24, carbs:62, fat:5, fiber:2, servingGrams:100, priceKg:17, icon:"🥤", aliases:["raptor gainer", "gainer raptor", "mass gainer raptor", "prise de masse raptor"], allergens:["lait", "soja"], sourceRef:"Valeur moyenne pour gainer Raptor Nutrition : vérifier l’étiquette selon goût/formule." },
  { id:"supp_raptor_creatine", name:"Créatine monohydrate", brand:"Raptor Nutrition", kcal:0, protein:0, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:500, priceKg:32, icon:"⚡", aliases:["raptor creatine", "raptor créatine", "creatine raptor", "créatine raptor", "creatine raptor nutrition", "créatine raptor nutrition"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], sourceRef:"Créatine pure : macros nulles, dose standard 5 g ; vérifier l’étiquette." },
  { id:"supp_raptor_bcaa", name:"BCAA poudre", brand:"Raptor Nutrition", kcal:400, protein:100, carbs:0, fat:0, fiber:0, servingGrams:5, servingLabel:"dose", packageSize:300, priceKg:38, icon:"⚡", aliases:["raptor bcaa", "bcaa raptor", "bcaa raptor nutrition"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], sourceRef:"Valeur moyenne BCAA : dose standard 5 g ; vérifier l’étiquette." },
  { id:"supp_raptor_eaa", name:"EAA poudre", brand:"Raptor Nutrition", kcal:400, protein:100, carbs:0, fat:0, fiber:0, servingGrams:10, servingLabel:"dose", packageSize:300, priceKg:45, icon:"⚡", aliases:["raptor eaa", "eaa raptor", "eaa raptor nutrition"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], sourceRef:"Valeur moyenne EAA : dose standard 10 g ; vérifier l’étiquette." },
  { id:"supp_raptor_preworkout", name:"Pré-workout", brand:"Raptor Nutrition", kcal:120, protein:0, carbs:30, fat:0, fiber:0, servingGrams:12, servingLabel:"dose", packageSize:300, priceKg:52, icon:"⚡", aliases:["raptor pre workout", "raptor pré workout", "pre workout raptor", "preworkout raptor", "booster raptor"], allergens:[], diets:["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"], sourceRef:"Valeur moyenne pré-workout : les formules changent beaucoup, vérifier l’étiquette." },
];

function makeSupplementFood(seed: SupplementSeed): Food {
  const diets = seed.diets || ["omnivore", "flexitarien", "pescetarien", "vegetarien", "sans_porc"];
  const priceKg = seed.priceKg || 28;
  const prices = Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: +(priceKg * STORES[key as Store].factor).toFixed(2) }), {} as Record<Store, number>);
  return {
    id: seed.id,
    name: seed.name,
    category: "Compléments alimentaires",
    state: "standard",
    unit: "piece",
    purchaseUnit: seed.packageSize && seed.packageSize < 200 ? `boîte ${seed.packageSize} ${seed.servingLabel || "dose"}(s)` : `pot ${seed.packageSize || 1000} g`,
    packageSize: seed.packageSize || 1000,
    usableInRecipe: false,
    diets,
    allergens: seed.allergens || [],
    prices,
    macros: { kcal: seed.kcal, protein: seed.protein, carbs: seed.carbs, fat: seed.fat, fiber: seed.fiber || 0 },
    micros: seed.micros || {},
    reliability: seed.reliability || "estime",
    source: seed.source || "manual",
    sourceRef: seed.sourceRef || "Valeurs moyennes par catégorie ou marque : les goûts et formules changent, vérifier l'étiquette du pot.",
    brand: seed.brand,
    aliases: seed.aliases,
    icon: seed.icon || "🥤",
    servingLabel: seed.servingLabel || "dose",
    servingGrams: seed.servingGrams,
  } satisfies Food;
}

const supplementFoods: Food[] = supplementSeeds.map(makeSupplementFood);

export function estimateServingGrams(food?: Food): number {
  if (!food) return 100;
  if (food.servingGrams && food.servingGrams > 0) return food.servingGrams;
  const n = normalizeFoodText(food.name);
  if (/banane/.test(n)) return 120;
  if (/pomme de terre/.test(n)) return 150;
  if (/patate douce/.test(n)) return 250;
  if (/pomme(?! de terre)/.test(n)) return 150;
  if (/poire/.test(n)) return 160;
  if (/orange|pamplemousse/.test(n)) return 150;
  if (/mandarine|clementine/.test(n)) return 70;
  if (/kiwi/.test(n)) return 75;
  if (/avocat/.test(n)) return 150;
  if (/oeuf|œuf/.test(n)) return 60;
  if (/citron|lime/.test(n)) return 100;
  if (/whey|isolate|isolat|caseine|caséine|protein|protéine|proteine|gainer/.test(n)) return 30;
  if (/creatine|créatine|bcaa/.test(n)) return 5;
  if (/eaa|collagene|collagène/.test(n)) return 10;
  if (/pre[ -]?workout|booster/.test(n)) return 12;
  if (/electrolytes|électrolytes/.test(n)) return 5;
  if (/omega|oméga/.test(n)) return 1;
  if (/magnesium|magnésium/.test(n)) return 2;
  if (/vitamine|multivitamines/.test(n)) return 1;
  if (/tomate cerise/.test(n)) return 15;
  if (/tomate/.test(n)) return 120;
  if (/carotte/.test(n)) return 100;
  if (/oignon/.test(n)) return 100;
  if (/concombre/.test(n)) return 300;
  if (/courgette/.test(n)) return 200;
  if (/aubergine/.test(n)) return 250;
  if (/poivron/.test(n)) return 150;
  if (/peche|pêche|nectarine/.test(n)) return 150;
  if (/abricot/.test(n)) return 45;
  return 100;
}

export function isPieceInput(food?: Food): boolean {
  if (!food) return false;
  if (food.servingGrams && food.servingGrams > 0) return true;
  if (food.unit === "piece") return true;
  const n = normalizeFoodText(food.name);
  const individual = /banane|pomme(?! de terre)|poire|orange|mandarine|clementine|kiwi|avocat|citron|tomate(?! farcie)|carotte|oignon|concombre|courgette|aubergine|poivron|peche|pêche|nectarine|abricot/.test(n);
  const prepared = /farcie|sauce|salade|jus|soupe|compote|puree|purée|coulis|conserve|appertise|appertisee|séché|seche|sèche|cuit|cuite|rôtie|rotie|chips|beignet|tarte|cake|gateau|gâteau/.test(n);
  return individual && !prepared;
}

export function unitLabel(food?: Food) {
  if (!food) return "g";
  if (isPieceInput(food)) return `${food.servingLabel || "pièce"}(s)`;
  return food.unit;
}

export function quantityToNutritionGrams(food: Food | undefined, qty: number): number {
  const safeQty = Math.max(0, Number.isFinite(qty) ? qty : 0);
  if (!food) return safeQty;
  if (isPieceInput(food)) return safeQty * estimateServingGrams(food);
  return safeQty;
}

export function formatQuantity(food: Food | undefined, baseQty: number, displayQty?: number, displayUnit?: "g" | "ml" | "piece") {
  if (!food) return `${baseQty} g`;
  if (displayUnit === "piece" && typeof displayQty === "number") {
    const label = food.servingLabel || "pièce";
    return `${displayQty} ${displayQty > 1 ? `${label}s` : label} ≈ ${Math.round(baseQty)} g`;
  }
  const unit = displayUnit || food.unit;
  if (unit === "piece" || (!displayUnit && isPieceInput(food))) {
    const pieces = baseQty / estimateServingGrams(food);
    const label = food.servingLabel || "pièce";
    return `${Number.isInteger(pieces) ? pieces : pieces.toFixed(1)} ${pieces > 1 ? `${label}s` : label} ≈ ${Math.round(baseQty)} g`;
  }
  return `${Math.round(baseQty * 10) / 10} ${unit}`;
}

export const foods: Food[] = [...supplementFoods, ...brandedFoods, ...ciqualFoods, ...localFoods];

export const foodById = new Map(foods.map(f => [f.id, f]));
export function findFood(id: string) { return foodById.get(id); }

function relevanceScore(food: Food, q: string) {
  if (!q) return food.source === "ciqual" ? 0 : 5;
  const name = normalizeFoodText(food.name);
  const category = normalizeFoodText(food.category);
  let score = 100;
  if (name === q) score -= 80;
  else if (name.startsWith(q)) score -= 60;
  else if (name.includes(` ${q}`)) score -= 40;
  else if (name.includes(q)) score -= 25;
  if (category.includes(q)) score -= 10;
  if ((food.aliases || []).some(a => normalizeFoodText(a) === q)) score -= 35;
  if (food.source === "openfoodfacts") score -= 12;
  if (food.source === "ciqual") score -= 8;
  if (food.reliability === "precis") score -= 5;
  return score;
}

export function searchFoods(query: string, opts?: { category?: string; diet?: DietType; excludeAllergens?: string[] }) {
  const q = normalizeFoodText(query.trim());
  return foods
    .filter(f => {
      const text = normalizeFoodText(`${f.name} ${f.category} ${f.ciqualCode || ""} ${f.brand || ""} ${(f.aliases || []).join(" ")}`);
      if (q && !text.includes(q)) return false;
      if (opts?.category && opts.category !== "all" && f.category !== opts.category) return false;
      if (opts?.diet && !f.diets.includes(opts.diet)) return false;
      if (opts?.excludeAllergens?.some(a => f.allergens.includes(a))) return false;
      return true;
    })
    .sort((a, b) => relevanceScore(a, q) - relevanceScore(b, q) || a.name.localeCompare(b.name, "fr"));
}
