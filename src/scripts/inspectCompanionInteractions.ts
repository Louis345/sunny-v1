import {
  readCompanionCareMemoryForPrompt,
  readCompanionInteractionEvents,
} from "../server/companionInteractionMemory";

type InspectArgs = {
  childId: string;
  companionId: string;
  limit: number;
};

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseArgs(): InspectArgs | null {
  const childId = readFlag("child")?.trim().toLowerCase() ?? "";
  const companionId = readFlag("companion")?.trim().toLowerCase() ?? "";
  const limitRaw = Number(readFlag("limit") ?? 8);
  if (!childId || !companionId) return null;
  return {
    childId,
    companionId,
    limit: Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 8,
  };
}

function printUsage(): void {
  console.log(
    "Usage: npx tsx src/scripts/inspectCompanionInteractions.ts --child=ila --companion=elli [--limit=8]",
  );
}

function main(): void {
  const args = parseArgs();
  if (!args) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const events = readCompanionInteractionEvents(args.childId, args.companionId);
  const latestEvents = events.slice(-args.limit);
  const memory = readCompanionCareMemoryForPrompt(args.childId, args.companionId) ?? null;
  console.log(
    JSON.stringify(
      {
        childId: args.childId,
        companionId: args.companionId,
        eventCount: events.length,
        latestEvents,
        memory,
      },
      null,
      2,
    ),
  );
}

main();
