import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { generateMathDiscoveryExperience } from "./adaptiveMathDiscovery";
import { discoveryCeremonyHtml, discoveryFixtureAcademic } from "./discoveryCeremonyFixture.test-helper";
import { DISCOVERY_VERIFIER_VERSION, MATH_IMPLEMENTATION_REPAIR_CONTRACT, MATH_JOURNEY_CONTRACT } from "./discoveryVisualReview";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

it("keeps provider-facing Creator instructions byte-stable so verifier work never invalidates paid builds", () => {
  // Changing either text changes builder/repair request hashes. Treat that as a
  // provider-input change requiring explicit approval, never as verifier work.
  expect(sha(MATH_JOURNEY_CONTRACT)).toBe("b09a5adf4d5e74e975fa0a1041ca7782d13cefd6845f015f8b503411e1737c42");
  expect(sha(MATH_IMPLEMENTATION_REPAIR_CONTRACT)).toBe("e1d2358a846628b37828769882dd9c2c95b60d4e5884074185da763a2926eee9");
});

function paidRun() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-verifier-resume-"));
  roots.push(rootDir);
  const homeworkId = "hw-math-resume";
  const draftDir = path.join(rootDir, "src/context/lab-child/homework/direct-drafts", homeworkId);
  const input = {
    rootDir,
    childId: "lab-child",
    homeworkId,
    assignmentText: "Equal groups of fruit.",
    assignmentEvidenceIds: ["assignment:fixture"],
    factualChildContext: { age: 9 },
  };
  let generationCalls = 0;
  const approve = { content: [{ type: "tool_use", name: "record_visual_verdict", input: { decision: "approve", findings: [] } }] };
  const paidClient = {
    messages: {
      stream: (request: { messages: Array<{ content: unknown }> }) => ({ finalMessage: async () => {
        generationCalls += 1;
        if (generationCalls === 1) return { content: [{ type: "tool_use", name: "create_math_discovery_contract", input: discoveryFixtureAcademic() }] };
        if (generationCalls === 2) {
          const text = JSON.stringify(request.messages[0]!.content);
          const contractHash = text.match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1];
          return { content: [{ type: "tool_use", name: "create_math_discovery_design", input: { contractHash, design: { firstAction: "Open the market" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" } }] };
        }
        return { stop_reason: "end_turn", content: [{ type: "text", text: discoveryCeremonyHtml({ runtimeContract: true }) }] };
      } }),
      create: vi.fn(async () => approve),
    },
  };
  return { input, draftDir, paidClient, approve, generationCalls: () => generationCalls };
}

it("re-verifies saved Discovery after a verifier-only upgrade without Planner, design, builder, or repair calls", async () => {
  const run = paidRun();
  const first = await generateMathDiscoveryExperience({ ...run.input, client: run.paidClient as never });
  expect(run.generationCalls()).toBe(3);

  const checkpointFile = path.join(run.draftDir, "visual-review/visual-review-checkpoint.json");
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
  fs.writeFileSync(checkpointFile, JSON.stringify({ ...checkpoint, version: DISCOVERY_VERIFIER_VERSION - 1, verificationKey: "stale" }));
  const acceptanceFile = path.join(run.draftDir, "runtime-verification/acceptance.json");
  fs.writeFileSync(acceptanceFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(acceptanceFile, "utf8")), verifierVersion: DISCOVERY_VERIFIER_VERSION - 1 }));
  fs.rmSync(path.join(run.draftDir, "discovery-contract.json"));

  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const stream = vi.fn(() => { throw new Error("paid_generation_repeated"); });
  const resumed = await generateMathDiscoveryExperience({
    ...run.input,
    client: { messages: { stream, create: vi.fn(async () => run.approve) } } as never,
  });

  expect(stream).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(resumed.contract.artifact.artifactHash).toBe(first.contract.artifact.artifactHash);
  expect(JSON.parse(fs.readFileSync(acceptanceFile, "utf8")).verifierVersion).toBe(DISCOVERY_VERIFIER_VERSION);
}, 90000);

it("refuses to silently reuse or re-buy a build when its provider input changed", async () => {
  const run = paidRun();
  await generateMathDiscoveryExperience({ ...run.input, client: run.paidClient as never });
  const designFile = path.join(run.draftDir, "discovery-design.json");
  const design = JSON.parse(fs.readFileSync(designFile, "utf8"));
  fs.writeFileSync(designFile, JSON.stringify({ ...design, design: { firstAction: "A different design" } }));
  fs.rmSync(path.join(run.draftDir, "discovery-contract.json"));
  const stream = vi.fn(() => { throw new Error("paid_generation_repeated"); });

  await expect(generateMathDiscoveryExperience({
    ...run.input,
    client: { messages: { stream, create: vi.fn(async () => run.approve) } } as never,
  })).rejects.toThrow("provider_stage_request_changed:builder");
  expect(stream).not.toHaveBeenCalled();
}, 90000);
