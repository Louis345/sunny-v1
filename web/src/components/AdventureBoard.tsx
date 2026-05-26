import React, { useState } from "react";
import {
  BookOpen,
  Check,
  Crown,
  DoorOpen,
  Gamepad2,
  HelpCircle,
  Lock,
  MapPin,
  MoreHorizontal,
  Radar,
  Route,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import type {
  AdventureBoardJson,
  AdventureBoardNode,
  AdventureBoardSlot,
  AdventureChoiceSet,
  AdventureChoiceOption,
} from "../../../src/shared/adventureBoardJson";
import "./AdventureBoard.css";

type AdventureBoardProps = {
  board: AdventureBoardJson;
  onNodeClick?: (node: AdventureBoardNode) => void;
  onChoiceClick?: (option: AdventureChoiceOption) => void;
};

type PositionedAdventureBoardNode = AdventureBoardNode & {
  position: { x: number; y: number };
};

export const HORIZONTAL_ADVENTURE_SLOTS: Record<AdventureBoardSlot, { x: number; y: number }> = {
  "1": { x: 0.10, y: 0.82 },
  "2": { x: 0.25, y: 0.70 },
  "3": { x: 0.38, y: 0.56 },
  "4": { x: 0.52, y: 0.56 },
  "5a.1": { x: 0.44, y: 0.30 },
  "5a.2": { x: 0.58, y: 0.26 },
  "5b.1": { x: 0.46, y: 0.76 },
  "5b.2": { x: 0.58, y: 0.72 },
  "5c.1": { x: 0.57, y: 0.48 },
  "5c.2": { x: 0.61, y: 0.52 },
  "6": { x: 0.64, y: 0.46 },
  "7": { x: 0.76, y: 0.34 },
  "8": { x: 0.86, y: 0.18 },
};

const iconMap = {
  book: BookOpen,
  boss: Crown,
  check: Trophy,
  choice: Route,
  crown: Crown,
  door: DoorOpen,
  game: Gamepad2,
  mystery: Sparkles,
  pin: MapPin,
  radar: Radar,
  route: Route,
  sparkles: Sparkles,
  star: Star,
  swords: Swords,
  zap: Zap,
} as const;

function iconFor(name: string | undefined, fallback: keyof typeof iconMap) {
  return iconMap[(name ?? fallback) as keyof typeof iconMap] ?? HelpCircle;
}

function nodeFallbackIcon(node: AdventureBoardNode): keyof typeof iconMap {
  if (node.kind === "start") return "check";
  if (node.kind === "choice-gate") return "choice";
  if (node.kind === "mystery") return "mystery";
  if (node.kind === "quest") return "star";
  if (node.kind === "boss") return "crown";
  if (node.activityId === "word-radar") return "radar";
  if (node.activityId === "spell-check") return "book";
  return "game";
}

function boardBackground(board: AdventureBoardJson): React.CSSProperties {
  const background = board.theme.background;
  if (background.type === "image") {
    return { backgroundImage: `url(${background.value})` };
  }
  if (background.type === "solid") {
    return { background: background.value };
  }
  return { background: background.value };
}

function resolveNodePosition(node: AdventureBoardNode): PositionedAdventureBoardNode | null {
  const position = node.position ?? (node.slot ? HORIZONTAL_ADVENTURE_SLOTS[node.slot] : undefined);
  return position ? { ...node, position } : null;
}

function AdventureChoiceOverlay({
  choiceSet,
  onSelect,
  onDismiss,
}: {
  choiceSet: AdventureChoiceSet | null;
  onSelect: (option: AdventureChoiceOption) => void;
  onDismiss: () => void;
}) {
  if (!choiceSet) return null;

  return (
    <div
      className="adventure-board__choice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={choiceSet.title}
    >
      <button
        type="button"
        className="adventure-board__choice-back"
        onClick={onDismiss}
      >
        Back to map
      </button>
      <div className="adventure-board__choice-stage">
        <p className="adventure-board__choice-kicker">
          {choiceSet.kind === "mystery" ? "Three Doors" : choiceSet.kind}
        </p>
        <h2>{choiceSet.title}</h2>
        <div className="adventure-board__choice-cards">
          {choiceSet.options.map((option) => {
            const Icon = iconFor(option.icon, "sparkles");
            const locked = option.state === "locked";
            return (
              <button
                type="button"
                key={option.id}
                className={[
                  "adventure-board__choice-card",
                  locked ? "adventure-board__choice-card--locked" : "",
                ].join(" ")}
                disabled={locked}
                onClick={() => onSelect(option)}
              >
                <span className="adventure-board__choice-art">
                  {option.thumbnailUrl ? (
                    <img src={option.thumbnailUrl} alt="" />
                  ) : locked ? (
                    <Lock size={34} strokeWidth={2.4} />
                  ) : (
                    <Icon size={38} strokeWidth={2.4} />
                  )}
                  {option.thumbnailUrl ? (
                    <span className="adventure-board__choice-art-badge">
                      {locked ? <Lock size={18} strokeWidth={2.5} /> : <Icon size={20} strokeWidth={2.5} />}
                    </span>
                  ) : null}
                </span>
                <span className="adventure-board__choice-card-copy">
                  <span className="adventure-board__choice-purpose">
                    {option.tags?.[0] ?? choiceSet.kind}
                  </span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                  {option.lock ? <small>Locked: {option.lock.label}</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdventureBoard({
  board,
  onNodeClick,
  onChoiceClick,
}: AdventureBoardProps): React.ReactElement {
  const resolvedNodes = board.nodes.flatMap((node) => {
    const positionedNode = resolveNodePosition(node);
    return positionedNode ? [positionedNode] : [];
  });
  const nodes = new Map(resolvedNodes.map((node) => [node.id, node]));
  const choiceSetsById = new Map((board.choiceSets ?? []).map((set) => [set.id, set]));
  const [openChoiceSetId, setOpenChoiceSetId] = useState<string | null>(null);
  const openChoiceSet = openChoiceSetId ? choiceSetsById.get(openChoiceSetId) ?? null : null;

  return (
    <section
      className="adventure-board"
      style={{
        ...boardBackground(board),
        "--board-path": board.theme.palette.path,
        "--board-completed": board.theme.palette.completed,
        "--board-available": board.theme.palette.available,
        "--board-locked": board.theme.palette.locked,
        "--board-current": board.theme.palette.current,
        "--board-preview": board.theme.palette.preview,
        "--board-text": board.theme.palette.text,
        "--board-panel": board.theme.palette.panel,
      } as React.CSSProperties}
      aria-label={board.title ?? "Adventure board"}
    >
      <svg className="adventure-board__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {board.edges.map((edge) => {
          const from = nodes.get(edge.from);
          const to = nodes.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              className={[
                "adventure-board__edge",
                `adventure-board__edge--${edge.state}`,
                edge.style ? `adventure-board__edge--${edge.style}` : "",
              ].join(" ")}
              x1={from.position.x * 100}
              y1={from.position.y * 100}
              x2={to.position.x * 100}
              y2={to.position.y * 100}
            />
          );
        })}
      </svg>

      <div className="adventure-board__nodes">
        {resolvedNodes.filter((node) => node.state !== "hidden").map((node) => {
          const Icon = iconFor(node.icon, nodeFallbackIcon(node));
          const isLocked = node.state === "locked";
          const isPreparing = node.state === "preview";
          const isCompleted = node.state === "completed";
          return (
            <button
              key={node.id}
              type="button"
              className={[
                "adventure-board__node",
                `adventure-board__node--${node.kind}`,
                `adventure-board__node--${node.state}`,
              ].join(" ")}
              style={{
                left: `${node.position.x * 100}%`,
                top: `${node.position.y * 100}%`,
              }}
              onClick={() => {
                if (node.choiceSetId && choiceSetsById.has(node.choiceSetId)) {
                  setOpenChoiceSetId(node.choiceSetId);
                }
                onNodeClick?.(node);
              }}
              aria-label={`${node.label}${node.lock ? `, ${node.lock.label}` : ""}`}
            >
              <span className="adventure-board__node-orb">
                {node.thumbnailUrl ? (
                  <>
                    <img className="adventure-board__node-thumbnail" src={node.thumbnailUrl} alt="" />
                    {isCompleted || isLocked || isPreparing ? (
                      <span className="adventure-board__node-state-badge">
                        {isCompleted ? (
                          <Check size={22} strokeWidth={3} />
                        ) : isLocked ? (
                          <Lock size={18} strokeWidth={2.5} />
                        ) : (
                          <MoreHorizontal size={22} strokeWidth={2.6} />
                        )}
                      </span>
                    ) : null}
                  </>
                ) : isCompleted ? (
                  <Check size={34} strokeWidth={3} />
                ) : isPreparing ? (
                  <MoreHorizontal size={34} strokeWidth={2.6} />
                ) : isLocked ? (
                  <Lock size={24} strokeWidth={2.4} />
                ) : (
                  <Icon size={30} strokeWidth={2.3} />
                )}
              </span>
              <span className="adventure-board__node-label">{node.shortLabel ?? node.label}</span>
              {node.lock ? (
                <span className="adventure-board__lock-label">{node.lock.progressLabel ?? node.lock.label}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <AdventureChoiceOverlay
        choiceSet={openChoiceSet}
        onDismiss={() => setOpenChoiceSetId(null)}
        onSelect={(option) => {
          onChoiceClick?.(option);
          setOpenChoiceSetId(null);
        }}
      />
    </section>
  );
}
