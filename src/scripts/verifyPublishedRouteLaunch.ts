import path from "node:path";
import type { ChildExperiencePacket } from "../profiles/childExperiencePacket";

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main(): Promise<void> {
  const baseUrl = option("base-url", "http://127.0.0.1:3001").replace(/\/$/, "");
  const childId = option("child", "reina").trim().toLowerCase();
  const response = await fetch(`${baseUrl}/api/child-experience/${encodeURIComponent(childId)}`);
  if (!response.ok) throw new Error(`published_packet_http_${response.status}`);
  const packet = await response.json() as ChildExperiencePacket;
  const plan = packet.activeSessionPlan;
  const board = plan?.adventureBoard;
  const choiceSet = board?.choiceSets?.find((set) => set.kind === "baseline-route");
  if (!plan?.activeHomeworkId || !board || !choiceSet || choiceSet.options.length < 2) {
    throw new Error("published_route_choice_missing");
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of choiceSet.options) {
      if (!route.nodeId) throw new Error(`published_route_destination_missing:${route.id}`);
      const destination = board.nodes.find((node) => node.id === route.nodeId);
      const planNode = plan.nodePlan.find((node) => node.id === route.nodeId);
      if (!destination || !planNode?.gameHtmlPath) {
        throw new Error(`published_route_node_missing:${route.id}:${route.nodeId}`);
      }
      const expectedFilename = path.basename(planNode.gameHtmlPath);
      const expectedPath = `/api/homework/game/${childId}/${plan.activeHomeworkId}/${expectedFilename}`;
      const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
        const gate = page.getByRole("button", { name: choiceSet.title, exact: false });
        await gate.waitFor({ state: "visible", timeout: 120_000 });
        await gate.click();
        const modal = page.getByTestId("adventure-choice-modal");
        await modal.waitFor({ state: "visible", timeout: 15_000 });
        const card = modal.getByTestId("adventure-choice-card").filter({ hasText: route.label });
        await card.click();
        await modal.waitFor({ state: "hidden", timeout: 15_000 });

        const iframe = page.locator('iframe[title="generated-baseline"]');
        await iframe.waitFor({ state: "visible", timeout: 30_000 });
        const iframeSrc = await iframe.getAttribute("src");
        if (!iframeSrc?.includes(expectedPath)) {
          throw new Error(`published_route_wrong_url:${route.id}:expected=${expectedPath}:actual=${iframeSrc ?? "missing"}`);
        }
        await page.frameLocator('iframe[title="generated-baseline"]')
          .getByText(destination.label, { exact: false })
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
        console.log(`🎮 [published-route-launch] [passed] route=${route.id} node=${route.nodeId}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`🎮 [published-route-launch] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
