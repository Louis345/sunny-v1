import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { generateBoardNodeImages } from "./boardNodeImageGenerator";
import { generateStoryImage } from "../utils/generateStoryImage";
import { writeActiveSessionPlan } from "./sessionPlanFromChart";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
vi.mock("../utils/generateStoryImage", () => ({ generateStoryImage: vi.fn() }));
vi.mock("./sessionPlanFromChart", () => ({ writeActiveSessionPlan: vi.fn() }));
vi.mock("../profiles/childChart", () => ({ getChildChart: () => { throw new Error("explicit_assignment_must_not_read_selected_plan"); } }));
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-board-art-")); roots.push(rootDir);
  const plan = { childId: "lab-child", activeHomeworkId: "school-words", domain: "spelling", nodePlan: [], adventureBoard: { title: "School words", nodes: ["practice", "check"].map(id => ({ id, kind: "activity", label: id, thumbnailPrompt: `Existing illustration brief for ${id}` })) } } as unknown as ActiveSessionPlan;
  return { rootDir, childId: "lab-child", homeworkId: "school-words", plan };
}
it("reuses saved artwork with no key, without modifying the frozen plan or selected assignment", async () => {
  vi.stubEnv("GROK_API_KEY", "");
  const input = fixture(), original = JSON.stringify(input.plan);
  const file = path.join(input.rootDir, "web/public/generated/adventure-board/lab-child/school-words-practice.jpeg");
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "recorded-image");
  const result = await generateBoardNodeImages({ ...input, generateMissing: false });
  expect(result.plan?.adventureBoard?.nodes[0].thumbnailUrl).toBe("/generated/adventure-board/lab-child/school-words-practice.jpeg");
  expect(result.reused).toBe(1);
  expect(generateStoryImage).not.toHaveBeenCalled();
  expect(writeActiveSessionPlan).not.toHaveBeenCalled();
  expect(JSON.stringify(input.plan)).toBe(original);
});
it("publishes partial artwork, logs failed siblings and reuses completed images on restart", async () => {
  vi.stubEnv("GROK_API_KEY", "recorded-not-a-key");
  const input = fixture(), changed = vi.fn(), log = vi.spyOn(console, "warn");
  vi.mocked(generateStoryImage).mockResolvedValueOnce("https://recorded.invalid/image").mockRejectedValueOnce(new Error("recorded_failure"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
  const result = await generateBoardNodeImages({ ...input, onPlanUpdated: changed });
  expect(result.generated).toBe(1);
  expect(changed).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith(expect.stringContaining("recorded_failure"));
  expect(result.plan?.adventureBoard?.nodes[0].thumbnailUrl).toContain("school-words-practice.jpeg");
  expect(result.plan?.adventureBoard?.nodes[1].thumbnailUrl).toBeUndefined();
  vi.mocked(generateStoryImage).mockClear();
  const resumed = await generateBoardNodeImages({ ...input, generateMissing: false });
  expect(resumed.reused).toBe(1);
  expect(generateStoryImage).not.toHaveBeenCalled();
  expect(writeActiveSessionPlan).not.toHaveBeenCalled();
  log.mockRestore();
});
it("rejects an explicit plan belonging to another child or assignment before any provider or write", async () => {
  const input = fixture();
  await expect(generateBoardNodeImages({ ...input, homeworkId: "other" })).rejects.toThrow("board_artwork_assignment_mismatch");
  await expect(generateBoardNodeImages({ ...input, childId: "other" })).rejects.toThrow("board_artwork_assignment_mismatch");
  expect(generateStoryImage).not.toHaveBeenCalled();
  expect(writeActiveSessionPlan).not.toHaveBeenCalled();
});

it("keeps verified native activity identity art instead of spending on replacement thumbnails", async () => {
  vi.stubEnv("GROK_API_KEY", "recorded-not-a-key");
  const input = fixture();
  input.plan.adventureBoard!.nodes = input.plan.adventureBoard!.nodes.map((node, index) => ({
    ...node,
    activityId: index === 0 ? "word-radar" : "spell-check",
    thumbnailUrl: index === 0
      ? "/thumbnails/activities/word-radar.svg"
      : "/thumbnails/activities/spell-check.svg",
  }));

  const result = await generateBoardNodeImages(input);

  expect(result.reused).toBe(2);
  expect(result.generated).toBe(0);
  expect(generateStoryImage).not.toHaveBeenCalled();
  expect(result.plan?.adventureBoard?.nodes.map((node) => node.thumbnailUrl)).toEqual([
    "/thumbnails/activities/word-radar.svg",
    "/thumbnails/activities/spell-check.svg",
  ]);
});
