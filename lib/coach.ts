// Coaching de Lilian Cattani, mis en avant dans l'app et sur la page d'accueil.
export const COACH = {
  name: "Lilian Cattani",
  whatsapp: "33666047902", // numéro au format international, sans le +
  phone: "06 66 04 79 02",
  email: "contact.liliancattani@gmail.com",
  title: "Coach sportif · Éducateur sportif diplômé",
  specialties: ["Préparation physique", "Boxe et sports de combat", "Nutrition sportive"],
  area: "Toulon et Hyères · en salle, en extérieur, à domicile ou en visio",
  cartePro: "08326ED0431",
  siteUrl: "", // à remplir quand le site de coaching sera en ligne (bouton « Voir ses programmes »)
};

// Adresse de la carte de visite digitale (celle qu'ouvrent la puce NFC et le QR code).
export const CARD_PATH = "/carte";

export function coachWhatsAppLink(message: string) {
  return `https://wa.me/${COACH.whatsapp}?text=${encodeURIComponent(message)}`;
}
