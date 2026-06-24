
/*
  Import Ciqual/Anses XML -> data/ciqual-foods.generated.ts

  Fichiers attendus dans data-sources/ :
    - alim_2025_11_03.xml   : liste des aliments
    - const_2025_11_03.xml  : liste des constituants
    - compo_2025_11_03.xml  : valeurs nutritionnelles par aliment et constituant

  Les deux premiers fichiers ne contiennent PAS les calories/protéines/glucides/lipides.
  Le fichier compo est indispensable pour générer une base nutritionnelle fiable.

  Usage : npm.cmd run import:ciqual:xml
*/
const fs = require('fs');
const path = require('path');

const base = path.join(process.cwd(), 'data-sources');
const alimPath = path.join(base, 'alim_2025_11_03.xml');
const constPath = path.join(base, 'const_2025_11_03.xml');
const compoPath = path.join(base, 'compo_2025_11_03.xml');
const outputPath = path.join(process.cwd(), 'data', 'ciqual-foods.generated.ts');

function fail(message) { console.error('\n' + message + '\n'); process.exit(1); }
for (const p of [alimPath, constPath]) if (!fs.existsSync(p)) fail(`Fichier introuvable : ${p}`);
if (!fs.existsSync(compoPath)) {
  fail(`Il manque le fichier indispensable : ${compoPath}\nTu as bien ajouté alim + const, mais il faut aussi le fichier compo_2025_11_03.xml pour avoir les vraies valeurs nutritionnelles.`);
}
function text(s, tag) { const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim().replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&') : ''; }
function blocks(xml, tag) { return Array.from(xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g')), m => m[0]); }
function normalize(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe'); }
function slugify(s) { return normalize(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80); }
function num(v) { if (!v || v==='-' || /traces/i.test(v)) return 0; const n=Number(String(v).replace(',','.').replace('<','').replace('>','').replace(/[^0-9.\-]/g,'')); return Number.isFinite(n)?n:0; }
const groupMap = { '00':'Autres', '01':'Plats composés', '02':'Fruits & Légumes', '03':'Céréales & Féculents', '04':'Viandes, Poissons & Protéines', '05':'Produits Laitiers & Crèmerie', '06':'Boissons', '07':'Plaisirs sucrés', '08':'Glaces & desserts', '09':'Matières grasses', '10':'Épicerie & Condiments', '11':'Alimentation infantile' };
function inferState(name) { const n=normalize(name); if(/cru|crue|frais|fraiche/.test(n)) return 'brut'; if(/cuit|cuite|grille|bouilli|vapeur|roti/.test(n)) return 'cuit'; if(/egoutte|conserve|appertise/.test(n)) return 'egoutte'; if(/prepare|plat|pizza|quiche|sauce|soupe|gateau|preemballe/.test(n)) return 'prepare'; return 'standard'; }
function inferUnit(name) { const n=normalize(name); if(/lait|jus|eau|vin|biere|cidre|huile|vinaigre|sirop|boisson|soda/.test(n)) return 'ml'; if(/oeuf|banane|pomme |orange|kiwi|avocat|croissant/.test(n)) return 'piece'; return 'g'; }
function inferAllergens(name) { const n=normalize(name); const a=new Set(); if(/ble|pain|pate|pates|semoule|boulgour|farine|seitan|orge|epeautre|croissant|brioche/.test(n)) a.add('gluten'); if(/lait|beurre|yaourt|fromage|creme|emmental|comte|camembert|brie|chevre|mozzarella|parmesan|roquefort|cantal|skyr/.test(n)) a.add('lait'); if(/oeuf|mayonnaise/.test(n)) a.add('oeufs'); if(/soja|tofu|tempeh|miso|edamame/.test(n)) a.add('soja'); if(/amande|noisette|noix|pistache|cajou|pecan|pignon|chataigne/.test(n)) a.add('fruits_a_coque'); if(/saumon|thon|cabillaud|colin|truite|maquereau|sardine|merlu|sole|poisson|surimi/.test(n)) a.add('poisson'); if(/crevette|gambas|langoustine|crabe|homard|langouste/.test(n)) a.add('crustaces'); if(/moule|huitre|calamar|poulpe|saint-jacques|escargot/.test(n)) a.add('mollusques'); if(/sesame|tahini/.test(n)) a.add('sesame'); if(/moutarde/.test(n)) a.add('moutarde'); if(/celeri/.test(n)) a.add('celeri'); return [...a]; }
function inferDiets(name) { const n=normalize(name); const all=['omnivore','flexitarien','sans_porc']; const pork=/porc|jambon|lardon|saucisson|chorizo|andouillette|pate|rillettes/.test(n); const meat=/poulet|dinde|canard|boeuf|bœuf|steak|porc|jambon|agneau|veau|lapin|boudin|tripes|foie|saucisse|merguez|lardon|chorizo|pate|rillettes/.test(n); const fish=/saumon|thon|cabillaud|colin|truite|maquereau|sardine|hareng|merlu|sole|raie|crevette|gambas|moule|huitre|calamar|poulpe|crabe|homard|surimi|anchois|poisson/.test(n); const animal=/lait|beurre|yaourt|fromage|creme|oeuf|miel/.test(n); if(!pork) all.push('pescetarien'); if(!pork&&!meat&&!fish) all.push('vegetarien'); if(!pork&&!meat&&!fish&&!animal) all.push('vegan'); return [...new Set(all)]; }
const factors={leclerc:.92,intermarche:1,carrefour:1.06,auchan:1.03,lidl:.84,aldi:.82,monoprix:1.28};
function prices(category){ const c=normalize(category); let b=5; if(/cereal|pain|feculent/.test(c)) b=3; else if(/fruit|legume/.test(c)) b=3.8; else if(/viande|poisson|proteine/.test(c)) b=13.5; else if(/lait|cremerie/.test(c)) b=7; else if(/huile|matiere/.test(c)) b=6; return Object.fromEntries(Object.entries(factors).map(([k,v])=>[k, +(b*v).toFixed(2)])); }
function purchaseUnit(unit){ if(unit==='ml') return 'bouteille 1 L'; if(unit==='piece') return 'pièce'; return 'paquet 1 kg'; } function packageSize(unit){ return unit==='ml'?1000:unit==='piece'?1:1000; }

const alimXml = fs.readFileSync(alimPath,'utf8'); const constXml=fs.readFileSync(constPath,'utf8'); const compoXml=fs.readFileSync(compoPath,'utf8');
const aliments = new Map(blocks(alimXml,'ALIM').map(b => [text(b,'alim_code'), { code:text(b,'alim_code'), name:text(b,'alim_nom_fr'), group:text(b,'alim_grp_code') }]));
const consts = new Map(blocks(constXml,'CONST').map(b => [text(b,'const_code'), normalize(text(b,'const_nom_fr'))]));
function nutrientKey(code){ const n=consts.get(code)||''; if(n.includes('energie') && n.includes('kcal') && n.includes('1169')) return 'kcal'; if(n.startsWith('proteines') || n.includes('proteines, n x facteur')) return 'protein'; if(n.startsWith('glucides')) return 'carbs'; if(n.startsWith('lipides')) return 'fat'; if(n.includes('fibres alimentaires')) return 'fiber'; if(n.startsWith('sucres')) return 'sugars'; if(n.includes('sel chlorure')) return 'salt'; return null; }
const values = new Map();
for(const b of blocks(compoXml,'COMPO')) { const alim=text(b,'alim_code'); const c=text(b,'const_code'); const key=nutrientKey(c); if(!key) continue; const v=num(text(b,'teneur')); if(!values.has(alim)) values.set(alim,{}); values.get(alim)[key]=v; }
const foods=[];
for(const a of aliments.values()) { const v=values.get(a.code); if(!v || !Number.isFinite(v.kcal)) continue; const category=groupMap[a.group] || `Ciqual groupe ${a.group}`; const unit=inferUnit(a.name); foods.push({ id:`ciqual_${a.code || slugify(a.name)}`, name:a.name, category, state:inferState(a.name), unit, purchaseUnit:purchaseUnit(unit), packageSize:packageSize(unit), usableInRecipe:!/(alcool|vin|biere|whisky|rhum|vodka|pastis)/i.test(normalize(a.name)), diets:inferDiets(a.name), allergens:inferAllergens(a.name), prices:prices(category), macros:{ kcal:+(v.kcal||0).toFixed(1), protein:+(v.protein||0).toFixed(2), carbs:+(v.carbs||0).toFixed(2), fat:+(v.fat||0).toFixed(2), fiber:+(v.fiber||0).toFixed(2) }, micros:{ salt:+(v.salt||0).toFixed(2), sugars:+(v.sugars||0).toFixed(2) }, reliability:'precis', source:'ciqual', sourceRef:'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY', ciqualCode:String(a.code) }); }
fs.writeFileSync(outputPath, `import type { Food } from "@/lib/types";\n\n// Généré automatiquement depuis les XML Ciqual/Anses. Ne pas modifier à la main.\nexport const ciqualFoods: Food[] = ${JSON.stringify(foods,null,2)};\n`, 'utf8');
console.log(`OK: ${foods.length} aliments Ciqual générés dans ${outputPath}`);
