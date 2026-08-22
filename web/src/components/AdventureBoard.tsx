import React, { useEffect, useRef, useState } from "react";
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
import { AdventureChoiceModal } from "./AdventureChoiceModal";
import "./AdventureBoard.css";

type AdventureBoardProps = {
  board: AdventureBoardJson;
  completedNodeIds?: readonly string[];
  inspectBaselineNodes?: boolean;
  onNodeClick?: (node: AdventureBoardNode) => void;
  onChoiceClick?: (option: AdventureChoiceOption, choiceSet: AdventureChoiceSet) => void;
  onUnlockCeremony?: (event: UnlockCeremonyEvent) => void;
};

export type UnlockCeremonyVariant = "power" | "gate" | "warp" | "thunder";

export type UnlockCeremonyEvent = {
  nodeId: string;
  kind: "quest" | "boss";
  label: string;
  variant: UnlockCeremonyVariant;
};

const UNLOCK_CEREMONY_PAIRS: ReadonlyArray<{
  quest: UnlockCeremonyVariant;
  boss: UnlockCeremonyVariant;
}> = [
  { quest: "power", boss: "thunder" },
  { quest: "gate", boss: "power" },
  { quest: "warp", boss: "gate" },
];

function stablePresentationHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function unlockCeremonyVariantFor(
  boardId: string,
  kind: "quest" | "boss",
): UnlockCeremonyVariant {
  const pair = UNLOCK_CEREMONY_PAIRS[stablePresentationHash(boardId) % UNLOCK_CEREMONY_PAIRS.length]!;
  return pair[kind];
}

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

export function AdventureBoard({
  board,
  completedNodeIds = [],
  inspectBaselineNodes = false,
  onNodeClick,
  onChoiceClick,
  onUnlockCeremony,
}: AdventureBoardProps): React.ReactElement {
  const previousNodeStates = useRef(new Map(board.nodes.map((node) => [node.id, node.state])));
  const unlockCeremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unlockCeremony, setUnlockCeremony] = useState<UnlockCeremonyEvent | null>(null);
  const [preparingMessage, setPreparingMessage] = useState<string | null>(null);

  useEffect(() => {
    const newlyUnlocked = board.nodes.find((node) => {
      if (node.kind !== "quest" && node.kind !== "boss") return false;
      const previousState = previousNodeStates.current.get(node.id);
      return (
        (previousState === "locked" || previousState === "preview") &&
        (node.state === "available" || node.state === "current")
      );
    });
    previousNodeStates.current = new Map(board.nodes.map((node) => [node.id, node.state]));
    if (!newlyUnlocked) return;

    if (unlockCeremonyTimer.current) clearTimeout(unlockCeremonyTimer.current);
    const event: UnlockCeremonyEvent = {
      nodeId: newlyUnlocked.id,
      kind: newlyUnlocked.kind === "boss" ? "boss" : "quest",
      label: newlyUnlocked.shortLabel ?? newlyUnlocked.label,
      variant: unlockCeremonyVariantFor(
        board.boardId,
        newlyUnlocked.kind === "boss" ? "boss" : "quest",
      ),
    };
    setUnlockCeremony(event);
    onUnlockCeremony?.(event);
    unlockCeremonyTimer.current = setTimeout(() => {
      setUnlockCeremony(null);
      unlockCeremonyTimer.current = null;
    }, 2400);
  }, [board.boardId, board.nodes, onUnlockCeremony]);

  useEffect(() => () => {
    if (unlockCeremonyTimer.current) clearTimeout(unlockCeremonyTimer.current);
  }, []);

  const completedNodeIdSet = new Set(completedNodeIds);
  const resolvedNodes = board.nodes.flatMap((node) => {
    const positionedNode = resolveNodePosition(node);
    if (!positionedNode) return [];
    if (
      inspectBaselineNodes &&
      positionedNode.state === "locked" &&
      positionedNode.kind !== "quest" &&
      positionedNode.kind !== "boss" &&
      positionedNode.kind !== "mystery" &&
      positionedNode.kind !== "reward"
    ) {
      return [{ ...positionedNode, state: "available" as const, lock: undefined }];
    }
    if (
      completedNodeIdSet.has(positionedNode.id) &&
      positionedNode.state !== "locked" &&
      positionedNode.state !== "hidden"
    ) {
      return [{ ...positionedNode, state: "completed" as const }];
    }
    return [positionedNode];
  });
  const projectedChoiceSets = (board.choiceSets ?? []).map((choiceSet) =>
    inspectBaselineNodes && choiceSet.kind === "baseline-route"
      ? {
          ...choiceSet,
          options: choiceSet.options.map((option) => ({
            ...option,
            state: "available" as const,
            lock: undefined,
          })),
        }
      : choiceSet,
  );
  const choiceSetsById = new Map(projectedChoiceSets.map((set) => [set.id, set]));
  const [openChoiceSetId, setOpenChoiceSetId] = useState<string | null>(null);
  const openChoiceSet = openChoiceSetId ? choiceSetsById.get(openChoiceSetId) ?? null : null;
  const nodes = new Map(resolvedNodes.map((node) => [node.id, node]));

  return (
    <section
      className={[
        "adventure-board",
        unlockCeremony ? `adventure-board--unlocking-${unlockCeremony.variant}` : "",
      ].join(" ")}
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
                unlockCeremony?.nodeId === edge.to ? "adventure-board__edge--unlocking" : "",
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
                unlockCeremony?.nodeId === node.id ? "adventure-board__node--unlocking" : "",
                unlockCeremony?.nodeId === node.id
                  ? `adventure-board__node--unlocking-${unlockCeremony.variant}`
                  : "",
              ].join(" ")}
              style={{
                left: `${node.position.x * 100}%`,
                top: `${node.position.y * 100}%`,
              }}
              onClick={() => {
                if (isPreparing) {
                  setPreparingMessage(`${node.shortLabel ?? node.label} is still being prepared. You can keep exploring or come back later.`);
                  return;
                }
                setPreparingMessage(null);
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

      {preparingMessage ? (
        <div className="adventure-board__preparing-message" role="status" aria-live="polite">
          {preparingMessage}
        </div>
      ) : null}

      {unlockCeremony ? (
        <>
          <div className="adventure-board__unlock-effects" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i
                key={index}
                style={{
                  left: `${6 + ((index * 17) % 88)}%`,
                  "--unlock-delay": `${0.08 + (index % 7) * 0.08}s`,
                  "--unlock-drift": `${-70 + ((index * 31) % 140)}px`,
                } as React.CSSProperties}
              />
            ))}
          </div>
          <div
            className={[
              "adventure-board__unlock-ceremony",
              `adventure-board__unlock-ceremony--${unlockCeremony.variant}`,
            ].join(" ")}
            role="status"
            aria-live="polite"
            aria-label={`${unlockCeremony.kind === "quest" ? "Quest" : "Boss"} unlocked`}
            data-unlock-ceremony-node={unlockCeremony.nodeId}
            data-unlock-ceremony-variant={unlockCeremony.variant}
          >
            <Sparkles aria-hidden="true" size={28} strokeWidth={2.4} />
            <span>
              {unlockCeremony.kind === "quest" ? "Quest unlocked" : "Boss unlocked"}
              <strong>{unlockCeremony.label}</strong>
            </span>
          </div>
        </>
      ) : null}

      <AdventureChoiceModal
        choiceSet={openChoiceSet}
        open={Boolean(openChoiceSet)}
        onDismiss={() => setOpenChoiceSetId(null)}
        onSelect={(option) => {
          if (openChoiceSet) {
            onChoiceClick?.(option, openChoiceSet);
          }
          setOpenChoiceSetId(null);
        }}
      />
    </section>
  );
}
