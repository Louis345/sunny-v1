/**
 * Storybook-only mockup of the start-screen subject picker (owner sign-off, 2026-11-16). Not wired to the server and
 * not used by the live start screen. One component draws every child: what she sees comes from two inputs only,
 * her shelf (subjects, later computed from her chart) and her presentation config (later read from her profile).
 * There is no per-child branch in this file; a new child or a new subject needs no new code.
 */
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { DOMAIN_LOOK, arrangeShelf, daysUntil, pickerMode, type PickerPresentation, type ShelfSubject } from "./subjectShelf";

export type { PickerPresentation, ShelfSubject } from "./subjectShelf";

type Props = {
  subjects: ShelfSubject[];
  config: PickerPresentation;
  /** The kiosk's date, passed in so stories are stable. */
  today: string;
  onPick?: (subject: ShelfSubject) => void;
};

export function SubjectPicker({ subjects, config, today, onPick }: Props) {
  const shelf = arrangeShelf(subjects, today);
  const mode = pickerMode(shelf, config);
  return (
    <div
      data-testid="subject-picker"
      style={{
        width: "100%",
        minHeight: "100vh",
        background: config.palette.sky,
        color: config.palette.ink,
        fontFamily: "'Nunito', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 88,
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      <CompanionCue config={config} mode={mode} />
      {mode === "empty" ? null : config.layout === "list" ? (
        <ListPicker shelf={shelf} config={config} today={today} onPick={onPick} />
      ) : mode === "auto-open" ? (
        <AutoOpen subject={shelf[0]} config={config} today={today} />
      ) : (
        <Shelf shelf={shelf} config={config} today={today} onPick={onPick} />
      )}
    </div>
  );
}

function CompanionCue({ config, mode }: { config: PickerPresentation; mode: ReturnType<typeof pickerMode> }) {
  const words = config.text === "none" ? null : mode === "empty" ? "All done!" : mode === "auto-open" ? "Let's go!" : "Pick one!";
  return (
    <motion.div
      style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 800 }}
      animate={config.motion === "lively" ? { y: [0, -6, 0] } : { y: [0, -2, 0] }}
      transition={{ duration: config.motion === "lively" ? 1.2 : 3.2, repeat: Infinity }}
    >
      <span style={{ fontSize: 72 }} aria-label={config.companion.name}>{config.companion.emoji}</span>
      {mode === "empty" ? <span style={{ fontSize: 72 }}>🌙</span> : null}
      {words ? <span>{words}</span> : null}
    </motion.div>
  );
}

function Shelf({ shelf, config, today, onPick }: { shelf: ShelfSubject[]; config: PickerPresentation; today: string; onPick?: (s: ShelfSubject) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: config.bookSize === "large" ? 48 : 32, padding: "0 40px" }}>
        {shelf.map((subject, index) => (
          <Book key={`${subject.domain}:${subject.title}`} subject={subject} config={config} today={today} index={index} onPick={onPick} />
        ))}
      </div>
      <div style={{ width: "100%", minWidth: 520, height: 22, borderRadius: 6, background: config.palette.shelf, boxShadow: "0 10px 18px rgba(0,0,0,0.18)" }} />
    </div>
  );
}

function Book({ subject, config, today, index, onPick }: { subject: ShelfSubject; config: PickerPresentation; today: string; index: number; onPick?: (s: ShelfSubject) => void }) {
  const look = DOMAIN_LOOK[subject.domain];
  const days = daysUntil(subject.due, today);
  const dated = days !== null && days >= 0;
  const width = config.bookSize === "large" ? 220 : 170;
  const height = config.bookSize === "large" ? 290 : 230;
  const glow = dated && config.dueCue.includes("glow");
  const calm = config.motion === "calm";
  return (
    <motion.button
      type="button"
      aria-label={`${look.word}: ${subject.title}`}
      onClick={() => onPick?.(subject)}
      initial={{ y: 40, opacity: 0 }}
      animate={glow
        ? { y: 0, opacity: 1, boxShadow: [`0 0 22px 6px ${config.palette.accent}88`, `0 0 56px 20px ${config.palette.accent}ee`, `0 0 22px 6px ${config.palette.accent}88`] }
        : { y: 0, opacity: 1 }}
      transition={{
        y: { delay: index * 0.12, type: "spring", stiffness: calm ? 90 : 220, damping: calm ? 18 : 10 },
        opacity: { delay: index * 0.12 },
        boxShadow: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
      }}
      whileHover={{ y: calm ? -10 : -22, rotate: calm ? 0 : -3 }}
      whileTap={{ scale: 0.96 }}
      style={{
        position: "relative",
        width,
        height,
        border: "none",
        borderRadius: "10px 18px 18px 10px",
        background: `linear-gradient(90deg, ${look.spine} 0 16%, ${look.cover} 16% 100%)`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#2b2f36",
        boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
      }}
    >
      <span style={{ fontSize: config.bookSize === "large" ? 110 : 80, lineHeight: 1 }}>{look.emoji}</span>
      <GoalMark goal={subject.goal} size={config.bookSize === "large" ? 44 : 34} />
      {config.text !== "none" ? <span style={{ fontSize: 24, fontWeight: 800 }}>{look.word}</span> : null}
      {config.text === "full" ? <span style={{ fontSize: 15, opacity: 0.8, padding: "0 12px 0 28px" }}>{subject.title}</span> : null}
      {subject.suggested ? <SuggestedMark config={config} /> : null}
      {dated ? <DueCue days={days} subject={subject} config={config} /> : null}
    </motion.button>
  );
}

/** A test is a gold star; a worksheet is a stack of pages. Pictures, not words. */
function GoalMark({ goal, size }: { goal: ShelfSubject["goal"]; size: number }) {
  return <span style={{ fontSize: size, lineHeight: 1 }} aria-label={goal}>{goal === "test" ? "⭐" : "📄"}</span>;
}

function SuggestedMark({ config }: { config: PickerPresentation }) {
  return (
    <motion.span
      aria-label="suggested"
      style={{ position: "absolute", top: -64, fontSize: 52 }}
      animate={{ y: [0, config.motion === "lively" ? 12 : 6, 0] }}
      transition={{ duration: config.motion === "lively" ? 0.9 : 2.2, repeat: Infinity }}
    >
      👇
    </motion.span>
  );
}

function DueCue({ days, subject, config }: { days: number; subject: ShelfSubject; config: PickerPresentation }) {
  const badge: CSSProperties = {
    position: "absolute",
    bottom: -18,
    background: config.palette.accent,
    color: "#fff",
    borderRadius: 999,
    padding: "6px 14px",
    fontWeight: 900,
    fontSize: 20,
    boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
    whiteSpace: "nowrap",
  };
  if (config.dueCue.includes("sleeps")) {
    // Sleeps until the test, counted as moons: no numbers to read.
    return <span style={{ ...badge, background: "rgba(255,255,255,0.85)", fontSize: 24 }} aria-label={`${days} sleeps`}>{days === 0 ? "☀️" : "🌙".repeat(Math.min(days, 7))}</span>;
  }
  const best = config.dueCue.includes("beatBest") && subject.best ? subject.best : null;
  return (
    <span style={{ position: "absolute", bottom: -20, display: "flex", gap: 8 }}>
      {config.dueCue.includes("countdown") ? (
        <motion.span
          style={{ ...badge, position: "static", background: "#d64545" }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          🥊 {days === 0 ? "TODAY" : `${days}d`}
        </motion.span>
      ) : null}
      {best ? <span style={{ ...badge, position: "static", background: "#222" }}>🏆 {best.correct}/{best.total}</span> : null}
    </span>
  );
}

/** One subject and the config says skip: the book opens by itself (here frozen mid-open for the mockup). */
function AutoOpen({ subject, config, today }: { subject: ShelfSubject; config: PickerPresentation; today: string }) {
  return (
    <motion.div
      initial={{ scale: 0.8, rotateY: 0 }}
      animate={{ scale: 1.15, rotateY: -18 }}
      transition={{ duration: config.motion === "calm" ? 1.6 : 0.6 }}
      style={{ perspective: 800 }}
    >
      <Book subject={subject} config={config} today={today} index={0} />
    </motion.div>
  );
}

/** The owner's simpler option: one tap row per subject, same data, no shelf. */
function ListPicker({ shelf, config, today, onPick }: { shelf: ShelfSubject[]; config: PickerPresentation; today: string; onPick?: (s: ShelfSubject) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 560 }}>
      {shelf.map((subject) => {
        const look = DOMAIN_LOOK[subject.domain];
        const days = daysUntil(subject.due, today);
        return (
          <button
            key={`${subject.domain}:${subject.title}`}
            type="button"
            onClick={() => onPick?.(subject)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              borderRadius: 14,
              border: subject.suggested ? `3px solid ${config.palette.accent}` : "2px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontSize: 22,
              color: config.palette.ink,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 40 }}>{look.emoji}</span>
            <span style={{ fontSize: 28 }}>{subject.goal === "test" ? "⭐" : "📄"}</span>
            {config.text !== "none" ? (
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <strong>{look.word}</strong>
                {config.text === "full" ? <span style={{ fontSize: 15, opacity: 0.7 }}>{subject.title}</span> : null}
              </span>
            ) : <span style={{ flex: 1 }} />}
            {days !== null && days >= 0 ? <span style={{ fontWeight: 800, color: config.palette.accent }}>{days === 0 ? "today" : `in ${days} days`}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
