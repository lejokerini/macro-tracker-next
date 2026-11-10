// Coaching de Lilian Cattani, mis en avant dans l'app et sur la page d'accueil.
export const COACH = {
  name: "Lilian Cattani",
  whatsapp: "33666047902", // numéro au format international, sans le +
  siteUrl: "", // à remplir quand le site de coaching sera en ligne (bouton « Voir ses programmes »)
};

export function coachWhatsAppLink(message: string) {
  return `https://wa.me/${COACH.whatsapp}?text=${encodeURIComponent(message)}`;
}
