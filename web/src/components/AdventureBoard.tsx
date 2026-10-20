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
  onChoiceVisibilityChange?: (choiceSet: AdventureChoiceSet, opened: boolean) => void;
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
  narrowPosition: { x: number; y: number };
  mediumPosition: { x: number; y: number };
};

export const HORIZONTAL_ADVENTURE_SLOTS: Record<AdventureBoardSlot, { x: number; y: number }> = {
  "1": { x: 0.10, y: 0.82 },
  "2": { x: 0.22, y: 0.68 },
  "3": { x: 0.33, y: 0.56 },
  "4": { x: 0.43, y: 0.50 },
  "5a.1": { x: 0.52, y: 0.25 },
  "5a.2": { x: 0.62, y: 0.20 },
  "5a.3": { x: 0.70, y: 0.25 },
  "5b.1": { x: 0.52, y: 0.73 },
  "5b.2": { x: 0.62, y: 0.78 },
  "5b.3": { x: 0.70, y: 0.73 },
  "5c.1": { x: 0.52, y: 0.50 },
  "5c.2": { x: 0.62, y: 0.50 },
  "5c.3": { x: 0.70, y: 0.50 },
  "6": { x: 0.76, y: 0.50 },
  "6.1": { x: 0.87, y: 0.72 },
  "6.2": { x: 0.78, y: 0.42 },
  "7": { x: 0.84, y: 0.31 },
  "8": { x: 0.91, y: 0.13 },
};

// The same topology needs vertical lanes on a narrow kiosk. Coordinates are
// presentation only; explicit Creator positions and all route identities stay intact.
const NARROW_ADVENTURE_SLOTS: Record<AdventureBoardSlot, { x: number; y: number }> = {
  "1": { x: 0.13, y: 0.89 }, "2": { x: 0.13, y: 0.72 },
  "3": { x: 0.13, y: 0.55 }, "4": { x: 0.50, y: 0.78 },
  "5a.1": { x: 0.36, y: 0.58 }, "5a.2": { x: 0.36, y: 0.42 }, "5a.3": { x: 0.36, y: 0.23 },
  "5b.1": { x: 0.61, y: 0.58 }, "5b.2": { x: 0.61, y: 0.42 }, "5b.3": { x: 0.61, y: 0.23 },
  "5c.1": { x: 0.86, y: 0.58 }, "5c.2": { x: 0.86, y: 0.42 }, "5c.3": { x: 0.86, y: 0.23 },
  "6": { x: 0.61, y: 0.08 }, "6.1": { x: 0.36, y: 0.08 }, "6.2": { x: 0.86, y: 0.08 },
  "7": { x: 0.86, y: 0.76 }, "8": { x: 0.86, y: 0.92 },
};

const MEDIUM_ADVENTURE_SLOTS: Record<AdventureBoardSlot, { x: number; y: number }> = {
  "1": { x: 0.10, y: 0.78 }, "2": { x: 0.10, y: 0.56 }, "3": { x: 0.10, y: 0.34 }, "4": { x: 0.28, y: 0.34 },
  "5a.1": { x: 0.46, y: 0.13 }, "5a.2": { x: 0.64, y: 0.13 }, "5a.3": { x: 0.82, y: 0.13 },
  "5b.1": { x: 0.46, y: 0.56 }, "5b.2": { x: 0.64, y: 0.56 }, "5b.3": { x: 0.82, y: 0.56 },
  "5c.1": { x: 0.46, y: 0.34 }, "5c.2": { x: 0.64, y: 0.34 }, "5c.3": { x: 0.82, y: 0.34 },
  "6": { x: 0.94, y: 0.34 }, "6.1": { x: 0.46, y: 0.78 }, "6.2": { x: 0.64, y: 0.78 },
  "7": { x: 0.82, y: 0.78 }, "8": { x: 0.28, y: 0.78 },
};

function narrowPosition(node: PositionedAdventureBoardNode) {
  return node.narrowPosition;
}

function nodePositionStyle(node: PositionedAdventureBoardNode): React.CSSProperties {
  const narrow = narrowPosition(node);
  return {
    left: `${node.position.x * 100}%`, top: `${node.position.y * 100}%`,
    "--narrow-x": `${narrow.x * 100}%`, "--narrow-y": `${narrow.y * 100}%`,
    "--medium-x": `${node.mediumPosition.x * 100}%`, "--medium-y": `${node.mediumPosition.y * 100}%`,
  } as React.CSSProperties;
}

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
    // The panel colour shows if the illustration fails to load.
    return { backgroundImage: `url(${background.value})`, backgroundColor: board.theme.palette.panel };
  }
  if (background.type === "solid") {
    return { background: background.value };
  }
  return { background: background.value };
}

function resolveNodePosition(node: AdventureBoardNode): PositionedAdventureBoardNode | null {
  const position = node.position ?? (node.slot ? HORIZONTAL_ADVENTURE_SLOTS[node.slot] : undefined);
  const narrowPosition = node.portraitPosition ?? node.position ?? (node.slot ? NARROW_ADVENTURE_SLOTS[node.slot] : undefined);
  const mediumPosition = node.position ?? (node.slot ? MEDIUM_ADVENTURE_SLOTS[node.slot] : undefined);
  return position && narrowPosition && mediumPosition ? { ...node, position, narrowPosition, mediumPosition } : null;
}

export function AdventureBoard({
  board,
  completedNodeIds = [],
  inspectBaselineNodes = false,
  onNodeClick,
  onChoiceClick,
  onChoiceVisibilityChange,
  onUnlockCeremony,
}: AdventureBoardProps): React.ReactElement {
  const previousNodeStates = useRef(new Map(board.nodes.map((node) => [node.id, node.state])));
  const unlockCeremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unlockCeremony, setUnlockCeremony] = useState<UnlockCeremonyEvent | null>(null);
  const [preparingMessage, setPreparingMessage] = useState<string | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<string>>(() => new Set());

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
  const directRouteChoicesByNodeId = new Map<
    string,
    { option: AdventureChoiceOption; choiceSet: AdventureChoiceSet }
  >();
  for (const choiceSet of projectedChoiceSets) {
    if (board.definition || choiceSet.kind !== "baseline-route") continue;
    for (const option of choiceSet.options) {
      const hasLaunchTarget = Boolean(
        option.gameHtmlPath || option.activityConfigPath || option.activityId,
      );
      if (option.nodeId && option.state === "available" && hasLaunchTarget) {
        directRouteChoicesByNodeId.set(option.nodeId, { option, choiceSet });
      }
    }
  }

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
    if (
      positionedNode.state === "locked" &&
      directRouteChoicesByNodeId.has(positionedNode.id)
    ) {
      return [{ ...positionedNode, state: "available" as const, lock: undefined }];
    }
    return [positionedNode];
  });
  const [openChoiceSetId, setOpenChoiceSetId] = useState<string | null>(null);
  const openChoiceSet = openChoiceSetId ? choiceSetsById.get(openChoiceSetId) ?? null : null;
  const nodes = new Map(resolvedNodes.map((node) => [node.id, node]));

  return (
    <section
      data-board-id={board.boardId}
      data-child-id={board.childId}
      data-plan-id={board.planId}
      className={[
        "adventure-board",
        board.definition ? "adventure-board--authored" : "",
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
      <div className="adventure-board__composition">
      {(["wide", "medium", "narrow"] as const).map(layout => <svg key={layout} className={`adventure-board__edges adventure-board__edges--${layout}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {board.edges.map((edge) => {
          const from = nodes.get(edge.from);
          const to = nodes.get(edge.to);
          if (!from || !to) return null;
          const fromPosition = layout === "narrow" ? narrowPosition(from) : layout === "medium" ? from.mediumPosition : from.position;
          const toPosition = layout === "narrow" ? narrowPosition(to) : layout === "medium" ? to.mediumPosition : to.position;
          return (
            <polyline
              key={edge.id}
              className={[
                "adventure-board__edge",
                `adventure-board__edge--${edge.state}`,
                edge.style ? `adventure-board__edge--${edge.style}` : "",
                unlockCeremony?.nodeId === edge.to ? "adventure-board__edge--unlocking" : "",
              ].join(" ")}
              fill="none"
              points={[fromPosition,...(edge.controlPoints?.[layout === 'narrow' ? 'portrait' : 'landscape'] ?? []),toPosition].map(point=>`${point.x*100},${point.y*100}`).join(' ')}
            />
          );
        })}
      </svg>)}

      <div className="adventure-board__nodes">
        {resolvedNodes.filter((node) => node.state !== "hidden").map((node) => {
          const Icon = iconFor(node.icon, nodeFallbackIcon(node));
          const thumbnailKey = `${node.id}:${node.thumbnailUrl ?? ""}`;
          const showThumbnail = Boolean(
            node.thumbnailUrl && !brokenThumbnails.has(thumbnailKey),
          );
          const directRouteChoice = directRouteChoicesByNodeId.get(node.id);
          const isRouteGuidance =
            node.kind === "choice-gate" &&
            Boolean(node.choiceSetId) &&
            choiceSetsById.get(node.choiceSetId!)?.kind === "baseline-route";
          const isLocked = node.state === "locked";
          const isPreparing =
            node.state === "preview" ||
            node.lock?.label.trim().toLowerCase() === "preparing";
          const isCompleted = node.state === "completed";
          const content = (
            <>
              <span className="adventure-board__node-orb">
                {showThumbnail ? (
                  <>
                    <img
                      className="adventure-board__node-thumbnail"
                      src={node.thumbnailUrl}
                      alt=""
                      onError={() => {
                        console.warn(` 🎮 [adventure-board] [thumbnail] [fallback] node=${node.id}`);
                        setBrokenThumbnails((current) => new Set(current).add(thumbnailKey));
                      }}
                    />
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
            </>
          );

          if (isRouteGuidance && !board.definition) {
            return (
              <div
                key={node.id}
                role="note"
                aria-label={node.label}
                className={[
                  "adventure-board__node",
                  "adventure-board__node--choice-gate",
                  "adventure-board__node--choice-guidance",
                  `adventure-board__node--${node.state}`,
                ].join(" ")}
                style={nodePositionStyle(node)}
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={node.id}
              data-portal-id={node.id}
              data-activity-node-id={node.activityNodeId}
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
              style={nodePositionStyle(node)}
              onClick={() => {
                if (board.definition && isLocked) return;
                if (isPreparing) {
                  console.log(` 🎮 [adventure-board] [preparing-node] [acknowledged] node=${node.id}`);
                  setPreparingMessage(`${node.shortLabel ?? node.label} is still being prepared. You can keep exploring or come back later.`);
                  return;
                }
                setPreparingMessage(null);
                if (directRouteChoice) {
                  console.log(` 🎮 [adventure-board] [route-choice] [selected] node=${node.id}`);
                  onChoiceClick?.(directRouteChoice.option, directRouteChoice.choiceSet);
                  return;
                }
                if (node.choiceSetId && choiceSetsById.has(node.choiceSetId)) {
                  setOpenChoiceSetId(node.choiceSetId);
                  onChoiceVisibilityChange?.(choiceSetsById.get(node.choiceSetId)!,true);
                }
                onNodeClick?.(node);
              }}
              aria-label={`${node.label}${node.lock ? `, ${node.lock.label}` : ""}`}
            >
              {content}
            </button>
          );
        })}
      </div>

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
        onDismiss={() => { if(openChoiceSet) onChoiceVisibilityChange?.(openChoiceSet,false); setOpenChoiceSetId(null); }}
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
