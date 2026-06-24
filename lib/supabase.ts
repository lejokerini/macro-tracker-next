import { createClient } from "@supabase/supabase-js";

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createBrowserSupabaseClient() {
  // Next.js peut prerender la page côté serveur. On évite donc de créer
  // le client Supabase pendant le build Vercel.
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!isValidHttpUrl(url) || !key || key.includes("ta_publishable_key")) {
    console.warn("Supabase non configuré ou variables d'environnement invalides.");
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
