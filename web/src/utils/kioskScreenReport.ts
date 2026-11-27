import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type { PreparationWaitingReport } from "../components/AdventurePreparation/useAppAdventurePreparation";

/** What the kiosk is showing, as reported to Sunny. The only description of the screen Elli receives. */
export type KioskScreenReport = {
  screen: "loading" | "unavailable" | "evaluation" | "waiting" | "board" | "activity" | "resting";
  boardId?: string;
  boardTitle?: string;
  nodeId?: string;
  activityTitle?: string;
  waiting?: PreparationWaitingReport;
  /** What the board portrait draws her wearing, by store name ("" = her own clothes / none); 2026-11-15, W8. */
  companionLook?: { outfit: string; accessory: string };
};

/** Mirrors the App's own render decisions, so the report names the screen the child actually sees. */
export function kioskScreenReport(input: {
  packet: ChildExperiencePacket | null;
  packetLoading: boolean;
  sessionReady: boolean;
  directDiscovery: boolean;
  waiting: PreparationWaitingReport | null;
  heldStatusShown: boolean;
  launch: { nodeId: string; title?: string } | null;
  /** The session is over: the App renders its resting screen ahead of everything else. */
  finished?: boolean;
  companionLook?: { outfit: string; accessory: string } | null;
}): KioskScreenReport {
  const report = screenReportOf(input);
  return input.companionLook ? { ...report, companionLook: input.companionLook } : report;
}

function screenReportOf(input: Parameters<typeof kioskScreenReport>[0]): KioskScreenReport {
  if (input.finished) return { screen: "resting" };
  if (!input.packet) return { screen: input.packetLoading ? "loading" : "unavailable" };
  const board = input.packet.activeSessionPlan?.adventureBoard;
  const boardId = board?.boardId ? { boardId: board.boardId } : {};
  const activity = (screen: "evaluation" | "activity", launch: { nodeId: string; title?: string }): KioskScreenReport =>
    ({ screen, ...boardId, nodeId: launch.nodeId, ...(launch.title ? { activityTitle: launch.title } : {}) });
  if (input.waiting) return { screen: "waiting", ...boardId, waiting: input.waiting };
  if (input.directDiscovery) return input.sessionReady && input.launch ? activity("evaluation", input.launch) : { screen: "loading" };
  if (input.heldStatusShown) return { screen: "waiting", ...boardId };
  if (input.launch) return activity("activity", input.launch);
  return { screen: "board", ...boardId, ...(board?.title ? { boardTitle: board.title } : {}) };
}
