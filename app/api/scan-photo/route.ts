import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ScanItem } from "@/lib/calsnap";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
// gemini-2.0-flash a été arrêté le 01/06/2026 : on cible un modèle Flash gratuit récent.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedMedia = (typeof ALLOWED_MEDIA)[number];

const PROMPT = `Tu es un expert en nutrition. Analyse la photo d'un repas ou d'un aliment.
Identifie chaque aliment distinct visible (par exemple sur une assiette : féculent, protéine, légume séparés).
Pour CHAQUE aliment, estime la portion en grammes telle qu'elle apparaît sur la photo, puis les valeurs nutritionnelles TOTALES pour cette portion.
Réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ou après, exactement à ce format :
{"items":[{"name":"Riz blanc cuit","grams":150,"kcal":195,"protein":3.6,"carbs":42,"fat":0.5,"fiber":0.6,"confidence":"high"}]}
Règles :
- "name" en français, court et clair.
- "grams" = poids estimé de la portion visible.
- "kcal","protein","carbs","fat","fiber" = totaux pour la portion (pas pour 100 g).
- "confidence" = "high" | "medium" | "low" selon ta certitude.
- Si aucun aliment n'est identifiable, renvoie {"items":[]}.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
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

// --- Moteur gratuit : Google Gemini ---
async function analyzeWithGemini(base64: string, mediaType: AllowedMedia, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mediaType, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

// --- Moteur payant : Anthropic Claude ---
async function analyzeWithAnthropic(base64: string, mediaType: AllowedMedia, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!geminiKey && !anthropicKey) {
    return NextResponse.json(
      { error: "Aucune clé d'analyse configurée. Ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Vercel." },
      { status: 500 },
    );
  }

  let base64 = "";
  let mediaType: AllowedMedia = "image/jpeg";

  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image trop volumineuse (max 8 Mo)." }, { status: 400 });
    }
    const type = file.type as AllowedMedia;
    mediaType = ALLOWED_MEDIA.includes(type) ? type : "image/jpeg";
    const buffer = Buffer.from(await file.arrayBuffer());
    base64 = buffer.toString("base64");
  } catch {
    return NextResponse.json({ error: "Image illisible." }, { status: 400 });
  }

  try {
    // On privilégie Gemini (gratuit) s'il est configuré, sinon Anthropic.
    const text = geminiKey
      ? await analyzeWithGemini(base64, mediaType, geminiKey)
      : await analyzeWithAnthropic(base64, mediaType, anthropicKey!);
    const items = sanitizeItems(extractJson(text));
    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: `Analyse impossible : ${msg}` }, { status: 502 });
  }
}
