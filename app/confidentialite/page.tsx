import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Macrolens",
  description: "Comment Macrolens collecte, utilise et protège tes données.",
};

export default function ConfidentialitePage() {
  return (
    <main className="app legal">
      <h1>Politique de confidentialité</h1>
      <p className="muted">Application : <strong>Macrolens</strong> · Dernière mise à jour : 1er juillet 2026</p>

      <p>
        Macrolens est une application de suivi nutritionnel (calories, macronutriments, poids). Cette page explique
        quelles données l&apos;application traite, pourquoi, et quels sont tes droits. Nous appliquons un principe de
        minimisation : nous ne collectons que ce qui est nécessaire au fonctionnement de l&apos;app.
      </p>

      <h2>1. Données traitées</h2>
      <p>Selon ton usage, l&apos;application peut traiter :</p>
      <ul>
        <li><strong>Profil</strong> : prénom, nom, sexe, âge, taille, poids, masse grasse (facultative), niveau d&apos;activité, objectif, régime, allergies et préférences alimentaires, budget.</li>
        <li><strong>Suivi</strong> : aliments consommés (journal), pesées, hydratation, placard, recettes personnelles, programmes générés.</li>
        <li><strong>Photos de repas</strong> : uniquement lorsque tu utilises la fonction « Snap » ou le scan de code-barres, via la caméra ou une image que tu choisis.</li>
        <li><strong>Compte</strong> : si tu actives la sauvegarde cloud, ton adresse e-mail et un mot de passe (géré de façon sécurisée par notre prestataire d&apos;authentification).</li>
      </ul>
      <p>
        Ces informations peuvent concerner ta santé (poids, alimentation). Elles restent sous ton contrôle et ne sont
        jamais vendues.
      </p>

      <h2>2. Utilisation des données</h2>
      <ul>
        <li>Calculer tes besoins caloriques et tes macros, et afficher ton suivi et tes progrès.</li>
        <li>Analyser une photo ou une description de repas pour en estimer les calories et macros.</li>
        <li>Rechercher des produits alimentaires et générer des programmes/recettes.</li>
        <li>Sauvegarder tes données et les synchroniser entre tes appareils (si tu crées un compte).</li>
      </ul>

      <h2>3. Stockage</h2>
      <p>
        Par défaut, tes données sont stockées <strong>localement sur ton appareil</strong> (dans le navigateur). Si tu
        crées un compte et actives la sauvegarde cloud, elles sont également enregistrées de manière chiffrée en transit
        chez notre hébergeur de base de données, <strong>et associées uniquement à ton compte</strong> : d&apos;autres
        utilisateurs ne peuvent pas y accéder.
      </p>

      <h2>4. Partage avec des tiers</h2>
      <p>Macrolens s&apos;appuie sur des prestataires techniques, uniquement pour faire fonctionner l&apos;app :</p>
      <ul>
        <li><strong>Google (API Gemini)</strong> : les photos ou descriptions de repas que tu soumets à l&apos;analyse sont envoyées à Google pour estimer les valeurs nutritionnelles. Elles ne sont pas conservées par Macrolens.</li>
        <li><strong>Open Food Facts</strong> : base de données publique interrogée pour les produits de marque et codes-barres.</li>
        <li><strong>Supabase</strong> : hébergement de la base de données et gestion des comptes (si tu actives le cloud).</li>
        <li><strong>Vercel</strong> : hébergement de l&apos;application.</li>
      </ul>
      <p>
        Nous ne partageons pas tes données à des fins publicitaires et nous ne les vendons pas.
      </p>

      <h2>5. Caméra et photos</h2>
      <p>
        L&apos;accès à la caméra sert uniquement à prendre en photo un repas ou à scanner un code-barres, à ta demande.
        Les photos sont utilisées pour l&apos;analyse nutritionnelle puis ne sont pas stockées sur nos serveurs.
      </p>

      <h2>6. Publicité et mesure d&apos;audience</h2>
      <p>Macrolens n&apos;affiche aucune publicité et n&apos;utilise pas d&apos;outil de pistage publicitaire.</p>

      <h2>7. Conservation</h2>
      <p>
        Tes données sont conservées tant que tu utilises l&apos;application. Tu peux les effacer à tout moment depuis
        l&apos;app, et la suppression de ton compte entraîne la suppression des données associées.
      </p>

      <h2>8. Tes droits</h2>
      <p>
        Conformément au RGPD, tu disposes d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
        limitation et de portabilité de tes données. Tu peux exercer ces droits directement dans l&apos;app (export,
        réinitialisation, suppression) ou en nous contactant.
      </p>

      <h2>9. Suppression du compte et des données</h2>
      <p>
        Depuis l&apos;onglet « Mon compte », tu peux te déconnecter et réinitialiser tes données locales. Pour supprimer
        définitivement ton compte cloud et toutes les données associées, contacte-nous à l&apos;adresse ci-dessous ; la
        demande est traitée dans les meilleurs délais.
      </p>

      <h2>10. Sécurité</h2>
      <p>
        Les échanges se font en HTTPS, les clés d&apos;accès aux services d&apos;analyse restent côté serveur, et
        l&apos;accès à tes données cloud est restreint à ton seul compte. Aucun système n&apos;est infaillible, mais nous
        appliquons des mesures raisonnables pour protéger tes informations.
      </p>

      <h2>11. Enfants</h2>
      <p>
        L&apos;application n&apos;est pas destinée aux enfants de moins de 15 ans. Si tu penses qu&apos;un mineur nous a
        transmis des données, contacte-nous pour que nous les supprimions.
      </p>

      <h2>12. Modifications</h2>
      <p>
        Cette politique peut évoluer. En cas de changement important, la date de mise à jour en haut de page sera
        modifiée.
      </p>

      <h2>13. Contact</h2>
      <p>
        Pour toute question ou demande relative à tes données : <strong>contact.macrolens@gmail.com</strong>.
      </p>

      <p style={{ marginTop: 24 }}>
        <a href="/">← Retour à l&apos;application</a>
      </p>
    </main>
  );
}
