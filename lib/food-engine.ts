import { rawFoods } from "@/data/raw-foods";
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

// Synonymes, abr\u00e9viations et termes r\u00e9gionaux FR : la cl\u00e9 (d\u00e9j\u00e0 normalis\u00e9e) est remplac\u00e9e
// par le terme canonique avant la recherche, pour retrouver l'aliment m\u00eame si l'on tape autrement.
const SEARCH_SYNONYMS: Record<string, string> = {
  "pdt": "pomme de terre", "patate": "pomme de terre", "patates": "pomme de terre",
  "chocolatine": "pain au chocolat", "pain choc": "pain au chocolat",
  "coca": "coca-cola", "coca cola": "coca-cola", "coca zero": "coca-cola zero",
  "yogourt": "yaourt", "yoghourt": "yaourt",
  "cac": "cacahuete", "cacahuetes": "cacahuete", "cacaouete": "cacahuete",
  "pdt douce": "patate douce",
  "filet de poulet": "blanc de poulet", "escalope de poulet": "blanc de poulet",
  "hach\u00e9": "steak hache", "hache": "steak hache", "vpf": "steak hache",
  "creme fraiche": "creme fraiche", "cremerie": "creme",
  "pom pot": "compote", "compotes": "compote",
  "clementines": "clementine", "mandarines": "mandarine",
  "steak vegetal": "steak vegetal", "galette vegetale": "steak vegetal",
  "pate a tartiner": "pate a tartiner", "nutella": "pate a tartiner chocolat noisette",
  "frites mcdo": "frites", "cheeseburger": "cheeseburger", "hamburger": "hamburger",
};
function expandQuery(q: string): string { return SEARCH_SYNONYMS[q] ? normalizeFoodText(SEARCH_SYNONYMS[q]) : q; }

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
  // Graines & petits pépins (utile en cas de diverticules) : graines, oléagineux à pépins, baies à grains.
  if (/graine|chia|pavot|sesame|tahini|\blin\b|framboise|myrtille|groseille|cassis|\bmure\b|fraise|kiwi|figue|grenade|quinoa|pop-?corn/.test(n)) a.add("graines");
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
    macros: { kcal: Number(f.kcal) > 0 ? Number(f.kcal) : Math.round(Number(f.p || 0) * 4 + Number(f.g || 0) * 4 + Number(f.l || 0) * 9), protein: f.p, carbs: f.g, fat: f.l, fiber: Number(f.f || 0) },
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


// ---------------------------------------------------------------------------
// Aliments FR courants : plats, fast-food, boulangerie et produits de marque
// fréquents, souvent absents de Ciqual (qui décrit des aliments génériques).
// Valeurs par 100 g (ou 100 ml pour les boissons). Les produits de marque avec
// code-barres restent vérifiables précisément au scan ; ici c'est un raccourci
// de recherche. Les plats composés sont des moyennes réalistes, marquées comme
// telles (fiabilité « estimé »).
// ---------------------------------------------------------------------------
const D_MEAT_PORK: DietType[] = ["omnivore", "flexitarien"];
const D_MEAT: DietType[] = ["omnivore", "flexitarien", "sans_porc"];
const D_FISH: DietType[] = ["omnivore", "flexitarien", "pescetarien", "sans_porc"];
const D_VEGE: DietType[] = ["omnivore", "flexitarien", "pescetarien", "vegetarien", "sans_porc"];
const D_VEGAN: DietType[] = ["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"];

type FrSeed = {
  id: string; name: string; cat: string;
  kcal: number; p: number; c: number; f: number; fib?: number;
  unit?: Food["unit"]; state?: Food["state"];
  servingGrams?: number; servingLabel?: string; packageSize?: number; purchaseUnit?: string;
  brand?: string; barcode?: string; icon?: string;
  aliases?: string[]; allergens?: string[]; diets?: DietType[];
  nutriScore?: string; novaGroup?: number;
  reliability?: Food["reliability"]; source?: Food["source"]; sourceRef?: string;
};

const frCommonSeeds: FrSeed[] = [
  // Fast-food & plats
  { id:"fr_bigmac", name:"Big Mac", cat:"Plaisirs, Surgelés & Divers", kcal:257, p:11.8, c:20.1, f:15, fib:1.6, servingGrams:219, servingLabel:"burger", brand:"McDonald's", icon:"🍔", diets:D_MEAT, allergens:["gluten","lait","sesame","moutarde"], nutriScore:"D", novaGroup:4, sourceRef:"McDonald's France, portion ~219 g." },
  { id:"fr_cheeseburger", name:"Cheeseburger", cat:"Plaisirs, Surgelés & Divers", kcal:261, p:12.2, c:26.1, f:11.3, fib:1.5, servingGrams:115, servingLabel:"burger", brand:"McDonald's", icon:"🍔", diets:D_MEAT, allergens:["gluten","lait","sesame","moutarde"], nutriScore:"D", novaGroup:4, aliases:["cheeseburger","cheese burger"] },
  { id:"fr_hamburger", name:"Hamburger", cat:"Plaisirs, Surgelés & Divers", kcal:250, p:12, c:29, f:9, fib:1.5, servingGrams:105, servingLabel:"burger", brand:"McDonald's", icon:"🍔", diets:D_MEAT, allergens:["gluten","sesame","moutarde"], nutriScore:"C", novaGroup:4, aliases:["hamburger"] },
  { id:"fr_frites_mcdo", name:"Frites McDonald's", cat:"Plaisirs, Surgelés & Divers", kcal:299, p:3.4, c:43, f:15, fib:3.9, servingGrams:114, servingLabel:"moyenne", brand:"McDonald's", icon:"🍟", diets:D_VEGE, allergens:[], nutriScore:"C", novaGroup:4, aliases:["frites mcdo","frites","french fries","frite"], sourceRef:"Frites McDonald's, portion moyenne ~114 g." },
  { id:"fr_nuggets", name:"Nuggets de poulet", cat:"Viandes, Poissons & Protéines", kcal:296, p:15, c:16, f:18, fib:1, servingGrams:17, servingLabel:"nugget", icon:"🍗", diets:D_MEAT, allergens:["gluten"], nutriScore:"D", novaGroup:4, aliases:["nuggets","chicken nuggets","mcnuggets","nugget"] },
  { id:"fr_kebab", name:"Kebab (sandwich grec)", cat:"Plaisirs, Surgelés & Divers", kcal:215, p:12, c:18, f:11, fib:1.5, servingGrams:350, servingLabel:"kebab", icon:"🥙", diets:D_MEAT, allergens:["gluten"], reliability:"estime", nutriScore:"D", novaGroup:4, aliases:["kebab","sandwich grec","durum","doner"], sourceRef:"Pain, viande, sauce et frites : très variable selon l'enseigne (~350 g)." },
  { id:"fr_tacos", name:"Tacos français", cat:"Plaisirs, Surgelés & Divers", kcal:230, p:9, c:24, f:11, fib:2, servingGrams:400, servingLabel:"tacos", icon:"🌯", diets:D_MEAT, allergens:["gluten","lait"], reliability:"estime", nutriScore:"D", novaGroup:4, aliases:["tacos","french tacos","tacos francais"], sourceRef:"Tacos viande + sauce fromagère : moyenne, très variable." },
  { id:"fr_pizza_margherita", name:"Pizza margherita", cat:"Plaisirs, Surgelés & Divers", kcal:250, p:11, c:30, f:9, fib:2, icon:"🍕", diets:D_VEGE, allergens:["gluten","lait"], reliability:"estime", nutriScore:"C", novaGroup:4, aliases:["pizza","margherita","pizza margherita"] },
  { id:"fr_jambon_beurre", name:"Sandwich jambon-beurre", cat:"Céréales & Pain", kcal:250, p:10, c:30, f:9, fib:2, servingGrams:200, servingLabel:"sandwich", icon:"🥪", diets:D_MEAT_PORK, allergens:["gluten","lait"], reliability:"estime", aliases:["jambon beurre","sandwich jambon beurre","parisien"] },
  { id:"fr_panini", name:"Panini jambon fromage", cat:"Plaisirs, Surgelés & Divers", kcal:270, p:12, c:28, f:12, fib:2, servingGrams:220, servingLabel:"panini", icon:"🥪", diets:D_MEAT_PORK, allergens:["gluten","lait"], reliability:"estime", aliases:["panini","panini jambon fromage"] },
  { id:"fr_quiche_lorraine", name:"Quiche lorraine", cat:"Plaisirs, Surgelés & Divers", kcal:280, p:9, c:20, f:18, fib:1, icon:"🥧", diets:D_MEAT_PORK, allergens:["gluten","lait","oeufs"], reliability:"estime", aliases:["quiche","quiche lorraine"] },
  { id:"fr_croque_monsieur", name:"Croque-monsieur", cat:"Plaisirs, Surgelés & Divers", kcal:280, p:14, c:22, f:15, fib:1.5, icon:"🥪", diets:D_MEAT_PORK, allergens:["gluten","lait"], reliability:"estime", aliases:["croque monsieur","croque"] },
  { id:"fr_sushi", name:"Sushi (assortiment)", cat:"Plaisirs, Surgelés & Divers", kcal:145, p:5, c:25, f:2.5, fib:1, icon:"🍣", diets:D_FISH, allergens:["poisson","soja"], reliability:"estime", aliases:["sushi","sushis","maki","california"] },
  { id:"fr_crepe_sucre", name:"Crêpe au sucre", cat:"Céréales & Pain", kcal:230, p:6, c:35, f:7, fib:1, servingGrams:70, servingLabel:"crêpe", icon:"🥞", diets:D_VEGE, allergens:["gluten","lait","oeufs"], aliases:["crepe","crepe sucre","crêpe"] },
  // Boulangerie
  { id:"fr_croissant", name:"Croissant", cat:"Céréales & Pain", kcal:406, p:8, c:46, f:21, fib:2.6, servingGrams:55, servingLabel:"croissant", icon:"🥐", diets:D_VEGE, allergens:["gluten","lait","oeufs"], aliases:["croissant"], sourceRef:"Croissant au beurre, ~55 g pièce." },
  { id:"fr_pain_chocolat", name:"Pain au chocolat", cat:"Céréales & Pain", kcal:414, p:7.5, c:47, f:22, fib:2.7, servingGrams:65, servingLabel:"pain au chocolat", icon:"🥐", diets:D_VEGE, allergens:["gluten","lait","oeufs"], aliases:["pain au chocolat","chocolatine","pain choc"] },
  { id:"fr_pain_raisins", name:"Pain aux raisins", cat:"Céréales & Pain", kcal:360, p:7, c:50, f:15, fib:2.5, servingGrams:90, servingLabel:"pain aux raisins", icon:"🥐", diets:D_VEGE, allergens:["gluten","lait","oeufs"], aliases:["pain aux raisins","escargot aux raisins"] },
  { id:"fr_chausson_pommes", name:"Chausson aux pommes", cat:"Céréales & Pain", kcal:330, p:4, c:40, f:17, fib:1.8, servingGrams:90, servingLabel:"chausson", icon:"🥐", diets:D_VEGE, allergens:["gluten","lait"], aliases:["chausson aux pommes","chausson pomme"] },
  { id:"fr_eclair_chocolat", name:"Éclair au chocolat", cat:"Plaisirs, Surgelés & Divers", kcal:280, p:5, c:35, f:13, fib:1, servingGrams:90, servingLabel:"éclair", icon:"🍫", diets:D_VEGE, allergens:["gluten","lait","oeufs"], aliases:["eclair","eclair au chocolat","éclair"] },
  // Produits de marque
  { id:"fr_nutella", name:"Nutella", cat:"Épicerie, Huiles & Condiments", kcal:539, p:6.3, c:57.5, f:30.9, fib:0, unit:"g", state:"standard", brand:"Ferrero", barcode:"3017620422003", icon:"🍫", diets:D_VEGE, allergens:["lait","fruits_a_coque","soja"], nutriScore:"E", novaGroup:4, reliability:"precis", source:"openfoodfacts", aliases:["nutella","pate a tartiner","pate a tartiner chocolat noisette"], sourceRef:"Étiquette Nutella (Ferrero), pour 100 g." },
  { id:"fr_coca_cola", name:"Coca-Cola", cat:"Plaisirs, Surgelés & Divers", kcal:42, p:0, c:10.6, f:0, fib:0, unit:"ml", state:"standard", brand:"Coca-Cola", barcode:"5449000000996", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"E", novaGroup:4, reliability:"precis", source:"openfoodfacts", aliases:["coca","coca cola","coca-cola","coke"], sourceRef:"Coca-Cola, pour 100 ml." },
  { id:"fr_coca_zero", name:"Coca-Cola Zero", cat:"Plaisirs, Surgelés & Divers", kcal:0.3, p:0, c:0, f:0, fib:0, unit:"ml", state:"standard", brand:"Coca-Cola", barcode:"5449000131805", icon:"🥤", diets:D_VEGAN, allergens:[], novaGroup:4, reliability:"precis", source:"openfoodfacts", aliases:["coca zero","coca cola zero","coca-cola zero","coke zero"], sourceRef:"Coca-Cola Zero, pour 100 ml." },
  { id:"fr_kinder_bueno", name:"Kinder Bueno", cat:"Plaisirs, Surgelés & Divers", kcal:571, p:8.6, c:49.5, f:37.3, fib:2.5, servingGrams:21.5, servingLabel:"barre", brand:"Kinder", icon:"🍫", diets:D_VEGE, allergens:["lait","fruits_a_coque","soja","gluten"], nutriScore:"E", novaGroup:4, aliases:["kinder bueno","bueno"] },
  { id:"fr_prince", name:"Prince (biscuit chocolat)", cat:"Plaisirs, Surgelés & Divers", kcal:466, p:6.5, c:69, f:18, fib:3.5, servingGrams:18, servingLabel:"biscuit", brand:"LU", icon:"🍪", diets:D_VEGE, allergens:["gluten","lait","soja"], nutriScore:"D", novaGroup:4, reliability:"estime", aliases:["prince","prince lu","biscuit prince","prince chocolat"] },
  { id:"fr_petit_beurre", name:"Petit Beurre", cat:"Plaisirs, Surgelés & Divers", kcal:439, p:7, c:73, f:12, fib:2.8, servingGrams:8.3, servingLabel:"biscuit", brand:"LU", icon:"🍪", diets:D_VEGE, allergens:["gluten","lait"], nutriScore:"C", novaGroup:4, aliases:["petit beurre","veritable petit beurre","lu petit beurre"] },
  { id:"fr_danette", name:"Danette chocolat", cat:"Produits Laitiers & Crèmerie", kcal:118, p:3.5, c:19, f:3.4, fib:0.9, servingGrams:125, servingLabel:"pot", brand:"Danone", icon:"🍮", diets:D_VEGE, allergens:["lait"], nutriScore:"C", novaGroup:4, aliases:["danette","danette chocolat","creme dessert"] },
  { id:"fr_vache_qui_rit", name:"La Vache qui rit", cat:"Produits Laitiers & Crèmerie", kcal:267, p:10, c:7, f:22, fib:0, servingGrams:17.5, servingLabel:"portion", brand:"La Vache qui rit", icon:"🧀", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["vache qui rit","la vache qui rit"] },
  { id:"fr_babybel", name:"Mini Babybel", cat:"Produits Laitiers & Crèmerie", kcal:298, p:22, c:0, f:24, fib:0, servingGrams:20, servingLabel:"portion", brand:"Babybel", icon:"🧀", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["babybel","mini babybel"] },
  { id:"fr_pompotes", name:"Pom'Potes pomme", cat:"Fruits & Légumes", kcal:64, p:0.3, c:15, f:0.1, fib:1.1, servingGrams:90, servingLabel:"gourde", brand:"Pom'Potes", icon:"🍎", diets:D_VEGAN, allergens:[], nutriScore:"B", aliases:["pom potes","pompotes","compote gourde","gourde compote"] },
  { id:"fr_pain_de_mie", name:"Pain de mie", cat:"Céréales & Pain", kcal:270, p:8, c:48, f:4, fib:3, state:"standard", brand:"Harry's", servingGrams:30, servingLabel:"tranche", icon:"🍞", diets:D_VEGE, allergens:["gluten","lait"], nutriScore:"C", aliases:["pain de mie","harrys","harry's","pain mie"] },
  { id:"fr_jambon_blanc", name:"Jambon blanc", cat:"Viandes, Poissons & Protéines", kcal:115, p:18, c:1, f:4, fib:0, state:"standard", brand:"Herta", servingGrams:40, servingLabel:"tranche", icon:"🥓", diets:D_MEAT_PORK, allergens:[], nutriScore:"B", aliases:["jambon","jambon blanc","le bon paris","jambon de paris","herta jambon"] },
  // Fast-food (suite) : Burger King, KFC
  { id:"fr_whopper", name:"Whopper", cat:"Plaisirs, Surgelés & Divers", kcal:248, p:11.2, c:16.7, f:15.3, fib:1, servingGrams:316, servingLabel:"burger", brand:"Burger King", icon:"🍔", diets:D_MEAT, allergens:["gluten","lait","sesame","moutarde"], nutriScore:"D", novaGroup:4, reliability:"estime", aliases:["whopper","burger king"], sourceRef:"Burger King France, portion ~316 g, valeur variable selon montage." },
  { id:"fr_poulet_frit_kfc", name:"Poulet frit (KFC)", cat:"Viandes, Poissons & Protéines", kcal:260, p:19, c:9, f:16, fib:0.8, servingGrams:90, servingLabel:"morceau", brand:"KFC", icon:"🍗", diets:D_MEAT, allergens:["gluten"], nutriScore:"D", novaGroup:4, reliability:"estime", aliases:["kfc","poulet frit","original recipe","poulet kfc"], sourceRef:"Poulet pané frit type KFC, ~90 g le morceau, variable." },
  { id:"fr_tenders_kfc", name:"Tenders KFC", cat:"Viandes, Poissons & Protéines", kcal:240, p:18, c:14, f:12, fib:1, servingGrams:40, servingLabel:"tender", brand:"KFC", icon:"🍗", diets:D_MEAT, allergens:["gluten"], nutriScore:"D", novaGroup:4, reliability:"estime", aliases:["tenders kfc","kfc tenders","aiguillette kfc"] },
  // Boissons énergisantes & sodas (par 100 ml)
  { id:"fr_red_bull", name:"Red Bull", cat:"Plaisirs, Surgelés & Divers", kcal:46, p:0, c:11, f:0, fib:0, unit:"ml", state:"standard", brand:"Red Bull", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"E", novaGroup:4, aliases:["red bull","redbull","boisson energisante"], sourceRef:"Red Bull, pour 100 ml (canette 250 ml ≈ 115 kcal)." },
  { id:"fr_red_bull_zero", name:"Red Bull Sugarfree", cat:"Plaisirs, Surgelés & Divers", kcal:3, p:0, c:0, f:0, fib:0, unit:"ml", state:"standard", brand:"Red Bull", icon:"🥤", diets:D_VEGAN, allergens:[], aliases:["red bull zero","red bull sugarfree","red bull sans sucre"], sourceRef:"Red Bull sans sucre, pour 100 ml." },
  { id:"fr_monster", name:"Monster Energy", cat:"Plaisirs, Surgelés & Divers", kcal:45, p:0, c:11, f:0, fib:0, unit:"ml", state:"standard", brand:"Monster", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"E", novaGroup:4, aliases:["monster","monster energy","boisson energisante"], sourceRef:"Monster Energy, pour 100 ml (canette 500 ml ≈ 225 kcal)." },
  { id:"fr_orangina", name:"Orangina", cat:"Plaisirs, Surgelés & Divers", kcal:44, p:0, c:10.5, f:0, fib:0, unit:"ml", state:"standard", brand:"Orangina", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"E", novaGroup:4, aliases:["orangina"], sourceRef:"Orangina, pour 100 ml." },
  { id:"fr_ice_tea", name:"Ice Tea pêche", cat:"Plaisirs, Surgelés & Divers", kcal:28, p:0, c:6.5, f:0, fib:0, unit:"ml", state:"standard", brand:"Lipton", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"D", novaGroup:4, aliases:["ice tea","lipton ice tea","the glace peche","thé glacé"], sourceRef:"Thé glacé pêche, pour 100 ml." },
  { id:"fr_oasis", name:"Oasis tropical", cat:"Plaisirs, Surgelés & Divers", kcal:42, p:0, c:10, f:0, fib:0, unit:"ml", state:"standard", brand:"Oasis", icon:"🥤", diets:D_VEGAN, allergens:[], nutriScore:"E", novaGroup:4, aliases:["oasis","oasis tropical"], sourceRef:"Oasis tropical, pour 100 ml." },
  // Surgelés & plats préparés (par 100 g)
  { id:"fr_lasagnes", name:"Lasagnes bolognaise", cat:"Plaisirs, Surgelés & Divers", kcal:135, p:7, c:13, f:6, fib:1, state:"cuit", icon:"🍝", diets:D_MEAT, allergens:["gluten","lait"], nutriScore:"C", novaGroup:4, reliability:"estime", aliases:["lasagnes","lasagne","lasagnes bolognaise","lasagnes surgelees"] },
  { id:"fr_pizza_surgelee", name:"Pizza surgelée jambon-fromage", cat:"Plaisirs, Surgelés & Divers", kcal:240, p:11, c:29, f:9, fib:2, state:"cuit", icon:"🍕", diets:D_MEAT_PORK, allergens:["gluten","lait"], nutriScore:"C", novaGroup:4, reliability:"estime", aliases:["pizza surgelee","pizza surgelée","pizza jambon fromage"] },
  { id:"fr_cordon_bleu", name:"Cordon bleu", cat:"Viandes, Poissons & Protéines", kcal:240, p:15, c:14, f:14, fib:1, state:"cuit", icon:"🍗", diets:D_MEAT, allergens:["gluten","lait"], nutriScore:"C", novaGroup:4, reliability:"estime", aliases:["cordon bleu"] },
  { id:"fr_poisson_pane", name:"Poisson pané", cat:"Viandes, Poissons & Protéines", kcal:200, p:12, c:17, f:9, fib:1, servingGrams:30, servingLabel:"bâtonnet", state:"cuit", icon:"🐟", diets:D_FISH, allergens:["gluten","poisson"], nutriScore:"C", novaGroup:4, reliability:"estime", aliases:["poisson pane","batonnet de poisson","fish stick","captain iglo"] },
  { id:"fr_poelee_legumes", name:"Poêlée de légumes", cat:"Fruits & Légumes", kcal:55, p:2.5, c:7, f:1.5, fib:3, state:"cuit", icon:"🥦", diets:D_VEGAN, allergens:[], nutriScore:"A", aliases:["poelee de legumes","legumes surgeles","poêlée de légumes"] },
  { id:"fr_glace_vanille", name:"Glace vanille", cat:"Plaisirs, Surgelés & Divers", kcal:200, p:3.5, c:24, f:10, fib:0.5, state:"standard", icon:"🍨", diets:D_VEGE, allergens:["lait","oeufs"], nutriScore:"D", novaGroup:4, aliases:["glace","glace vanille","creme glacee","crème glacée"] },
  // Céréales petit-déjeuner (par 100 g)
  { id:"fr_chocapic", name:"Chocapic", cat:"Céréales & Pain", kcal:383, p:8.4, c:70.9, f:4.7, fib:7, state:"standard", brand:"Nestlé", icon:"🥣", diets:D_VEGE, allergens:["gluten"], novaGroup:4, aliases:["chocapic","cereales chocolat"] },
  { id:"fr_frosties", name:"Frosties", cat:"Céréales & Pain", kcal:375, p:4.5, c:87, f:0.6, fib:2, state:"standard", brand:"Kellogg's", icon:"🥣", diets:D_VEGAN, allergens:["gluten"], nutriScore:"D", novaGroup:4, aliases:["frosties"] },
  { id:"fr_corn_flakes", name:"Corn Flakes", cat:"Céréales & Pain", kcal:378, p:7, c:84, f:0.9, fib:3, state:"standard", brand:"Kellogg's", icon:"🥣", diets:D_VEGAN, allergens:["gluten"], nutriScore:"B", novaGroup:3, aliases:["corn flakes","cornflakes","petales de mais"] },
  { id:"fr_miel_pops", name:"Miel Pops", cat:"Céréales & Pain", kcal:379, p:5, c:84, f:2, fib:3, state:"standard", brand:"Kellogg's", icon:"🥣", diets:D_VEGE, allergens:["gluten"], novaGroup:4, aliases:["miel pops"] },
  { id:"fr_muesli", name:"Muesli", cat:"Céréales & Pain", kcal:360, p:10, c:60, f:6, fib:8, state:"standard", icon:"🥣", diets:D_VEGE, allergens:["gluten"], nutriScore:"A", novaGroup:3, aliases:["muesli","musli"] },
  { id:"fr_granola", name:"Granola (biscuit)", cat:"Plaisirs, Surgelés & Divers", kcal:480, p:6, c:66, f:21, fib:3, servingGrams:16.6, servingLabel:"biscuit", state:"standard", brand:"LU", icon:"🍪", diets:D_VEGE, allergens:["gluten","lait"], novaGroup:4, aliases:["granola","biscuit granola"] },
  // Barres & snacks chocolatés (par 100 g)
  { id:"fr_twix", name:"Twix", cat:"Plaisirs, Surgelés & Divers", kcal:495, p:4.7, c:64.2, f:24, fib:1, servingGrams:25, servingLabel:"barre", state:"standard", brand:"Twix", icon:"🍫", diets:D_VEGE, allergens:["lait","soja","gluten"], nutriScore:"E", novaGroup:4, aliases:["twix"] },
  { id:"fr_snickers", name:"Snickers", cat:"Plaisirs, Surgelés & Divers", kcal:488, p:8.8, c:55, f:25, fib:2, servingGrams:50, servingLabel:"barre", state:"standard", brand:"Snickers", icon:"🍫", diets:D_VEGE, allergens:["lait","fruits_a_coque","soja"], nutriScore:"E", novaGroup:4, aliases:["snickers"] },
  { id:"fr_mars", name:"Mars", cat:"Plaisirs, Surgelés & Divers", kcal:449, p:3.8, c:70, f:17, fib:1, servingGrams:45, servingLabel:"barre", state:"standard", brand:"Mars", icon:"🍫", diets:D_VEGE, allergens:["lait","soja"], nutriScore:"E", novaGroup:4, aliases:["mars","barre mars"] },
  { id:"fr_kitkat", name:"KitKat", cat:"Plaisirs, Surgelés & Divers", kcal:518, p:6.5, c:60, f:28, fib:1.5, servingGrams:20.8, servingLabel:"barre", state:"standard", brand:"KitKat", icon:"🍫", diets:D_VEGE, allergens:["lait","soja","gluten"], nutriScore:"E", novaGroup:4, aliases:["kitkat","kit kat"] },
  { id:"fr_kinder_delice", name:"Kinder Délice", cat:"Plaisirs, Surgelés & Divers", kcal:421, p:6.5, c:49, f:22, fib:2, servingGrams:39, servingLabel:"gâteau", state:"standard", brand:"Kinder", icon:"🍫", diets:D_VEGE, allergens:["lait","oeufs","gluten","soja"], nutriScore:"E", novaGroup:4, aliases:["kinder delice","kinder délice"] },
  { id:"fr_kinder_country", name:"Kinder Country", cat:"Plaisirs, Surgelés & Divers", kcal:566, p:7.9, c:54, f:35, fib:3, servingGrams:23.5, servingLabel:"barre", state:"standard", brand:"Kinder", icon:"🍫", diets:D_VEGE, allergens:["lait","fruits_a_coque","gluten"], nutriScore:"E", novaGroup:4, aliases:["kinder country"] },
  { id:"fr_barre_cereales", name:"Barre de céréales", cat:"Plaisirs, Surgelés & Divers", kcal:400, p:6, c:70, f:10, fib:5, servingGrams:25, servingLabel:"barre", state:"standard", icon:"🥜", diets:D_VEGE, allergens:["gluten"], nutriScore:"C", novaGroup:4, aliases:["barre de cereales","barre cereales","grany"] },
  // Chips & apéritif (par 100 g)
  { id:"fr_chips", name:"Chips nature", cat:"Plaisirs, Surgelés & Divers", kcal:536, p:6, c:50, f:34, fib:4, state:"standard", brand:"Lay's", icon:"🥔", diets:D_VEGAN, allergens:[], nutriScore:"D", novaGroup:4, aliases:["chips","lays","lay's","chips nature"] },
  { id:"fr_pringles", name:"Pringles Original", cat:"Plaisirs, Surgelés & Divers", kcal:534, p:4, c:51, f:34, fib:3, state:"standard", brand:"Pringles", icon:"🥔", diets:D_VEGE, allergens:["lait","gluten"], nutriScore:"D", novaGroup:4, aliases:["pringles"] },
  // Chaînes (par 100 g)
  { id:"fr_subway", name:"Sandwich Subway 15 cm", cat:"Plaisirs, Surgelés & Divers", kcal:165, p:10, c:24, f:4, fib:2, servingGrams:230, servingLabel:"15 cm", icon:"🥪", diets:D_MEAT, allergens:["gluten"], novaGroup:4, reliability:"estime", aliases:["subway","sub","sandwich subway"], sourceRef:"Subway 15 cm poulet/dinde, moyenne ~230 g, très variable selon la garniture." },
  { id:"fr_dominos", name:"Pizza Domino's (part)", cat:"Plaisirs, Surgelés & Divers", kcal:260, p:11, c:30, f:10, fib:2, servingGrams:80, servingLabel:"part", icon:"🍕", diets:D_VEGE, allergens:["gluten","lait"], novaGroup:4, reliability:"estime", aliases:["dominos","domino's","pizza dominos"], sourceRef:"Part de pizza Domino's, ~80 g, variable selon la recette." },
  // Produits laitiers protéinés (par 100 g / 100 ml)
  { id:"fr_danio", name:"Danio (yaourt protéiné)", cat:"Produits Laitiers & Crèmerie", kcal:79, p:7.5, c:10, f:0.9, fib:0, state:"standard", brand:"Danone", servingGrams:150, servingLabel:"pot", icon:"🥛", diets:D_VEGE, allergens:["lait"], nutriScore:"B", aliases:["danio","yaourt proteine","skyr danio"] },
  { id:"fr_petit_suisse", name:"Petit-suisse", cat:"Produits Laitiers & Crèmerie", kcal:96, p:9, c:3.5, f:5, fib:0, state:"standard", servingGrams:60, servingLabel:"pot", icon:"🥛", diets:D_VEGE, allergens:["lait"], nutriScore:"B", aliases:["petit suisse","petit-suisse"] },
  { id:"fr_cottage_cheese", name:"Cottage cheese", cat:"Produits Laitiers & Crèmerie", kcal:98, p:11, c:3.4, f:4.3, fib:0, state:"standard", icon:"🧀", diets:D_VEGE, allergens:["lait"], nutriScore:"B", aliases:["cottage cheese","fromage cottage","fromage blanc granuleux"] },
  { id:"fr_yop", name:"Yaourt à boire (Yop)", cat:"Produits Laitiers & Crèmerie", kcal:78, p:3, c:13, f:1.5, fib:0, unit:"ml", state:"standard", brand:"Yop", icon:"🥛", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["yop","yaourt a boire","yaourt a boire yop"] },
  { id:"fr_actimel", name:"Actimel", cat:"Produits Laitiers & Crèmerie", kcal:71, p:2.7, c:11, f:1.5, fib:0, unit:"ml", state:"standard", brand:"Actimel", icon:"🥛", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["actimel","yaourt a boire actimel"] },
  // Pains spéciaux (par 100 g)
  { id:"fr_pain_seigle", name:"Pain de seigle", cat:"Céréales & Pain", kcal:259, p:8, c:48, f:1.3, fib:7, state:"standard", icon:"🍞", diets:D_VEGAN, allergens:["gluten"], nutriScore:"A", aliases:["pain de seigle","seigle"] },
  { id:"fr_wrap", name:"Wrap / tortilla de blé", cat:"Céréales & Pain", kcal:297, p:8, c:49, f:7, fib:3, state:"standard", icon:"🫓", diets:D_VEGAN, allergens:["gluten"], nutriScore:"C", novaGroup:4, aliases:["wrap","tortilla","tortilla de ble","galette de ble"] },
  { id:"fr_pita", name:"Pain pita", cat:"Céréales & Pain", kcal:275, p:9, c:55, f:1.2, fib:2.5, state:"standard", icon:"🫓", diets:D_VEGAN, allergens:["gluten"], nutriScore:"B", aliases:["pita","pain pita"] },
  { id:"fr_naan", name:"Naan", cat:"Céréales & Pain", kcal:310, p:9, c:50, f:8, fib:2.5, state:"standard", icon:"🫓", diets:D_VEGE, allergens:["gluten","lait"], nutriScore:"C", novaGroup:3, aliases:["naan","pain naan"] },
  // Plats du monde (par 100 g)
  { id:"fr_couscous", name:"Couscous (plat)", cat:"Plaisirs, Surgelés & Divers", kcal:150, p:7, c:20, f:4, fib:2, state:"cuit", icon:"🍲", diets:D_MEAT, allergens:["gluten"], reliability:"estime", aliases:["couscous"], sourceRef:"Semoule, légumes et viande : moyenne, variable." },
  { id:"fr_curry_poulet", name:"Curry de poulet", cat:"Plaisirs, Surgelés & Divers", kcal:130, p:10, c:8, f:6, fib:1.5, state:"cuit", icon:"🍛", diets:D_MEAT, allergens:["lait"], reliability:"estime", aliases:["curry de poulet","poulet curry","curry poulet"] },
  { id:"fr_chili", name:"Chili con carne", cat:"Plaisirs, Surgelés & Divers", kcal:130, p:8, c:12, f:5, fib:3, state:"cuit", icon:"🌶️", diets:D_MEAT, allergens:[], reliability:"estime", aliases:["chili","chili con carne"] },
  { id:"fr_riz_cantonais", name:"Riz cantonais", cat:"Plaisirs, Surgelés & Divers", kcal:165, p:6, c:22, f:5, fib:1, state:"cuit", icon:"🍚", diets:D_MEAT, allergens:["oeufs","soja"], reliability:"estime", aliases:["riz cantonais","riz cantonnais"] },
  { id:"fr_pad_thai", name:"Pad thaï", cat:"Plaisirs, Surgelés & Divers", kcal:155, p:7, c:20, f:5, fib:2, state:"cuit", icon:"🍜", diets:D_MEAT, allergens:["oeufs","fruits_a_coque","soja"], reliability:"estime", aliases:["pad thai","pad thaï"] },
  { id:"fr_dahl", name:"Dahl de lentilles", cat:"Plaisirs, Surgelés & Divers", kcal:120, p:6, c:15, f:4, fib:4, state:"cuit", icon:"🍛", diets:D_VEGAN, allergens:[], reliability:"estime", aliases:["dahl","dhal","dahl de lentilles","curry de lentilles"] },
  { id:"fr_poke_bowl", name:"Poke bowl saumon", cat:"Plaisirs, Surgelés & Divers", kcal:150, p:9, c:18, f:5, fib:2, state:"cuit", icon:"🍚", diets:D_FISH, allergens:["poisson","soja"], reliability:"estime", aliases:["poke bowl","poke","poke saumon"] },
  { id:"fr_ramen", name:"Ramen", cat:"Plaisirs, Surgelés & Divers", kcal:90, p:4, c:12, f:2.5, fib:1, state:"cuit", icon:"🍜", diets:D_MEAT, allergens:["gluten","oeufs","soja"], reliability:"estime", aliases:["ramen","nouilles japonaises","soupe ramen"] },
  // Sauces & condiments (par 100 g)
  { id:"fr_ketchup", name:"Ketchup", cat:"Épicerie, Huiles & Condiments", kcal:100, p:1.2, c:24, f:0.1, fib:1, state:"standard", icon:"🍅", diets:D_VEGAN, allergens:[], nutriScore:"D", novaGroup:4, aliases:["ketchup","sauce tomate ketchup"] },
  { id:"fr_mayonnaise", name:"Mayonnaise", cat:"Épicerie, Huiles & Condiments", kcal:680, p:1, c:2, f:75, fib:0, state:"standard", icon:"🥚", diets:D_VEGE, allergens:["oeufs","moutarde"], nutriScore:"E", novaGroup:4, aliases:["mayonnaise","mayo"] },
  { id:"fr_moutarde", name:"Moutarde", cat:"Épicerie, Huiles & Condiments", kcal:150, p:7, c:6, f:10, fib:4, state:"standard", icon:"🌭", diets:D_VEGAN, allergens:["moutarde"], nutriScore:"C", aliases:["moutarde","moutarde de dijon"] },
  { id:"fr_pesto", name:"Pesto", cat:"Épicerie, Huiles & Condiments", kcal:450, p:4, c:6, f:45, fib:2, state:"standard", icon:"🌿", diets:D_VEGE, allergens:["lait","fruits_a_coque"], nutriScore:"D", novaGroup:4, aliases:["pesto","sauce pesto"] },
  { id:"fr_sauce_soja", name:"Sauce soja", cat:"Épicerie, Huiles & Condiments", kcal:60, p:6, c:6, f:0, fib:0.8, state:"standard", icon:"🍶", diets:D_VEGAN, allergens:["soja","gluten"], nutriScore:"D", aliases:["sauce soja","soja sauce","shoyu"] },
  { id:"fr_vinaigrette", name:"Vinaigrette", cat:"Épicerie, Huiles & Condiments", kcal:330, p:0.5, c:6, f:33, fib:0, state:"standard", icon:"🥗", diets:D_VEGAN, allergens:["moutarde"], nutriScore:"D", novaGroup:4, aliases:["vinaigrette","sauce salade"] },
  { id:"fr_sauce_tomate", name:"Sauce tomate cuisinée", cat:"Épicerie, Huiles & Condiments", kcal:55, p:1.5, c:8, f:1.8, fib:1.5, state:"prepare", icon:"🍅", diets:D_VEGAN, allergens:[], nutriScore:"B", aliases:["sauce tomate","coulis de tomate","sauce tomate cuisinee"] },
  { id:"fr_bechamel", name:"Sauce béchamel", cat:"Épicerie, Huiles & Condiments", kcal:130, p:4, c:8, f:9, fib:0.3, state:"prepare", icon:"🥛", diets:D_VEGE, allergens:["lait","gluten"], nutriScore:"C", aliases:["bechamel","sauce bechamel","sauce blanche"] },
  { id:"fr_sauce_bbq", name:"Sauce barbecue", cat:"Épicerie, Huiles & Condiments", kcal:160, p:1, c:35, f:0.5, fib:1, state:"standard", icon:"🍖", diets:D_VEGAN, allergens:[], nutriScore:"D", novaGroup:4, aliases:["sauce barbecue","bbq","sauce bbq"] },
  { id:"fr_sauce_samourai", name:"Sauce samouraï", cat:"Épicerie, Huiles & Condiments", kcal:350, p:1.5, c:10, f:33, fib:1, state:"standard", icon:"🌶️", diets:D_VEGE, allergens:["oeufs","moutarde"], nutriScore:"E", novaGroup:4, aliases:["sauce samourai","samourai","sauce algerienne"] },
  { id:"fr_confiture", name:"Confiture", cat:"Épicerie, Huiles & Condiments", kcal:250, p:0.5, c:60, f:0.1, fib:1, state:"standard", icon:"🍓", diets:D_VEGAN, allergens:[], nutriScore:"D", aliases:["confiture","gelee de fruits"] },
  { id:"fr_sirop_erable", name:"Sirop d'érable", cat:"Épicerie, Huiles & Condiments", kcal:260, p:0, c:67, f:0.1, fib:0, state:"standard", icon:"🍁", diets:D_VEGAN, allergens:[], nutriScore:"D", aliases:["sirop d'erable","sirop erable","maple"] },
  // Boissons chaudes (par 100 ml)
  { id:"fr_cafe_noir", name:"Café noir", cat:"Plaisirs, Surgelés & Divers", kcal:2, p:0.1, c:0, f:0, fib:0, unit:"ml", state:"standard", icon:"☕", diets:D_VEGAN, allergens:[], nutriScore:"A", aliases:["cafe","café","expresso","espresso","cafe noir"] },
  { id:"fr_cafe_au_lait", name:"Café au lait", cat:"Plaisirs, Surgelés & Divers", kcal:40, p:2, c:3, f:2, fib:0, unit:"ml", state:"standard", icon:"☕", diets:D_VEGE, allergens:["lait"], nutriScore:"B", aliases:["cafe au lait","café au lait","cafe creme","noisette"] },
  { id:"fr_cappuccino", name:"Cappuccino", cat:"Plaisirs, Surgelés & Divers", kcal:55, p:2.5, c:5, f:2.5, fib:0, unit:"ml", state:"standard", icon:"☕", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["cappuccino","capuccino"] },
  { id:"fr_latte", name:"Café latte", cat:"Plaisirs, Surgelés & Divers", kcal:50, p:3, c:5, f:2, fib:0, unit:"ml", state:"standard", icon:"☕", diets:D_VEGE, allergens:["lait"], nutriScore:"C", aliases:["latte","cafe latte","latte macchiato"] },
  { id:"fr_the", name:"Thé nature", cat:"Plaisirs, Surgelés & Divers", kcal:1, p:0, c:0.2, f:0, fib:0, unit:"ml", state:"standard", icon:"🍵", diets:D_VEGAN, allergens:[], nutriScore:"A", aliases:["the","thé","the nature","infusion"] },
  { id:"fr_chocolat_chaud", name:"Chocolat chaud", cat:"Plaisirs, Surgelés & Divers", kcal:85, p:3.5, c:12, f:2.5, fib:0.5, unit:"ml", state:"standard", icon:"☕", diets:D_VEGE, allergens:["lait"], nutriScore:"D", novaGroup:4, aliases:["chocolat chaud","chocolat au lait chaud"] },
];

function makeFrFood(s: FrSeed): Food {
  const unit = s.unit || "g";
  const prices = Object.keys(STORES).reduce((acc, key) => ({ ...acc, [key]: priceFor(s.name, s.cat, key as Store) }), {} as Record<Store, number>);
  return {
    id: s.id,
    name: s.name,
    category: s.cat,
    state: s.state || "prepare",
    unit,
    purchaseUnit: s.purchaseUnit || (unit === "ml" ? "bouteille" : "portion"),
    packageSize: s.packageSize || (unit === "ml" ? 1000 : 1000),
    usableInRecipe: false,
    diets: s.diets || inferDiets(s.name),
    allergens: s.allergens || inferAllergens(s.name),
    prices,
    macros: { kcal: s.kcal, protein: s.p, carbs: s.c, fat: s.f, fiber: s.fib || 0 },
    micros: {},
    reliability: s.reliability || "standard",
    source: s.source || "manual",
    sourceRef: s.sourceRef || "Valeur moyenne pour ce produit : peut varier selon la recette ou l'enseigne, vérifie au code-barres si possible.",
    brand: s.brand,
    barcode: s.barcode,
    aliases: s.aliases,
    icon: s.icon,
    servingLabel: s.servingLabel,
    servingGrams: s.servingGrams,
    nutriScore: s.nutriScore,
    novaGroup: s.novaGroup,
  } satisfies Food;
}

const frCommonFoods: Food[] = frCommonSeeds.map(makeFrFood);


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

export function formatQuantity(food: Food | undefined, baseQty: number, displayQty?: number, displayUnit?: "g" | "ml" | "cl" | "piece") {
  if (!food) return `${baseQty} g`;
  if (displayUnit === "piece" && typeof displayQty === "number") {
    const label = food.servingLabel || "pièce";
    return `${displayQty} ${displayQty > 1 ? `${label}s` : label} ≈ ${Math.round(baseQty)} g`;
  }
  if ((displayUnit === "cl" || displayUnit === "ml") && typeof displayQty === "number") {
    return `${displayQty} ${displayUnit} ≈ ${Math.round(baseQty)} g`;
  }
  const unit = displayUnit || food.unit;
  if (unit === "piece" || (!displayUnit && isPieceInput(food))) {
    const pieces = baseQty / estimateServingGrams(food);
    const label = food.servingLabel || "pièce";
    return `${Number.isInteger(pieces) ? pieces : pieces.toFixed(1)} ${pieces > 1 ? `${label}s` : label} ≈ ${Math.round(baseQty)} g`;
  }
  return `${Math.round(baseQty * 10) / 10} ${unit}`;
}

function buildSearchIndex(list: Food[]) {
  return list.map(f => ({
    f,
    text: normalizeFoodText(`${f.name} ${f.category} ${f.ciqualCode || ""} ${f.brand || ""} ${(f.aliases || []).join(" ")}`),
  }));
}

// Aliments « cœur » toujours présents (compléments, marques, base interne), légers, dans le bundle.
const coreFoods: Food[] = [...supplementFoods, ...brandedFoods, ...frCommonFoods, ...localFoods];
// La base Ciqual (3 484 aliments) est chargée à la demande (import dynamique) pour alléger l'ouverture.
export let foods: Food[] = coreFoods;
let foodById = new Map<string, Food>(foods.map(f => [f.id, f]));
let foodSearchIndex = buildSearchIndex(foods);
let ciqualLoaded = false;

export function findFood(id: string) { return foodById.get(id); }

export async function ensureCiqualLoaded(): Promise<boolean> {
  if (ciqualLoaded) return false;
  try {
    const mod = await import("@/data/ciqual-foods.generated");
    foods = [...coreFoods, ...mod.ciqualFoods];
    foodById = new Map(foods.map(f => [f.id, f]));
    foodSearchIndex = buildSearchIndex(foods);
    ciqualLoaded = true;
    return true;
  } catch {
    return false;
  }
}

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
  // Priorité : aliments curés fiables (marque/interne vérifié) devant Ciqual officiel,
  // et estimations grossières reléguées en fin de liste.
  if (food.source === "manual" && food.reliability !== "estime") score -= 14;
  else if (food.source === "openfoodfacts") score -= 12;
  else if (food.source === "ciqual") score -= 8;
  if (food.source === "estimated" || food.reliability === "estime") score += 8;
  if (food.reliability === "precis") score -= 5;
  return score;
}

function scoreFood(food: Food, q: string, qx: string) {
  const s = relevanceScore(food, q);
  return qx !== q ? Math.min(s, relevanceScore(food, qx)) : s;
}

export function searchFoods(query: string, opts?: { category?: string; diet?: DietType; excludeAllergens?: string[] }) {
  const q = normalizeFoodText(query.trim());
  const qx = expandQuery(q); // terme canonique si l'utilisateur a tapé un synonyme/abréviation
  const sorted = foodSearchIndex
    .filter(({ f, text }) => {
      if (q && !text.includes(q) && !(qx !== q && text.includes(qx))) return false;
      if (opts?.category && opts.category !== "all" && f.category !== opts.category) return false;
      if (opts?.diet && !f.diets.includes(opts.diet)) return false;
      if (opts?.excludeAllergens?.some(a => f.allergens.includes(a))) return false;
      return true;
    })
    .map(x => x.f)
    // Score = le meilleur (plus bas) entre la requête tapée et sa forme canonique,
    // pour ne pas pénaliser une correspondance directe quand un synonyme est appliqué.
    .sort((a, b) => scoreFood(a, q, qx) - scoreFood(b, q, qx) || a.name.localeCompare(b.name, "fr"));
  // Dédoublonnage : on ne garde que la première occurrence (la mieux classée) par nom normalisé,
  // pour éviter que des entrées Ciqual quasi identiques ne noient la liste.
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of sorted) {
    const key = normalizeFoodText(f.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
