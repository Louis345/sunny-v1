import * as fs from "fs";
import * as path from "path";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import {
  buildChildExperiencePacket,
  type ChildExperiencePacket,
} from "../profiles/childExperiencePacket";

type WritePacketOptions = {
  childId: string;
  outPath: string;
  boardJsonPath?: string;
};

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function packetWithBoard(
  packet: ChildExperiencePacket,
  board: AdventureBoardJson,
): ChildExperiencePacket {
  const existingPlan = packet.activeSessionPlan;
  const activeSessionPlan: ActiveSessionPlan = {
    planId: board.planId,
    childId: packet.childChart.childId,
    createdAt: existingPlan?.createdAt ?? "2026-05-26T00:00:00.000Z",
    source: existingPlan?.source ?? "runtime_fallback",
    domain: board.domain,
    testDate: existingPlan?.testDate ?? null,
    nodePlan: existingPlan?.nodePlan ?? [],
    adventureBoard: board,
    variationPolicy:
      existingPlan?.variationPolicy ??
      {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: board.boardId,
        previousCompletedNodeCount: board.progress?.completedNodeIds.length ?? 0,
      },
    companionPolicy:
      existingPlan?.companionPolicy ??
      {
        companionId: packet.childChart.companion.id,
        displayName: packet.childChart.companion.displayName,
        openingLinePolicy: "silent",
        verbosity: "low",
        maxMicroProbes: 0,
      },
    evidenceUsed: existingPlan?.evidenceUsed ?? [],
    openQuestions: existingPlan?.openQuestions ?? [],
  };

  return {
    ...packet,
    activeSessionPlan,
  };
}

export function buildChildExperiencePacketFixture(
  options: Pick<WritePacketOptions, "childId" | "boardJsonPath">,
): ChildExperiencePacket {
  const packet = buildChildExperiencePacket(getChildChart(options.childId));
  const portablePacket: ChildExperiencePacket = {
    ...packet,
    childChart: {
      ...packet.childChart,
      companionCare: {
        ...packet.childChart.companionCare,
        filePath: "",
      },
    },
  };

  if (!options.boardJsonPath) return portablePacket;

  const board = readJsonFile<AdventureBoardJson>(path.resolve(options.boardJsonPath));
  return packetWithBoard(portablePacket, board);
}

export function writeChildExperiencePacketFixture(options: WritePacketOptions): ChildExperiencePacket {
  const packet = buildChildExperiencePacketFixture(options);
  const outPath = path.resolve(options.outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(
    `🎮 [child-experience-packet] [write] child=${options.childId} out=${outPath} hasBoard=${Boolean(
      packet.activeSessionPlan?.adventureBoard,
    )}`,
  );
  return packet;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const childId = argValue(argv, "child") ?? "reina";
  const outPath =
    argValue(argv, "out") ?? `web/src/storybook/${childId}-chart-experience-packet.json`;
  const boardJsonPath = argValue(argv, "board-json");

  writeChildExperiencePacketFixture({ childId, outPath, boardJsonPath });
}

if (process.argv[1]?.includes("writeChildExperiencePacketFixture")) {
  void main().catch((error) => {
    console.error("🎮 [child-experience-packet] [write] failed", error);
    process.exitCode = 1;
  });
}
