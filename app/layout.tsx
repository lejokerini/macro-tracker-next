import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "CalSnap",
  description: "Prends ton repas en photo, CalSnap estime les calories et les macros.",
  applicationName: "CalSnap",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CalSnap",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/api/icon?size=512",
    apple: "/api/icon?size=180",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6b2f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('calsnap-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}",
          }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
