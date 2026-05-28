import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Crown,
  Gamepad2,
  Lock,
  Radar,
  Route,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import type {
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../../src/shared/adventureBoardJson";
import "./AdventureChoiceModal.css";

export type AdventureChoiceModalProps = {
  choiceSet: AdventureChoiceSet | null;
  open: boolean;
  previewMode?: boolean;
  onSelect: (option: AdventureChoiceOption) => void;
  onDismiss: () => void;
};

const ACCENTS: Record<string, string> = {
  "baseline-route": "#0EA5E9",
  mystery: "#7C3AED",
  "quest-wrapper": "#FCD34D",
  "boss-wrapper": "#E83A5C",
  arcade: "#F59E0B",
  book: "#5B3FCB",
  game: "#5B3FCB",
  puzzle: "#10B981",
  radar: "#7C3AED",
  route: "#0EA5E9",
  sparkles: "#10B981",
  story: "#5B3FCB",
  swords: "#E83A5C",
  zap: "#F59E0B",
};

const iconMap = {
  book: BookOpen,
  crown: Crown,
  game: Gamepad2,
  mystery: Sparkles,
  radar: Radar,
  route: Route,
  sparkles: Sparkles,
  swords: Swords,
  zap: Zap,
} as const;

function keyFor(option: AdventureChoiceOption, choiceSet: AdventureChoiceSet): string {
  return option.icon ?? option.tags?.[0] ?? choiceSet.kind;
}

function accentFor(option: AdventureChoiceOption, choiceSet: AdventureChoiceSet): string {
  return ACCENTS[keyFor(option, choiceSet)] ?? ACCENTS[choiceSet.kind] ?? "#7C3AED";
}

function kickerFor(kind: AdventureChoiceSet["kind"]): string {
  if (kind === "baseline-route") return "Choose Path";
  if (kind === "mystery") return "Three Doors";
  if (kind === "quest-wrapper") return "Quest Choices";
  return "Boss Finale";
}

function purposeFor(option: AdventureChoiceOption, choiceSet: AdventureChoiceSet): string {
  if (option.tags?.[0]) return option.tags[0];
  if (choiceSet.kind === "baseline-route") return "route";
  if (choiceSet.kind === "quest-wrapper") return "quest";
  if (choiceSet.kind === "boss-wrapper") return "boss";
  return "mystery";
}

function displayLabelFor(option: AdventureChoiceOption): string {
  if (option.id.includes("pronunciation")) return "Say it out loud";
  if (option.id.includes("speed")) return "Speed Challenge";
  if (option.id.includes("story")) return option.label;
  return option.label;
}

function CardArt({
  option,
  choiceSet,
}: {
  option: AdventureChoiceOption;
  choiceSet: AdventureChoiceSet;
}) {
  if (option.thumbnailUrl) {
    return <img src={option.thumbnailUrl} alt="" />;
  }

  const accent = accentFor(option, choiceSet);
  const key = keyFor(option, choiceSet);
  const common = {
    width: "100%",
    height: "100%",
    display: "block",
  };

  if (key === "book" || key === "story" || choiceSet.kind === "quest-wrapper") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <rect x="39" y="36" width="79" height="88" rx="8" fill="#FFF7E1" />
        <rect x="118" y="36" width="79" height="88" rx="8" fill="#FFF7E1" />
        <path d="M118 36v88" stroke="#1F0F2D" strokeWidth="5" />
        <path d="M56 62h41M56 81h41M56 100h41M139 62h41M139 81h41" stroke="#5B3FCB" strokeWidth="5" />
        <path d="m178 22 12 31 33 2-25 20 8 33-28-18-28 18 8-33-25-20 33-2z" fill="#FCD34D" stroke="#1F0F2D" strokeWidth="6" />
      </svg>
    );
  }

  if (key === "zap" || key === "game" || key === "arcade") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <circle cx="49" cy="137" r="21" fill="#F8B283" opacity="0.85" />
        <circle cx="184" cy="27" r="33" fill="#F8B283" opacity="0.85" />
        <path
          d="M119 0 70 96h43l-18 75 72-103h-43L149 0z"
          fill="#FFF7E1"
          stroke="#1F0F2D"
          strokeLinejoin="round"
          strokeWidth="7"
        />
      </svg>
    );
  }

  if (key === "radar") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <circle cx="95" cy="74" r="43" fill="#FFF7E1" stroke="#1F0F2D" strokeWidth="7" />
        <path d="m127 106 52 42" stroke="#1F0F2D" strokeWidth="12" strokeLinecap="round" />
        <path d="M73 72h45M94 50v45" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "swords" || choiceSet.kind === "boss-wrapper") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <path d="M65 132 173 24M171 132 63 24" stroke="#FFF7E1" strokeWidth="18" strokeLinecap="round" />
        <path d="M51 112h52M133 112h52" stroke="#1F0F2D" strokeWidth="9" strokeLinecap="round" />
        <path d="m118 20 16 38 41 3-31 27 10 41-36-21-36 21 10-41-31-27 41-3z" fill="#FCD34D" stroke="#1F0F2D" strokeWidth="6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 236 168" aria-hidden style={common}>
      <rect width="236" height="168" fill={accent} />
      <circle cx="118" cy="84" r="48" fill="#FFF7E1" opacity="0.95" />
      <text x="118" y="104" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="74" fontWeight="700" fill="#1F0F2D">
        ?
      </text>
    </svg>
  );
}

export function AdventureChoiceModal({
  choiceSet,
  open,
  previewMode = false,
  onSelect,
  onDismiss,
}: AdventureChoiceModalProps) {
  return (
    <AnimatePresence>
      {open && choiceSet ? (
        <motion.div
          data-testid="adventure-choice-modal"
          data-choice-kind={choiceSet.kind}
          className="adventure-choice-modal"
          role="dialog"
          aria-modal="true"
          aria-label={choiceSet.title}
        >
          <div className="adventure-choice-modal__texture" aria-hidden />
          <div className="adventure-choice-modal__side-light" aria-hidden />
          {previewMode ? (
            <div className="adventure-choice-modal__preview-banner">
              <span aria-hidden>o</span>
              <span>Preview - events log but do not persist</span>
            </div>
          ) : null}
          <button
            type="button"
            className="adventure-choice-modal__back"
            onClick={onDismiss}
            aria-label="Back to map"
          >
            {"<- Back to map"}
          </button>
          <div className="adventure-choice-modal__stage">
            <motion.div className="adventure-choice-modal__heading">
              <p className="adventure-choice-modal__kicker">{kickerFor(choiceSet.kind)}</p>
              <h2 className="adventure-choice-modal__title">{choiceSet.title}</h2>
            </motion.div>
            <div className="adventure-choice-modal__cards">
              {choiceSet.options.map((option, idx) => {
                const accent = accentFor(option, choiceSet);
                const displayLabel = displayLabelFor(option);
                const locked = option.state === "locked";
                const Icon = iconMap[(option.icon ?? "sparkles") as keyof typeof iconMap] ?? Sparkles;
                return (
                  <motion.button
                    key={option.id}
                    type="button"
                    data-testid="adventure-choice-card"
                    className={[
                      "adventure-choice-modal__card",
                      locked ? "adventure-choice-modal__card--locked" : "",
                    ].join(" ")}
                    style={{
                      "--choice-accent": accent,
                      "--choice-delay": `${idx * 80}ms`,
                    } as React.CSSProperties}
                    disabled={locked}
                    aria-label={`${purposeFor(option, choiceSet)} ${displayLabel}${locked && option.lock?.label ? ` Locked ${option.lock.label}` : ""}`}
                    whileHover={locked ? undefined : { y: -4, scale: 1.02 }}
                    onClick={() => {
                      if (!locked) onSelect(option);
                    }}
                  >
                    <span className="adventure-choice-modal__art">
                      <CardArt option={option} choiceSet={choiceSet} />
                      <span className="adventure-choice-modal__art-badge">
                        {locked ? <Lock size={18} strokeWidth={2.5} /> : <Icon size={20} strokeWidth={2.5} />}
                      </span>
                    </span>
                    <span className="adventure-choice-modal__copy">
                      <span className="adventure-choice-modal__purpose">
                        {purposeFor(option, choiceSet)}
                      </span>
                      <strong>{displayLabel}</strong>
                      {option.description ? <small>{option.description}</small> : null}
                      {locked ? (
                        <small className="adventure-choice-modal__lock-copy">
                          Locked: {option.lock?.label ?? "Need a few warm-up rounds first"}
                        </small>
                      ) : null}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
