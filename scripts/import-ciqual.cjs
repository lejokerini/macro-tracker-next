/*
  Import Ciqual/Anses Excel -> data/ciqual-foods.generated.ts
  Usage Windows : npm.cmd run import:ciqual

  Fichier attendu par défaut : data-sources/ciqual.xlsx
  Source : Table de composition nutritionnelle des aliments Ciqual 2025.
*/
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const inputPath = process.argv[2] || path.join(process.cwd(), 'data-sources', 'ciqual.xlsx');
const outputPath = path.join(process.cwd(), 'data', 'ciqual-foods.generated.ts');

if (!fs.existsSync(inputPath)) {
  console.error(`Fichier introuvable: ${inputPath}`);
  console.error('Place le fichier Excel officiel Ciqual/Anses dans data-sources/ciqual.xlsx');
  process.exit(1);
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}
function num(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = String(v).trim().toLowerCase().replace(',', '.');
  if (!raw || raw === '-' || raw.includes('traces')) return 0;
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}
function round(v, dec = 2) {
  if (!Number.isFinite(v)) return 0;
  const x = Number(v.toFixed(dec));
  return Math.abs(x - Math.round(x)) < 1e-10 ? Math.round(x) : x;
}
function categoryLabel(groupCode, label) {
  const clean = String(label || '').replace(/\n/g, ' ').trim();
  if (clean) return clean[0].toUpperCase() + clean.slice(1);
  return {
    '00':'Aliments moyens / références','01':'Entrées et plats composés','02':'Fruits, légumes, légumineuses et oléagineux','03':'Produits céréaliers','04':'Viandes, œufs, poissons','05':'Produits laitiers','06':'Eaux et autres boissons','07':'Produits sucrés','08':'Glaces et sorbets','09':'Matières grasses','10':'Aides culinaires et ingrédients divers','11':'Aliments infantiles'
  }[String(groupCode || '')] || 'Ciqual';
}
function inferState(name) {
  const n = normalize(name);
  if (/\b(cru|crue|frais|fraiche)\b/.test(n)) return 'brut';
  if (/\b(cuit|cuite|grille|grillee|bouilli|vapeur|roti|rotie|poele|poelee)\b/.test(n)) return 'cuit';
  if (/egoutte|conserve|appertise/.test(n)) return 'egoutte';
  if (/prepare|plat|pizza|quiche|sauce|soupe|gateau|preemballe|compose|salade|dessert|sandwich|hamburger|tarte|gratin|poelee/.test(n)) return 'prepare';
  return 'standard';
}
function inferUnit(name) {
  const n = normalize(name);
  if (/\b(lait|jus|eau|vin|biere|cidre|huile|vinaigre|sirop|boisson|soda|cafe|the|infusion)\b/.test(n)) return 'ml';
  return 'g';
}
function inferPackageSize(name, unit) {
  const n = normalize(name);
  if (unit === 'ml') return 1000;
  if (/epice|poivre|sel|levure|safran|cannelle|vanille/.test(n)) return 50;
  if (/yaourt|dessert lacte|compote/.test(n)) return 500;
  if (/fromage|jambon|saumon fume|thon|sardine|conserve/.test(n)) return 200;
  return 1000;
}
function purchaseUnit(unit, size) {
  if (unit === 'ml') return size >= 1000 ? 'bouteille 1 L' : `flacon ${size} ml`;
  return size >= 1000 ? 'paquet 1 kg' : `format ${size} g`;
}
function inferAllergens(name) {
  const n = normalize(name); const a = new Set();
  if (/\b(ble|froment|pain|pates?|spaghetti|semoule|boulgour|farine|seitan|orge|epeautre|croissant|brioche|biscotte|couscous|pizza|quiche|tarte)\b/.test(n)) a.add('gluten');
  if (/\b(lait|beurre|yaourt|fromage|creme|emmental|comte|camembert|brie|chevre|mozzarella|parmesan|roquefort|cantal|skyr|lacte)\b/.test(n)) a.add('lait');
  if (/oeuf|oeufs|omelette|mayonnaise/.test(n)) a.add('oeufs');
  if (/\b(soja|tofu|tempeh|miso|edamame)\b/.test(n)) a.add('soja');
  if (/amande|noisette|noix|pistache|cajou|pecan|pignon|chataigne|marron/.test(n)) a.add('fruits_a_coque');
  if (/\b(saumon|thon|cabillaud|colin|truite|maquereau|sardine|hareng|merlu|sole|poisson|surimi|anchois|lieu|lotte|bar|dorade|morue)\b/.test(n)) a.add('poisson');
  if (/crevette|gambas|langoustine|crabe|homard|langouste/.test(n)) a.add('crustaces');
  if (/moule|huitre|calamar|poulpe|saint-jacques|coquille|escargot/.test(n)) a.add('mollusques');
  if (/sesame|tahini/.test(n)) a.add('sesame');
  if (/moutarde/.test(n)) a.add('moutarde');
  if (/celeri/.test(n)) a.add('celeri');
  if (/vin|biere|cidre|rhum|whisky|cognac|armagnac|vodka|liqueur|alcool/.test(n)) a.add('alcool');
  return [...a];
}
function inferDiets(name) {
  const n = normalize(name); const all = ['omnivore', 'flexitarien', 'sans_porc'];
  const pork = /porc|jambon|lardon|saucisson|chorizo|andouillette|rillettes|bacon|mortadelle/.test(n);
  const meat = /poulet|dinde|canard|boeuf|bœuf|steak|porc|jambon|agneau|veau|lapin|boudin|tripes|foie|saucisse|merguez|lardon|chorizo|rillettes|bacon|viande|volaille|charcuterie/.test(n);
  const fish = /saumon|thon|cabillaud|colin|truite|maquereau|sardine|hareng|merlu|sole|raie|crevette|gambas|moule|huitre|calamar|poulpe|crabe|homard|surimi|anchois|poisson|crustace|mollusque/.test(n);
  const animal = /lait|beurre|yaourt|fromage|creme|oeuf|miel|lacte/.test(n);
  if (!pork) all.push('pescetarien');
  if (!pork && !meat && !fish) all.push('vegetarien');
  if (!pork && !meat && !fish && !animal) all.push('vegan');
  return [...new Set(all)];
}
const factors = { leclerc:0.92, intermarche:1, carrefour:1.06, auchan:1.03, lidl:0.84, aldi:0.82, monoprix:1.28 };
function basePrice(category) {
  const c = normalize(category);
  if (/eaux|boissons/.test(c)) return 1.4;
  if (/fruits|legumes|legumineuses|oleagineux/.test(c)) return 3.8;
  if (/cereal/.test(c)) return 2.8;
  if (/viandes|oeufs|poissons/.test(c)) return 12.5;
  if (/laitiers/.test(c)) return 5.8;
  if (/matieres grasses/.test(c)) return 7.0;
  if (/aides culinaires|ingredients/.test(c)) return 5.5;
  if (/sucres|glaces|sorbets/.test(c)) return 6.5;
  if (/plats composes|entrees/.test(c)) return 8.5;
  if (/infantiles/.test(c)) return 10.0;
  return 5.0;
}
function prices(category) { const b = basePrice(category); return Object.fromEntries(Object.entries(factors).map(([k,v]) => [k, round(b*v, 2)])); }

const wb = XLSX.readFile(inputPath, { cellDates:false });
const sheet = wb.Sheets['composition nutritionnelle'] || wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });
const foods = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const code = String(r[6] || '').trim();
  const name = String(r[7] || '').replace(/\n/g, ' ').trim();
  if (!code || !name) continue;
  const category = categoryLabel(r[0], r[3]);
  const unit = inferUnit(name);
  const size = inferPackageSize(name, unit);
  const micros = {
    sugars: round(num(r[18]),2), salt: round(num(r[49]),2), calcium: round(num(r[50]),2), iron: round(num(r[53]),2), magnesium: round(num(r[55]),2), potassium: round(num(r[58]),2), sodium: round(num(r[60]),2), zinc: round(num(r[61]),2), vitA: round(num(r[62]),2), vitD: round(num(r[65]),2), vitE: round(num(r[69]),2), vitC: round(num(r[72]),2), vitB1: round(num(r[73]),2), vitB2: round(num(r[74]),2), vitB3: round(num(r[75]),2), vitB6: round(num(r[77]),2), vitB9: round(num(r[78]),2), vitB12: round(num(r[82]),2)
  };
  Object.keys(micros).forEach(k => { if (micros[k] === 0) delete micros[k]; });
  foods.push({
    id:`ciqual_${code}`, name, category, state:inferState(name), unit,
    purchaseUnit:purchaseUnit(unit, size), packageSize:size,
    usableInRecipe: !/alcool|vin|biere|cidre|whisky|rhum|vodka|liqueur|pastis|eau minerale|eau gazeuse/.test(normalize(name)),
    diets:inferDiets(name), allergens:inferAllergens(name), prices:prices(category),
    macros:{ kcal:round(num(r[10]),1), protein:round(num(r[14]),2), carbs:round(num(r[16]),2), fat:round(num(r[17]),2), fiber:round(num(r[26]),2) },
    micros, reliability:'precis', source:'ciqual', sourceRef:'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY', ciqualCode:code
  });
}
const file = `import type { Food } from "@/lib/types";\n\n// Généré depuis le fichier Excel officiel Ciqual/Anses 2025.\n// Les valeurs nutritionnelles sont exprimées pour 100 g de partie comestible.\n// Source : Anses, Table de composition nutritionnelle des aliments Ciqual 2025.\nexport const CIQUAL_FOOD_COUNT = ${foods.length};\n\nexport const ciqualFoods: Food[] = ${JSON.stringify(foods)};\n`;
fs.writeFileSync(outputPath, file, 'utf8');
console.log(`OK: ${foods.length} aliments Ciqual générés dans ${outputPath}`);
