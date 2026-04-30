/** `floating` = map corner; `panel` = bottom of companion care sheet, below other content. */
export function CompanionCurrencyHud({
  companionCurrency,
  layout = "floating",
}: {
  companionCurrency: number;
  layout?: "floating" | "panel";
}) {
  const safe = Math.max(0, Math.floor(Number(companionCurrency) || 0));
  const panel = layout === "panel";
  return (
    <div
      data-testid="companion-currency-hud"
      style={{
        position: panel ? "relative" : "absolute",
        bottom: panel ? "auto" : 16,
        right: panel ? "auto" : 16,
        left: panel ? "auto" : undefined,
        width: panel ? "100%" : undefined,
        marginTop: panel ? 20 : undefined,
        display: panel ? "flex" : undefined,
        justifyContent: panel ? "center" : undefined,
        zIndex: 10,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: "#92400e",
      }}
      aria-live="polite"
    >
      🪙 {safe}
    </div>
  );
}
