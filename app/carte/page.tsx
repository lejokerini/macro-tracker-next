import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CARD_PATH, COACH, coachWhatsAppLink } from "@/lib/coach";
import ShareButton from "./ShareButton";
import styles from "./carte.module.css";

// Carte de visite digitale de Lilian Cattani : c'est la page qu'ouvrent la puce NFC
// de la carte physique et son QR code. Aucune photo, à la demande de Lilian.

export const metadata: Metadata = {
  title: "Lilian Cattani · Coach sportif à Toulon et Hyères",
  description: "Préparation physique, boxe et sports de combat, nutrition sportive. Éducateur sportif diplômé, en présentiel et en visio.",
  openGraph: {
    title: "Lilian Cattani · Coach sportif",
    description: "Préparation physique, boxe et sports de combat, nutrition sportive à Toulon et Hyères.",
    type: "profile",
  },
  // La carte n'est pas une page de l'application : pas de manifeste d'installation.
  manifest: null,
};

export const viewport: Viewport = {
  themeColor: "#13213B",
};

const telHref = `tel:+33${COACH.phone.replace(/\s/g, "").slice(1)}`;

export default function CartePage() {
  const whatsapp = coachWhatsAppLink("Bonjour Lilian, j'ai eu votre carte et j'aimerais en savoir plus sur votre coaching.");
  const mail = `mailto:${COACH.email}?subject=${encodeURIComponent("Coaching sportif")}`;

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <header className={styles.head}>
          <div className={styles.monogram} aria-hidden="true">LC</div>
          <h1 className={styles.name}>{COACH.name}</h1>
          <p className={styles.title}>{COACH.title}</p>
        </header>

        <ul className={styles.specialties}>
          {COACH.specialties.map((s) => <li key={s}>{s}</li>)}
        </ul>

        <a className={styles.save} href="/lilian-cattani.vcf" download="Lilian-Cattani.vcf">
          Enregistrer le contact
        </a>

        <nav className={styles.actions} aria-label="Me contacter">
          <a href={telHref}><span className={styles.icon} aria-hidden="true">☎</span>Appeler</a>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer"><span className={styles.icon} aria-hidden="true">✆</span>WhatsApp</a>
          <a href={mail}><span className={styles.icon} aria-hidden="true">✉</span>E-mail</a>
          <ShareButton className={styles.shareBtn} path={CARD_PATH} />
        </nav>

        <section className={styles.block}>
          <h2>Où et comment</h2>
          <p>{COACH.area}.</p>
          <p className={styles.small}>{COACH.phone} · {COACH.email}</p>
        </section>

        {COACH.siteUrl && (
          <a className={styles.link} href={COACH.siteUrl} target="_blank" rel="noopener noreferrer">
            <strong>Voir les programmes</strong>
            <span>Prise de masse, sèche, remise en forme, préparation aux sports de combat</span>
          </a>
        )}

        <Link className={styles.link} href="/app">
          <strong>Suivre vos repas avec Macrolens</strong>
          <span>L'application gratuite qui calcule vos calories et vos macros</span>
        </Link>

        <a className={styles.link} href="https://recherche-educateur.sports.gouv.fr" target="_blank" rel="noopener noreferrer">
          <strong>Carte professionnelle n° {COACH.cartePro}</strong>
          <span>Vérifiable sur le site du ministère des Sports</span>
        </a>

        <footer className={styles.foot}>
          <Link href="/mentions-legales">Mentions légales</Link>
        </footer>
      </main>
    </div>
  );
}
