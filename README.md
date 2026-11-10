# Macrolens — suivi calories & macros (Next.js)

> Dernière version : **V23** (voir en bas de page). Historique des versions ci-dessous.

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

## V23 - Fiabilité, mentions légales et programmes Lilian Cattani

- **Versions figées** : les dépendances ne sont plus en `latest`, et `package-lock.json` est versionné. Un même commit donne toujours le même build (Vercel utilise le fichier de verrouillage). Pour mettre à jour une dépendance : `npm install paquet@version`, tester, puis committer `package.json` et `package-lock.json` ensemble.
- **Mentions légales** : nouvelle page `/mentions-legales` (éditeur, hébergeur, sources des données, avertissement santé), liée depuis l'accueil et l'onglet « Mon compte ». Les coordonnées sont regroupées en haut de `app/mentions-legales/page.tsx`. La politique de confidentialité indique désormais le responsable du traitement.
- **Analyse photo protégée** : `/api/scan-photo` limite les appels à 10 par 10 minutes et 60 par jour et par connexion (`lib/rate-limit.ts`), pour éviter qu'un script vide le quota Gemini / Anthropic. Voir « Protection de l'analyse photo » ci-dessous.
- **Programmes Lilian Cattani** : dans le profil, le champ « Programme Lilian Cattani » (prise de masse, sèche, remise en forme, prépa combat) calcule les calories et les macros exactement comme le carnet de suivi Excel (Mifflin-St Jeor, maintien arrondi à 10 kcal, calories arrondies à 50 kcal, plancher 1 500 / 1 200 kcal, protéines et lipides en g/kg). L'objectif se règle tout seul, et le conseil de l'onglet Poids suit la zone de variation du programme (±150 kcal après deux semaines hors zone).
- **Coaching** : carte « Coaching avec Lilian Cattani » dans le profil et section sur la page d'accueil (contact WhatsApp). Le lien du site de coaching se renseigne dans `lib/coach.ts` (`siteUrl`).
- **Correctif** : le « maintien théorique » de l'onglet Poids ne reprend plus les calories fixées à la main.
- **Chargement plus léger** : les fenêtres (photo, code-barres, masse grasse, recettes…) sont chargées à la demande ; le lecteur de code-barres ne pèse plus sur l'ouverture de l'app.
- **Code** : les petits composants d'affichage sont sortis de `MacroTrackerApp.tsx` (`components/app-widgets.tsx`, `lib/micros.ts`).
- Routes d'images (`/api/icon`, `/api/feature-graphic`) passées du runtime Edge au runtime Node.js (recommandé par Next.js).

## Sauvegarde cloud et comptes (Supabase)

L'app fonctionne sans compte (données dans le navigateur). Pour activer les comptes et la synchronisation entre appareils :

1. Crée un projet gratuit sur https://supabase.com (région Europe, par exemple Paris ou Francfort).
2. Dans **SQL Editor**, colle tout le contenu de `supabase/schema.sql` puis clique sur **Run**. Les tables sont protégées par des règles d'accès (chaque utilisateur ne voit que ses propres données).
3. Dans **Project Settings → API Keys** (ou **API**), récupère :
   - l'URL du projet (`https://xxxx.supabase.co`) ;
   - la clé publique (*publishable* / *anon*) ;
   - la clé secrète (*secret* / *service_role*).
4. Dans Vercel → **Settings → Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` = l'URL du projet ;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clé publique ;
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé secrète (**jamais** avec le préfixe `NEXT_PUBLIC_` : elle reste côté serveur et sert uniquement à supprimer un compte).
5. Dans Supabase → **Authentication → URL Configuration** :
   - **Site URL** : `https://tracker-calorique.vercel.app`
   - **Redirect URLs** : ajoute `https://tracker-calorique.vercel.app/**`
6. Redéploie sur Vercel, puis teste dans l'onglet « Mon compte » : créer un compte, confirmer l'e-mail, sauvegarder, puis charger depuis un autre appareil.

En local, mets les mêmes variables dans `.env.local` (ce fichier n'est jamais envoyé sur GitHub).

## Protection de l'analyse photo

La limite intégrée (`lib/rate-limit.ts`) est gardée en mémoire par chaque instance du serveur : elle arrête les abus simples, mais deux instances Vercel ne partagent pas leur compteur. Pour une limite stricte :

1. Vercel → ton projet → **Firewall** → **Configure** → **New Rule**.
2. Condition : *Request Path* égal à `/api/scan-photo`.
3. Action : **Rate Limit**, par exemple 20 requêtes par 10 minutes, comptées par adresse IP, avec la réponse 429 par défaut (l'offre gratuite Hobby autorise une règle de ce type par projet).
4. Enregistre et publie la règle.

Pense aussi à fixer un plafond de dépenses chez Google AI Studio ou Anthropic.

