import { ImageResponse } from "next/og";

export const runtime = "edge";

// Icône CalSnap générée au build : carré vert dégradé + appareil photo blanc.
// Utilisée par le manifest PWA et l'icône Apple. ?size=192 | 512 | 180 ...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const size = Math.min(1024, Math.max(48, Number(searchParams.get("size")) || 512));

  const bodyW = Math.round(size * 0.64);
  const bodyH = Math.round(size * 0.46);
  const radius = Math.round(size * 0.1);
  const lens = Math.round(size * 0.26);
  const bumpW = Math.round(size * 0.2);
  const bumpH = Math.round(size * 0.1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2f6b2f 0%, #5fa135 60%, #9bd161 100%)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: bodyW,
            height: bodyH,
            background: "#ffffff",
            borderRadius: radius,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -Math.round(bumpH * 0.7),
              left: Math.round(size * 0.12),
              width: bumpW,
              height: bumpH,
              background: "#ffffff",
              borderRadius: Math.round(size * 0.03),
            }}
          />
          <div
            style={{
              width: lens,
              height: lens,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2f6b2f, #5fa135)",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
