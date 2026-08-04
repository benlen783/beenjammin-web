import { ImageResponse } from "next/og";

export const alt = "BeenJammin music listening history analytics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at 75% 20%, #164425 0%, #08130c 42%, #030806 100%)",
        color: "#f5fff7",
        display: "flex",
        fontFamily: "Arial, Helvetica, sans-serif",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
          width: 980,
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
          <div
            style={{
              alignItems: "center",
              background: "#1ed760",
              borderRadius: 48,
              color: "#031408",
              display: "flex",
              fontSize: 54,
              fontWeight: 900,
              height: 96,
              justifyContent: "center",
              width: 96,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -3 }}>
            BeenJammin
          </div>
        </div>
        <div
          style={{
            color: "#b8c9bd",
            display: "flex",
            fontSize: 42,
            lineHeight: 1.25,
            marginTop: 48,
            maxWidth: 880,
          }}
        >
          Your Last.fm and Spotify listening history, in detail.
        </div>
        <div
          style={{
            color: "#1ed760",
            display: "flex",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 2,
            marginTop: 64,
            textTransform: "uppercase",
          }}
        >
          Interactive music analytics
        </div>
      </div>
    </div>,
    size,
  );
}
