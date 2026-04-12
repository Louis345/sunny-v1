/** Full-screen background from theme; gradient fallback matches PoC sky/hill. */
export function WorldBackground({ url }: { url?: string | null }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      {url ? (
        <img
          src={url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(180deg, #60A5FA 0%, #93C5FD 40%, #86EFAC 65%, #22C55E 100%)",
          }}
        />
      )}
    </div>
  );
}
