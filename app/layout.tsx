import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macro Tracker Pro",
  description: "Planification alimentaire, macros, courses et suivi du poids.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
