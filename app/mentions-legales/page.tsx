import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales · Macrolens",
  description: "Éditeur, hébergeur et sources des données de l'application Macrolens.",
};

// Coordonnées de l'éditeur : à garder à jour (adresse professionnelle ou de domiciliation).
const EDITEUR = {
  nom: "Lilian Cattani",
  statut: "entrepreneur individuel (EI)",
  siret: "101 971 778 00010",
  adresse: "Hyères (83400), France",
  telephone: "06 66 04 79 02",
  email: "contact.macrolens@gmail.com",
};

export default function MentionsLegalesPage() {
  return (
    <main className="app legal">
      <h1>Mentions légales</h1>
      <p className="muted">Application : <strong>Macrolens</strong> · Dernière mise à jour : 10 novembre 2026</p>

      <h2>Éditeur</h2>
      <ul>
        <li>Macrolens est édité par <strong>{EDITEUR.nom}</strong>, {EDITEUR.statut}.</li>
        <li>SIRET : {EDITEUR.siret}</li>
        <li>Adresse : {EDITEUR.adresse}</li>
        <li>Téléphone : <a href={`tel:+33${EDITEUR.telephone.replace(/\s/g, "").slice(1)}`}>{EDITEUR.telephone}</a></li>
        <li>E-mail : <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a></li>
      </ul>
      <p>Directeur de la publication : {EDITEUR.nom}.</p>

      <h2>Hébergement</h2>
      <ul>
        <li>
          <strong>Application</strong> : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis
          (<a href="https://vercel.com" rel="noopener noreferrer" target="_blank">vercel.com</a>).
        </li>
        <li>
          <strong>Comptes et sauvegarde cloud</strong> (uniquement si tu crées un compte) : Supabase Inc.
          (<a href="https://supabase.com" rel="noopener noreferrer" target="_blank">supabase.com</a>).
        </li>
      </ul>

      <h2>Sources des données nutritionnelles</h2>
      <ul>
        <li>
          Table de composition nutritionnelle <strong>Ciqual</strong> de l&apos;Anses
          (<a href="https://ciqual.anses.fr" rel="noopener noreferrer" target="_blank">ciqual.anses.fr</a>), publiée sous
          licence ouverte Etalab.
        </li>
        <li>
          <strong>Open Food Facts</strong>, base collaborative de produits alimentaires
          (<a href="https://world.openfoodfacts.org" rel="noopener noreferrer" target="_blank">openfoodfacts.org</a>),
          sous licence Open Database License (ODbL).
        </li>
      </ul>
      <p>
        Ces valeurs sont des moyennes ou des données déclarées par les fabricants et les contributeurs : elles peuvent
        différer de ce que contient réellement ton assiette.
      </p>

      <h2>Avertissement santé</h2>
      <p>
        Macrolens est un outil de suivi et d&apos;estimation. Les besoins caloriques, les macros proposés et les analyses
        de photos sont des estimations : ils ne remplacent ni un avis médical, ni un suivi par un diététicien ou un
        médecin. En cas de maladie, de grossesse, de traitement en cours ou de rapport difficile à l&apos;alimentation,
        demande conseil à un professionnel de santé avant de modifier ton alimentation.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom Macrolens, le logo, les textes et le code de l&apos;application appartiennent à l&apos;éditeur, sauf
        mention contraire. Toute reproduction sans autorisation écrite est interdite.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le responsable du traitement est {EDITEUR.nom}. Ce que l&apos;application fait de tes données et tes droits sont
        décrits dans la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <p style={{ marginTop: 24 }}>
        <a href="/">← Retour à l&apos;application</a>
      </p>
    </main>
  );
}
