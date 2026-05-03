import { useCallback } from "react";

function displayNameFromChildId(childId: string): string {
  return childId
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function companionBriefLine(childId: string): string {
  const displayName = displayNameFromChildId(childId);
  return displayName
    ? `You've got this, ${displayName}! I'll be right here 💪`
    : "You've got this! I'll be right here 💪";
}

export function questUnlockCompanionBubbleText(
  childId: string,
  _companionId: string,
): string {
  return companionBriefLine(childId);
}

export function QuestBriefingModal(props: {
  open: boolean;
  reinforceWords: readonly string[];
  childId: string;
  companionId: string;
  onDismiss: () => void;
  onStartQuest: () => void;
}) {
  const { open, reinforceWords, childId, companionId, onDismiss, onStartQuest } =
    props;
  const words = reinforceWords.slice(0, 5);
  void companionId;

  const stop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-briefing-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(10,12,24,0.72)",
      }}
      onClick={onDismiss}
    >
      <div
        onClick={stop}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          padding: "22px 20px 20px",
          background: "linear-gradient(165deg, #1e1b4b 0%, #312e81 55%, #1e1b4b 100%)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
          fontFamily: "Lexend, system-ui, sans-serif",
          color: "#f8fafc",
        }}
      >
        <h2
          id="quest-briefing-title"
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "-0.02em",
          }}
        >
          ⚡ Quest
        </h2>
        <p
          style={{
            margin: "10px 0 14px",
            textAlign: "center",
            fontSize: 15,
            fontWeight: 600,
            color: "rgba(248,250,252,0.85)",
          }}
        >
          These are YOUR words
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
            minHeight: 40,
            marginBottom: 18,
          }}
        >
          {words.length === 0 ? (
            <span style={{ fontSize: 14, color: "rgba(248,250,252,0.55)" }}>
              (No missed words listed — you’re ready!)
            </span>
          ) : (
            words.map((w) => (
              <span
                key={w}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(99,102,241,0.35)",
                  border: "1px solid rgba(165,180,252,0.5)",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {w}
              </span>
            ))
          )}
        </div>
        <div
          style={{
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 14,
            background: "rgba(15,23,42,0.55)",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          <div style={{ marginBottom: 6, color: "#fde68a" }}>What you can win:</div>
          <div>★ +50 XP &nbsp; 🪙 +20 Coins &nbsp; 🏅 Speller Badge</div>
        </div>
        <div
          style={{
            position: "relative",
            marginBottom: 16,
            padding: "12px 14px 12px 16px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.08)",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 22,
              top: -8,
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "8px solid rgba(255,255,255,0.08)",
            }}
          />
          {companionBriefLine(childId)}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "stretch" }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "rgba(248,250,252,0.9)",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
            onClick={onDismiss}
          >
            Later
          </button>
          <button
            type="button"
            data-testid="quest-briefing-start"
            style={{
              flex: 1.4,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(90deg, #facc15, #f97316)",
              color: "#1e1b4b",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 4px 0 #b45309",
            }}
            onClick={onStartQuest}
          >
            🚀 Start Quest!
          </button>
        </div>
      </div>
    </div>
  );
}
