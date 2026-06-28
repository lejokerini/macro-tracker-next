# MacroTracker Pro — V9 Ciqual + UI premium

Application Next.js / TypeScript pour le suivi alimentaire : profils, journal macros, catalogue aliments, recettes, programme, courses, placard et poids.

## Nouveautés V9

- Base Ciqual/Anses 2025 intégrée : 3 484 aliments.
- Valeurs nutritionnelles par 100 g issues du fichier Excel officiel `Table Ciqual 2025_FR_2025_11_03.xlsx`.
- Bug corrigé : une recherche inconnue n'ajoute plus automatiquement « Baguette ».
- Recherche mieux triée par pertinence : correspondance exacte, début du nom, puis source fiable.
- Interface retravaillée : hero premium, badges, cartes, recettes en grille, responsive mobile plus propre.
- Base de 80 recettes conservée.
- Client Open Food Facts conservé pour une future recherche de produits de marque / codes-barres.
- Structure Supabase conservée pour la prochaine étape : connexion utilisateur et sauvegarde cloud.

## Lancer en local

```powershell
npm.cmd install
npm.cmd run dev
```

Puis ouvrir :

```text
http://localhost:3000
```

## Réimporter Ciqual si besoin

Le fichier officiel est placé dans :

```text
data-sources/ciqual.xlsx
```

Pour régénérer la base :

```powershell
npm.cmd run import:ciqual
```

Cela recrée :

```text
data/ciqual-foods.generated.ts
```

## Déployer

Après test local :

```powershell
git add .
git commit -m "Add Ciqual database and premium UI"
git push
```

Vercel redéploiera automatiquement.

## V10 — quantités ajustables

Cette version ajoute un sélecteur de quantité dans le journal et le placard : boutons +/- 10 g, quantités rapides (25 g, 50 g, 100 g, 150 g, 200 g, 250 g, 300 g, 500 g) et aperçu macros recalculé selon la quantité choisie.

Les données Ciqual restent stockées pour 100 g de partie comestible, mais l'application convertit automatiquement les calories et macros selon la quantité saisie.

## V18 - Robustesse Supabase/Vercel

Cette version empêche le build Vercel de planter si les variables Supabase sont absentes ou mal saisies.
Pour activer la sauvegarde cloud, vérifier dans Vercel :

- `NEXT_PUBLIC_SUPABASE_URL` doit être une URL complète, par exemple `https://xxxx.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` doit contenir la publishable key Supabase, sans texte ajouté avant/après.

Ne jamais utiliser la clé `service_role` dans le front.


## V20
- Renommage de l’onglet Sauvegarde en Mon compte.
- Page compte clarifiée : cloud, auto-sauvegarde et sauvegarde locale.

## V21 - Open Food Facts intelligent

- Recherche produit de marque via Open Food Facts en direct.
- Recherche possible par nom ou code-barres.
- Carte produit avec image, marque, code-barres, portion et badge source.
- Les produits Open Food Facts ajoutés au journal/placard sont conservés dans la sauvegarde locale et cloud.

## CalSnap — Snap photo → calories (nouveau)

Première brique de **CalSnap** (le « Snapchat des calories », inspiré de Cal AI) : on prend
un repas en photo et l'IA estime les calories et les macros, puis on ajoute au journal.

- Bouton **« 📸 Snap mon repas »** sur le Dashboard et dans le Journal.
- Capture caméra ou import d'image → analyse par **Claude vision** via une route serveur
  sécurisée (`app/api/scan-photo`).
- Détection multi-aliments (une assiette = plusieurs items), portion et macros **éditables**
  avant validation.
- Les aliments scannés sont enregistrés comme aliments estimés et sauvegardés (local + cloud).

### Configuration requise

La reconnaissance photo a besoin d'**au moins une clé** (côté serveur, jamais `NEXT_PUBLIC_`).
Si les deux sont présentes, Gemini (gratuit) est prioritaire.

**Option gratuite (recommandée) — Google Gemini :**

- Crée une clé sur https://aistudio.google.com/app/apikey (gratuit, ~1500 req/jour).
- En local : `GEMINI_API_KEY=...` dans `.env.local`
- Sur Vercel : Settings → Environment Variables → `GEMINI_API_KEY`

**Option payante — Anthropic Claude :**

- `ANTHROPIC_API_KEY=...` (local) / Vercel → Environment Variables → `ANTHROPIC_API_KEY`

Puis installer la nouvelle dépendance et lancer :

```powershell
npm.cmd install
npm.cmd run dev
```

Sans la clé, le bouton Snap renvoie un message d'erreur explicite (le reste de l'app fonctionne).

Voir `CAHIER-DES-CHARGES-CALSNAP.md` (racine du dépôt) pour la feuille de route complète.

## V22 - Open Food Facts renforcé
- Recherche Open Food Facts améliorée avec correction des requêtes courtes/accentuées (`oré` -> `oreo`, `nutel` -> `nutella`, etc.).
- Tri prioritaire des produits avec image, marque, nutrition complète et produits France.
- Filtrage renforcé pour éviter les résultats absurdes quand la recherche est trop vague.
- Les produits sans image restent affichés avec une icône et une note de prudence.
