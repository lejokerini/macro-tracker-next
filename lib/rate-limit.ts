// Limiteur de requêtes simple, en mémoire, par adresse IP.
//
// Sur Vercel, chaque instance du serveur garde son propre compteur : c'est une
// protection de base contre les abus (script qui boucle, appels en rafale) pour
// éviter de vider le quota de l'API d'analyse, pas une garantie stricte.
// Pour une limite stricte et partagée, ajouter une règle « Rate Limit » dans
// Vercel → Firewall (voir le README).

export type RateRule = { limit: number; windowMs: number };
export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

export function createRateLimiter(rules: RateRule[]) {
  const hits = new Map<string, number[]>();
  const maxWindow = Math.max(...rules.map((r) => r.windowMs));
  let lastSweep = 0;

  function sweep(now: number) {
    if (now - lastSweep < 60_000 && hits.size < 5_000) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] >= maxWindow) hits.delete(key);
    }
  }

  return function check(key: string, now = Date.now()): RateResult {
    const times = (hits.get(key) || []).filter((t) => now - t < maxWindow);
    for (const rule of rules) {
      const inWindow = times.filter((t) => now - t < rule.windowMs);
      if (inWindow.length >= rule.limit) {
        hits.set(key, times);
        const retryAfterSec = Math.max(1, Math.ceil((inWindow[0] + rule.windowMs - now) / 1000));
        return { ok: false, retryAfterSec };
      }
    }
    times.push(now);
    hits.set(key, times);
    sweep(now);
    return { ok: true };
  };
}

// Adresse du client telle que transmise par Vercel. En IPv6, on regroupe par
// préfixe /64 (un même appareil ou foyer peut changer d'adresse dans ce bloc).
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  if (!ip) return "inconnu";
  if (!ip.includes(":")) return ip;
  if (ip.toLowerCase().startsWith("::ffff:") && ip.includes(".")) return ip.slice(7);
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export function retryMessage(retryAfterSec: number): string {
  if (retryAfterSec >= 3600) {
    const hours = Math.ceil(retryAfterSec / 3600);
    return `Trop d'analyses photo aujourd'hui depuis cette connexion. Réessaie dans ${hours} h, ou utilise le code-barres / la recherche.`;
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Trop d'analyses photo d'affilée. Réessaie dans ${minutes} min.`;
}
