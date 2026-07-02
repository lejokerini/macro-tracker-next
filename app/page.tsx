import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Macrolens · Compteur de calories & macros en photo",
  description:
    "Prends ton repas en photo, Macrolens estime les calories et les macros. Données Ciqual officielles, scan de code-barres, journal et programmes. Gratuit, sans pub.",
  openGraph: {
    title: "Macrolens · Compteur de calories & macros en photo",
    description:
      "Photographie ton repas, obtiens les calories et macros en un instant. Données françaises Ciqual, gratuit et sans pub.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function LandingPage() {
  return (
    <main className="lp">
      {/* Si l'app est lancée en mode installé (PWA), aller directement au tracker. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches||window.navigator.standalone){location.replace('/app');}}catch(e){}",
        }}
      />
      {/* En-tête */}
      <header className="lp-nav">
        <div className="lp-logo">
          <span className="lp-logo-mark" aria-hidden>
            <img src="/logo-mark.svg" alt="" width={34} height={34} />
          </span>
          <span className="lp-logo-text">
            Macro<span>lens</span>
          </span>
        </div>
        <Link href="/app" className="lp-btn lp-btn-ghost">
          Ouvrir l&apos;app
        </Link>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">Photo · Calories · Macros</span>
          <h1>
            Ton repas en photo,{" "}
            <span className="lp-accent">tes calories en un instant.</span>
          </h1>
          <p className="lp-sub">
            Macrolens estime les calories et les macronutriments de tes repas à
            partir d&apos;une simple photo. Données officielles{" "}
            <strong>Ciqual (ANSES)</strong>, scan de code-barres, journal et
            programmes adaptés à tes objectifs.
          </p>
          <div className="lp-cta-row">
            <Link href="/app" className="lp-btn lp-btn-primary">
              Essayer dans le navigateur
            </Link>
            <a href="#comment" className="lp-btn lp-btn-ghost">
              Comment ça marche
            </a>
          </div>
          <div className="lp-badges">
            <span>Données Ciqual officielles</span>
            <span>Sources scientifiques citées</span>
            <span>Sans publicité</span>
            <span>Tes données t&apos;appartiennent</span>
            <span>Gratuit</span>
          </div>
        </div>

        {/* Mockup téléphone : démo photo → calories */}
        <div className="lp-hero-visual" aria-hidden>
          <div className="lp-phone">
            <div className="lp-phone-notch" />
            <div className="lp-phone-screen">
              <div className="lp-shot-photo">
                <span className="lp-shot-emoji">🥗</span>
                <span className="lp-shot-flash">Analyse…</span>
              </div>
              <div className="lp-shot-card">
                <div className="lp-shot-title">
                  <strong>Bowl poulet &amp; quinoa</strong>
                  <span className="lp-shot-kcal">642 kcal</span>
                </div>
                <div className="lp-shot-macros">
                  <span>
                    <b>48 g</b>
                    <small>Prot.</small>
                  </span>
                  <span>
                    <b>63 g</b>
                    <small>Gluc.</small>
                  </span>
                  <span>
                    <b>19 g</b>
                    <small>Lip.</small>
                  </span>
                  <span>
                    <b>9 g</b>
                    <small>Fibres</small>
                  </span>
                </div>
                <div className="lp-shot-bar">
                  <div />
                </div>
                <span className="lp-shot-note">Ajouté au déjeuner ✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment" className="lp-section">
        <h2 className="lp-h2">En 3 étapes</h2>
        <div className="lp-steps">
          <div className="lp-step">
            <span className="lp-step-num">1</span>
            <h3>Prends la photo</h3>
            <p>
              Photographie ton assiette (ou scanne un code-barres, ou décris ton
              repas). Aucune saisie fastidieuse.
            </p>
          </div>
          <div className="lp-step">
            <span className="lp-step-num">2</span>
            <h3>Macrolens analyse</h3>
            <p>
              L&apos;app estime calories, protéines, glucides, lipides et
              fibres, et te laisse ajuster les quantités.
            </p>
          </div>
          <div className="lp-step">
            <span className="lp-step-num">3</span>
            <h3>Suis tes progrès</h3>
            <p>
              Journal, objectifs, poids, IMC et séries quotidiennes pour garder
              le cap sans effort.
            </p>
          </div>
        </div>
      </section>

      {/* Bénéfices */}
      <section className="lp-section">
        <h2 className="lp-h2">Pourquoi Macrolens</h2>
        <div className="lp-features">
          <div className="lp-feature">
            <h3>Photo, calories, macros</h3>
            <p>
              La reconnaissance de repas te fait gagner un temps fou. C&apos;est
              l&apos;une des seules apps françaises à l&apos;offrir gratuitement.
            </p>
          </div>
          <div className="lp-feature">
            <h3>Données officielles</h3>
            <p>
              Base <strong>Ciqual (ANSES)</strong> et Open Food Facts : des
              valeurs fiables et pensées pour le public français.
            </p>
          </div>
          <div className="lp-feature">
            <h3>Fondé sur la science</h3>
            <p>
              Besoins calculés avec des formules validées (Mifflin-St Jeor,
              Katch-McArdle), protéines par kg, fibres et micronutriments.
              Chaque recommandation cite ses <strong>sources scientifiques</strong>{" "}
              directement dans l&apos;app.
            </p>
          </div>
          <div className="lp-feature">
            <h3>Programmes &amp; recettes</h3>
            <p>
              Des programmes adaptés à ta cible calorique, avec recettes,
              portions ajustées et jeûne intermittent.
            </p>
          </div>
          <div className="lp-feature">
            <h3>Code-barres</h3>
            <p>
              Scanne un produit et récupère Nutri-Score, NOVA et composition en
              une seconde.
            </p>
          </div>
          <div className="lp-feature">
            <h3>Respect de tes données</h3>
            <p>
              Aucune publicité, aucun pistage. Tes données restent sous ton
              contrôle et ne sont jamais vendues.
            </p>
          </div>
        </div>
      </section>

      {/* Appel à l'action final */}
      <section className="lp-final">
        <h2>Prêt à essayer ?</h2>
        <p>
          Commence gratuitement, directement dans ton navigateur. Rien à
          installer.
        </p>
        <Link href="/app" className="lp-btn lp-btn-primary lp-btn-lg">
          Lancer Macrolens
        </Link>
      </section>

      {/* Pied de page */}
      <footer className="lp-footer">
        <div className="lp-logo lp-logo-sm">
          <img src="/logo-mark.svg" alt="" width={26} height={26} />
          <span className="lp-logo-text">
            Macro<span>lens</span>
          </span>
        </div>
        <nav className="lp-footer-links">
          <Link href="/app">Application</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <a href="mailto:contact.macrolens@gmail.com">Contact</a>
        </nav>
        <p className="lp-footer-copy">
          © {new Date().getFullYear()} Macrolens · Conçu en France
        </p>
      </footer>
    </main>
  );
}
