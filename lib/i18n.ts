// Fondation multilingue (i18n) de Macrolens.
// On ajoute les langues ici et on remplace progressivement les textes de l'UI par t("clé").
export type Lang = "fr" | "es";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

type Dict = Record<string, string>;

const fr: Dict = {
  // Onglets
  "tab.dashboard": "Dashboard",
  "tab.profil": "Profil",
  "tab.journal": "Journal",
  "tab.catalogue": "Catalogue",
  "tab.recettes": "Recettes",
  "tab.programme": "Programme",
  "tab.courses": "Courses",
  "tab.placard": "Placard",
  "tab.poids": "Poids",
  "tab.progres": "Progrès",
  "tab.sauvegarde": "Mon compte",
  // Navigation basse
  "nav.home": "Accueil",
  "nav.journal": "Journal",
  "nav.foods": "Aliments",
  "nav.menu": "Menu",
  // Thème
  "theme.dark": "🌙 Sombre",
  "theme.light": "☀️ Clair",
  "theme.darkFull": "🌙 Thème sombre",
  "theme.lightFull": "☀️ Thème clair",
  // Menu (feuille)
  "menu.title": "Menu",
  "menu.groupTracking": "Suivi",
  "menu.progress": "📈 Progrès",
  "menu.weight": "⚖️ Poids",
  "menu.groupKitchen": "Cuisine & planning",
  "menu.recipes": "🍳 Recettes",
  "menu.program": "🗓️ Programme",
  "menu.shopping": "🛒 Courses",
  "menu.pantry": "🧺 Placard",
  "menu.groupAccount": "Mon compte",
  "menu.profile": "👤 Profil",
  "menu.account": "☁️ Mon compte",
  "menu.groupAppearance": "Apparence",
  // Onboarding
  "onboarding.welcome": "👋 Bienvenue sur Macrolens",
  "onboarding.text": "Crée ton profil pour calculer tes calories et macros personnalisées, puis prends ton premier repas en photo.",
  "onboarding.createProfile": "Créer mon profil",
  "onboarding.trySnap": "📸 Essayer le snap",
  // Commun
  "common.language": "Langue",
};

const es: Dict = {
  "tab.dashboard": "Panel",
  "tab.profil": "Perfil",
  "tab.journal": "Diario",
  "tab.catalogue": "Catálogo",
  "tab.recettes": "Recetas",
  "tab.programme": "Programa",
  "tab.courses": "Compras",
  "tab.placard": "Despensa",
  "tab.poids": "Peso",
  "tab.progres": "Progreso",
  "tab.sauvegarde": "Mi cuenta",
  "nav.home": "Inicio",
  "nav.journal": "Diario",
  "nav.foods": "Alimentos",
  "nav.menu": "Menú",
  "theme.dark": "🌙 Oscuro",
  "theme.light": "☀️ Claro",
  "theme.darkFull": "🌙 Tema oscuro",
  "theme.lightFull": "☀️ Tema claro",
  "menu.title": "Menú",
  "menu.groupTracking": "Seguimiento",
  "menu.progress": "📈 Progreso",
  "menu.weight": "⚖️ Peso",
  "menu.groupKitchen": "Cocina y planificación",
  "menu.recipes": "🍳 Recetas",
  "menu.program": "🗓️ Programa",
  "menu.shopping": "🛒 Compras",
  "menu.pantry": "🧺 Despensa",
  "menu.groupAccount": "Mi cuenta",
  "menu.profile": "👤 Perfil",
  "menu.account": "☁️ Mi cuenta",
  "menu.groupAppearance": "Apariencia",
  "onboarding.welcome": "👋 Bienvenido a Macrolens",
  "onboarding.text": "Crea tu perfil para calcular tus calorías y macros personalizadas, y luego fotografía tu primera comida.",
  "onboarding.createProfile": "Crear mi perfil",
  "onboarding.trySnap": "📸 Probar la foto",
  "common.language": "Idioma",
};

const DICTS: Record<Lang, Dict> = { fr, es };

// Retourne une fonction de traduction pour la langue donnée.
// Repli : langue demandée -> français -> la clé elle-même (jamais de texte vide).
export function makeT(lang: Lang) {
  return (key: string): string => DICTS[lang]?.[key] ?? fr[key] ?? key;
}
