import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ScanItem } from "@/lib/calsnap";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedMedia = (typeof ALLOWED_MEDIA)[number];

const FORMAT_RULES = `Réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ou après, exactement à ce format :
{"items":[{"name":"Riz blanc cuit","grams":150,"kcal":195,"protein":3.6,"carbs":42,"fat":0.5,"fiber":0.6,"confidence":"high"}]}
Règles :
- "name" en français, court et clair.
- "grams" = poids estimé de la portion.
- "kcal","protein","carbs","fat","fiber" = totaux pour la portion (pas pour 100 g).
- "confidence" = "high" | "medium" | "low" selon ta certitude.
- Si rien n'est identifiable, renvoie {"items":[]}.`;

function buildPrompt(opts: { hasImage: boolean; text?: string; hint?: string }) {
  if (!opts.hasImage && opts.text) {
    return `Tu es un expert en nutrition. Voici la description d'un repas écrite par l'utilisateur : « ${opts.text} ».
Identifie chaque aliment, estime les portions en grammes et les valeurs nutritionnelles.
${FORMAT_RULES}`;
  }
  let p = `Tu es un expert en nutrition. Analyse la photo d'un repas ou d'un aliment.
Identifie chaque aliment distinct visible (par exemple sur une assiette : féculent, protéine, légume séparés).
Pour CHAQUE aliment, estime la portion en grammes telle qu'elle apparaît sur la photo, puis les valeurs nutritionnelles.`;
  if (opts.hint) p += `\nCorrection importante donnée par l'utilisateur, à respecter en priorité : « ${opts.hint} ».`;
  if (opts.text) p += `\nIndication de l'utilisateur sur le contenu : « ${opts.text} ».`;
  return `${p}\n${FORMAT_RULES}`;
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
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" } }),
  });
}

async function analyzeWithGemini(prompt: string, image: ImageInput, apiKey: string): Promise<string> {
  // Modèle principal puis repli léger ; on retente en cas de surcharge (503/429).
  const models = Array.from(new Set([GEMINI_MODEL, "gemini-2.5-flash-lite"]));
  let overloaded = false;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await geminiRequest(model, prompt, image, apiKey);
      if (res.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
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
  const message = await client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1500, messages: [{ role: "user", content }] });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
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

export async function POST(req: Request) {
  if (!sameOriginOnly(req)) {
    return NextResponse.json({ error: "Requête non autorisée." }, { status: 403 });
  }
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!geminiKey && !anthropicKey) {
    return NextResponse.json({ error: "Aucune clé d'analyse configurée. Ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Vercel." }, { status: 500 });
  }

  let image: ImageInput = null;
  let text = "";
  let hint = "";

  try {
    const form = await req.formData();
    const file = form.get("image");
    text = String(form.get("text") || "").trim().slice(0, 500);
    hint = String(form.get("hint") || "").trim().slice(0, 300);
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

  try {
    const prompt = buildPrompt({ hasImage: !!image, text, hint });
    const out = geminiKey
      ? await analyzeWithGemini(prompt, image, geminiKey)
      : await analyzeWithAnthropic(prompt, image, anthropicKey!);
    const items = sanitizeItems(extractJson(out));
    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: `Analyse impossible : ${msg}` }, { status: 502 });
  }
}
