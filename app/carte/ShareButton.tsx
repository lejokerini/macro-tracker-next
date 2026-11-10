"use client";

import { useState } from "react";

// Partage de la carte : feuille de partage du téléphone, sinon copie du lien.
export default function ShareButton({ className, path }: { className?: string; path: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Lilian Cattani · Coach sportif", url });
        return;
      }
    } catch {
      return; // partage annulé
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      window.prompt("Copiez ce lien :", url);
    }
  }

  return (
    <button type="button" className={className} onClick={share}>
      <span aria-hidden="true">↗</span>
      {done ? "Lien copié" : "Partager"}
    </button>
  );
}
