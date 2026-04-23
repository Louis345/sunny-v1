/** Full-screen background from theme; gradient uses palette sky→ground when no image URL. */
export function WorldBackground({
  url,
  paletteSky,
  paletteGround,
}: {
  url?: string | null;
  /** When `url` is absent, vertical gradient from sky (top) to ground (bottom). */
  paletteSky?: string;
  paletteGround?: string;
}) {
  const fallbackGradient =
    paletteSky && paletteGround
      ? `linear-gradient(180deg, ${paletteSky} 0%, ${paletteGround} 100%)`
      : "linear-gradient(180deg, #60A5FA 0%, #93C5FD 40%, #86EFAC 65%, #22C55E 100%)";

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      {url ? (
        <img
          data-testid="world-background-image"
          src={url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          data-testid="world-background-gradient"
          style={{
            width: "100%",
            height: "100%",
            background: fallbackGradient,
          }}
        />
      )}
    </div>
  );
}
