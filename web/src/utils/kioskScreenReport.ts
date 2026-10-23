import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type { PreparationWaitingReport } from "../components/AdventurePreparation/useAppAdventurePreparation";

/** What the kiosk is showing, as reported to Sunny. The only description of the screen Elli receives. */
export type KioskScreenReport = {
  screen: "loading" | "unavailable" | "evaluation" | "waiting" | "board" | "activity";
  boardId?: string;
  boardTitle?: string;
  nodeId?: string;
  activityTitle?: string;
  waiting?: PreparationWaitingReport;
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
}): KioskScreenReport {
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
