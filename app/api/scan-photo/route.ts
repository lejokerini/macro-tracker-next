import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ScanItem } from "@/lib/calsnap";
import { clientKey, createRateLimiter, retryMessage } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Modèles d'analyse. Google et Anthropic retirent régulièrement leurs anciens
// modèles : on essaie le modèle choisi (variable d'environnement), puis des
// modèles récents, et on passe au suivant si l'un d'eux n'existe plus (404).
// Pour changer de modèle sans toucher au code : GEMINI_MODEL / ANTHROPIC_MODEL dans Vercel.
const GEMINI_MODELS = uniq([
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
]);
const ANTHROPIC_MODELS = uniq([process.env.ANTHROPIC_MODEL, "claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-4-6"]);

function uniq(list: (string | undefined)[]) {
  return Array.from(new Set(list.map((m) => m?.trim()).filter((m): m is string => !!m)));
}

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedMedia = (typeof ALLOWED_MEDIA)[number];

function langName(lang: string) {
  return lang === "es" ? "espagnol" : "français";
}
function formatRules(lang: string) {
  return `Réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ou après, exactement à ce format :
{"items":[{"name":"Riz blanc cuit","grams":150,"kcal":195,"protein":3.6,"carbs":42,"fat":0.5,"fiber":0.6,"confidence":"high"}]}
Règles :
- "name" en ${langName(lang)}, court et clair.
- "grams" = poids estimé de la portion.
- "kcal","protein","carbs","fat","fiber" = totaux pour la portion (pas pour 100 g).
- "confidence" = "high" | "medium" | "low" selon ta certitude.
- Si rien n'est identifiable, renvoie {"items":[]}.`;
}

// Points communs aux analyses photo et texte : ne pas oublier les calories cachées.
const HIDDEN_CALORIES = `Repère AUSSI les éléments souvent oubliés mais riches en calories, et ajoute-les comme aliments distincts même s'ils sont partiellement visibles ou seulement probables :
- sauces et vinaigrettes (tomate, crème, béchamel, soja, ketchup, mayonnaise, moutarde, pesto, curry, barbecue...) ;
- matières grasses de cuisson : huile, beurre, margarine, crème ;
- ajouts : fromage râpé, lardons, graines, noix, croûtons, sucre, sirop, miel.
Déduis le mode de cuisson : un aliment frit, pané ou poêlé contient de l'huile ajoutée (compte environ 5 à 15 g d'huile selon la portion) ; un plat en sauce contient de la matière grasse.
Si une sauce nappe le plat sans être identifiable, ajoute une ligne « Sauce » avec une estimation prudente.`;

function buildPrompt(opts: { hasImage: boolean; text?: string; hint?: string; lang: string }) {
  const rules = formatRules(opts.lang);
  if (!opts.hasImage && opts.text) {
    return `Tu es un expert en nutrition. Voici la description d'un repas écrite par l'utilisateur : « ${opts.text} ».
Identifie chaque aliment, estime les portions en grammes et les valeurs nutritionnelles.
${HIDDEN_CALORIES}
${rules}`;
  }
  let p = `Tu es un expert en nutrition. Analyse la photo d'un repas ou d'un aliment.
Identifie chaque aliment distinct visible (par exemple sur une assiette : féculent, protéine, légume séparés).
Pour CHAQUE aliment, estime la portion en grammes telle qu'elle apparaît sur la photo, puis les valeurs nutritionnelles.
${HIDDEN_CALORIES}
Pour un plat composé (burger, pizza, lasagnes, sandwich, wrap, plat en sauce, salade composée), soit tu détailles les composants principaux, soit tu donnes une seule ligne avec des totaux réalistes qui INCLUENT la sauce et les matières grasses. Ne sous-estime pas : mieux vaut une estimation légèrement haute qu'un repas dont il manque la moitié des calories.`;
  if (opts.hint) p += `\nCorrection importante donnée par l'utilisateur, à respecter en priorité : « ${opts.hint} ».`;
  if (opts.text) p += `\nIndication de l'utilisateur sur le contenu : « ${opts.text} ».`;
  return `${p}\n${rules}`;
}

// Lecture du tableau nutritionnel d'un emballage (produit absent d'Open Food Facts).
function buildLabelPrompt(lang: string) {
  return `Tu lis l'étiquette d'un produit alimentaire en photo (tableau des valeurs nutritionnelles, et si visibles le nom et la marque).
Recopie les valeurs POUR 100 g (ou 100 ml pour une boisson). Si le tableau ne donne que des valeurs par portion, convertis-les pour 100 g à partir du poids de la portion indiqué.
N'invente rien : si une valeur n'est pas lisible, mets null. Si la photo ne montre pas de tableau nutritionnel lisible, renvoie {"label":null}.
Réponds UNIQUEMENT avec du JSON valide, sans texte autour, exactement à ce format :
{"label":{"name":"Yaourt grec nature","brand":"Marque","per":"100g","kcal":97,"protein":9,"carbs":4,"fat":5,"fiber":0,"sugars":4,"salt":0.1,"servingGrams":150}}
Règles : "name" en ${langName(lang)} ; "per" = "100g" ou "100ml" ; "servingGrams" = poids d'une portion ou d'une unité si indiqué, sinon null ; nombres avec un point décimal.`;
}

type LabelValues = {
  name: string; brand?: string; per: "100g" | "100ml";
  kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugars?: number; salt?: number; servingGrams?: number;
};

function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const x = num(v);
  return x > 0 ? x : undefined;
}

function sanitizeLabel(parsed: unknown): LabelValues | null {
  const r = (parsed as { label?: unknown })?.label as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== "object") return null;
  const protein = num(r.protein), carbs = num(r.carbs), fat = num(r.fat);
  let kcal = num(r.kcal);
  if (!kcal && (protein || carbs || fat)) kcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
  // Valeurs impossibles pour 100 g : on préfère ne rien proposer.
  if (!kcal || kcal > 950 || protein + carbs + fat > 105) return null;
  return {
    name: String(r.name ?? "").trim().slice(0, 80),
    brand: String(r.brand ?? "").trim().slice(0, 60) || undefined,
    per: r.per === "100ml" ? "100ml" : "100g",
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: Math.round(num(r.fiber) * 10) / 10,
    sugars: optNum(r.sugars),
    salt: optNum(r.salt),
    servingGrams: optNum(r.servingGrams) ? Math.round(optNum(r.servingGrams)!) : undefined,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

function num(v: unknown): number {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) && x >= 0 ? x : 0;
}

function sanitizeItems(parsed: unknown): ScanItem[] {
  const rawItems = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((raw): ScanItem | null => {
      const r = raw as Record<string, unknown>;
      const name = String(r.name ?? "").trim();
      if (!name) return null;
      const confidence = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
      return {
        name,
        grams: Math.round(num(r.grams)) || 100,
        kcal: Math.round(num(r.kcal)),
        protein: num(r.protein),
        carbs: num(r.carbs),
        fat: num(r.fat),
        fiber: num(r.fiber),
        confidence,
      };
    })
    .filter((x): x is ScanItem => x !== null)
    .slice(0, 12);
}

type ImageInput = { base64: string; mediaType: AllowedMedia } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function geminiRequest(model: string, prompt: string, image: ImageInput, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts: unknown[] = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Marge large : sur les modèles récents, la réflexion interne compte dans la limite de sortie.
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } }),
  });
}

let workingGeminiModel: string | null = null;

async function analyzeWithGemini(prompt: string, image: ImageInput, apiKey: string): Promise<string> {
  // Modèles dans l'ordre ; modèle retiré (404) → suivant ; surcharge (503/429) → on
  // retente un peu puis on passe au suivant. Le premier modèle qui marche est retenu
  // pour les requêtes suivantes de cette instance.
  let overloaded = false;
  const start = Math.max(0, GEMINI_MODELS.indexOf(workingGeminiModel || ""));
  const ordered = [...GEMINI_MODELS.slice(start), ...GEMINI_MODELS.slice(0, start)];
  for (const model of ordered) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await geminiRequest(model, prompt, image, apiKey);
      if (res.ok) {
        workingGeminiModel = model;
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        return (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
      }
      if (res.status === 404 || (res.status === 400 && /not found|not supported|unknown model/i.test(await res.clone().text().catch(() => "")))) {
        if (workingGeminiModel === model) workingGeminiModel = null;
        break; // modèle indisponible : on passe au suivant
      }
      if (res.status === 503 || res.status === 429) {
        overloaded = true;
        await sleep(600 * (attempt + 1));
        continue;
      }
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status} ${detail.slice(0, 120)}`);
    }
  }
  throw new Error(overloaded ? "Service d'analyse occupé ou quota du jour atteint. Réessaie dans un moment, ou scanne le code-barres / cherche l'aliment (gratuit et illimité)." : "Service d'analyse indisponible pour le moment.");
}

async function analyzeWithAnthropic(prompt: string, image: ImageInput, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const content: Anthropic.ContentBlockParam[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
  content.push({ type: "text", text: prompt });
  let lastError: unknown = null;
  for (const model of ANTHROPIC_MODELS) {
    try {
      const message = await client.messages.create({ model, max_tokens: 2000, messages: [{ role: "user", content }] });
      const textBlock = message.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    } catch (error) {
      // Modèle retiré ou inconnu : on essaie le suivant. Toute autre erreur est remontée.
      const status = (error as { status?: number })?.status;
      if (status !== 404) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Aucun modèle Anthropic disponible.");
}

// N'accepte que les requêtes venant du même domaine que l'app (bloque les appels
// directs / cross-site qui viendraient piller le quota). Vérifie que l'Origin (ou le
// Referer) a le même host que la requête, sans domaine codé en dur.
function sameOriginOnly(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return true;
  const src = req.headers.get("origin") || req.headers.get("referer");
  if (!src) return false;
  try {
    return new URL(src).host === host;
  } catch {
    return false;
  }
}

// Garde-fou côté serveur, par connexion : 10 analyses / 10 min et 60 / jour.
// (L'app limite déjà à 5 / jour en gratuit et 50 / jour en Premium.)
const scanLimiter = createRateLimiter([
  { limit: 10, windowMs: 10 * 60_000 },
  { limit: 60, windowMs: 24 * 60 * 60_000 },
]);

export async function POST(req: Request) {
  if (!sameOriginOnly(req)) {
    return NextResponse.json({ error: "Requête non autorisée." }, { status: 403 });
  }
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!geminiKey && !anthropicKey) {
    return NextResponse.json({ error: "Aucune clé d'analyse configurée. Ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Vercel." }, { status: 500 });
  }
  const limit = scanLimiter(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfterSec) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let image: ImageInput = null;
  let text = "";
  let hint = "";
  let lang = "fr";
  let mode: "meal" | "label" = "meal";

  try {
    const form = await req.formData();
    mode = String(form.get("mode") || "") === "label" ? "label" : "meal";
    const file = form.get("image");
    text = String(form.get("text") || "").trim().slice(0, 500);
    hint = String(form.get("hint") || "").trim().slice(0, 300);
    lang = String(form.get("lang") || "fr").trim() === "es" ? "es" : "fr";
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Image trop volumineuse (max 8 Mo)." }, { status: 400 });
      }
      const type = file.type as AllowedMedia;
      const mediaType = ALLOWED_MEDIA.includes(type) ? type : "image/jpeg";
      const buffer = Buffer.from(await file.arrayBuffer());
      image = { base64: buffer.toString("base64"), mediaType };
    }
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  if (!image && !text) {
    return NextResponse.json({ error: "Fournis une photo ou une description du repas." }, { status: 400 });
  }

  if (mode === "label" && !image) {
    return NextResponse.json({ error: "Prends en photo le tableau nutritionnel du produit." }, { status: 400 });
  }

  try {
    const prompt = mode === "label" ? buildLabelPrompt(lang) : buildPrompt({ hasImage: !!image, text, hint, lang });
    const out = geminiKey
      ? await analyzeWithGemini(prompt, image, geminiKey)
      : await analyzeWithAnthropic(prompt, image, anthropicKey!);
    if (mode === "label") {
      const label = sanitizeLabel(extractJson(out));
      if (!label) return NextResponse.json({ error: "Tableau nutritionnel illisible. Reprends la photo bien à plat et nette, ou saisis les valeurs à la main." }, { status: 422 });
      return NextResponse.json({ label });
    }
    const items = sanitizeItems(extractJson(out));
    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: `Analyse impossible : ${msg}` }, { status: 502 });
  }
}
