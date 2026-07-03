import { ImageResponse } from "next/og";

export const runtime = "edge";

// Image de mise en avant Play Store (feature graphic) : 1024 x 500.
// À télécharger sur https://<domaine>/api/feature-graphic puis à uploader dans la Play Console.
export async function GET() {
  const W = 1024;
  const H = 500;
  const M = 300; // taille du logo (carré)
  const m = (r: number) => Math.round(r * M);

  // [left, top, width, height, borderRadius] en ratios (repère 512), repris de l'icône.
  const cutlery: [number, number, number, number, number][] = [
    [0.3828, 0.4531, 0.0781, 0.0469, 0.018],
    [0.3887, 0.3516, 0.0195, 0.1094, 0.01],
    [0.4121, 0.3516, 0.0195, 0.1094, 0.01],
    [0.4355, 0.3516, 0.0195, 0.1094, 0.01],
    [0.4023, 0.4922, 0.0391, 0.1953, 0.02],
    [0.5625, 0.3516, 0.0508, 0.1719, 0.026],
    [0.5684, 0.5117, 0.0391, 0.1797, 0.02],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "linear-gradient(135deg,#173018 0%,#2f6b2f 55%,#3f8a3f 100%)",
          padding: "0 80px",
        }}
      >
        {/* Logo Macrolens */}
        <div style={{ position: "relative", width: M, height: M, display: "flex", flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              top: m(0.1934),
              left: m(0.1816),
              width: m(0.6367),
              height: m(0.6367),
              borderRadius: "50%",
              border: `${m(0.0508)}px solid #ffffff`,
            }}
          />
          {cutlery.map(([l, t, w, h, br], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: m(l),
                top: m(t),
                width: m(w),
                height: m(h),
                borderRadius: m(br),
                background: "#ffffff",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: m(0.6738),
              top: m(0.2402),
              width: m(0.1055),
              height: m(0.1055),
              borderRadius: "50%",
              background: "#f3a52c",
            }}
          />
        </div>

        {/* Texte */}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 64 }}>
          <div style={{ display: "flex", fontSize: 100, fontWeight: 800, color: "#ffffff", letterSpacing: -3 }}>
            Macrolens
          </div>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 600, color: "#e2f4d4", marginTop: 8 }}>
            Calories &amp; macros en photo
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#bfe0a6", marginTop: 20, letterSpacing: 3 }}>
            PHOTO · CODE-BARRES · SUIVI
          </div>
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
