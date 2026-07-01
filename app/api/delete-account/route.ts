import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Supprime définitivement le compte de l'utilisateur (données cloud + compte d'authentification).
// Nécessite SUPABASE_SERVICE_ROLE_KEY côté serveur. Si absente, renvoie 501 et le client
// se rabat sur la suppression des seules données (via l'app).
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Suppression serveur non configurée." }, { status: 501 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return NextResponse.json({ error: "Session invalide." }, { status: 401 });
    }
    const userId = data.user.id;
    await admin.from("app_states").delete().eq("user_id", userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
