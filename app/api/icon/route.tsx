import { ImageResponse } from "next/og";

export const runtime = "edge";

// Icône Macrolens générée au build : objectif/assiette + couverts + déclencheur orange.
// Pleine page (sans coins arrondis) pour rester correcte en version "maskable".
// ?size=192 | 512 | 180 ...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const size = Math.min(1024, Math.max(48, Number(searchParams.get("size")) || 512));
  const px = (ratio: number) => Math.round(ratio * size);

  // [left, top, width, height, borderRadius] en ratios du carré (repère 512).
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
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#2f6b2f" }}>
        <div
          style={{
            position: "absolute",
            top: px(0.1934),
            left: px(0.1816),
            width: px(0.6367),
            height: px(0.6367),
            borderRadius: "50%",
            border: `${px(0.0508)}px solid #ffffff`,
          }}
        />
        {cutlery.map(([l, t, w, h, br], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px(l),
              top: px(t),
              width: px(w),
              height: px(h),
              borderRadius: px(br),
              background: "#ffffff",
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: px(0.6738),
            top: px(0.2402),
            width: px(0.1055),
            height: px(0.1055),
            borderRadius: "50%",
            background: "#f3a52c",
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
