/**
 * BUG 4 — companion-base.md must contain GAME_REVEAL_RULE.
 * Matilda must never state the target word or letters while a game is active.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const companionBase = readFileSync(
  resolve(__dirname, "../../src/souls/companion-base.md"),
  "utf8",
);

describe("companion-base.md rules (BUG 4)", () => {
  it("contains GAME_REVEAL_RULE", () => {
    expect(companionBase).toContain("GAME_REVEAL_RULE");
  });

  it("GAME_REVEAL_RULE forbids narrating target word", () => {
    const ruleIdx = companionBase.indexOf("GAME_REVEAL_RULE");
    const ruleSection = companionBase.slice(ruleIdx, ruleIdx + 400);
    expect(ruleSection.toLowerCase()).toContain("target word");
  });

  it("GAME_REVEAL_RULE applies during active game", () => {
    const ruleIdx = companionBase.indexOf("GAME_REVEAL_RULE");
    const ruleSection = companionBase.slice(ruleIdx, ruleIdx + 400);
    expect(ruleSection.toLowerCase()).toContain("game");
  });
});

it("Elli's identity permits live teaching instead of contradicting its capabilities", () => {
  const identity = readFileSync(resolve(__dirname, "../../src/companions/elli.md"), "utf8");
  expect(identity).not.toContain("Do not repeat the target");
  expect(identity).not.toContain("Never reveal the active answer");
  expect(identity).toContain("pronunciation_model");
  expect(identity).toContain("setSpeechRate");
  expect(companionBase).not.toContain("3-level hint scaffold");
  expect(companionBase).not.toContain("2 sentences maximum");
});


it.each(["Assigned spelling words", ""])("assembles Elli's full normal prompt without reintroducing hard caps (homework=%s)",async homework=>{
 vi.stubEnv("ADVENTURE_MAP","true");
 try{
  const {buildSessionPrompt}=await import("../agents/prompts");
  const prompt=await buildSessionPrompt("synthetic-prompt-probe" as never,resolve(__dirname,"../companions/elli.md"),homework,[],"homework",{carePlan:null});
  expect(prompt).not.toMatch(/Two sentences max|2 sentences maximum|one sentence per turn, two at most/);
  expect(prompt).not.toContain("3-level hint scaffold");
  expect(prompt).not.toMatch(/Respond in one plain sentence|ONE sentence response only|one sentence per turn/i);
  expect(prompt).toContain("setSpeechRate");
 }finally{vi.unstubAllEnvs();}
});
it("the worksheet supplement leaves response length to the shared companion guidance",async()=>{
 const {buildWorksheetToolPrompt}=await import("../agents/prompts/worksheetSessionPrompt");
 const supplement=buildWorksheetToolPrompt({childName:"synthetic-prompt-probe",companionName:"Elli",subjectLabel:"spelling",problemCount:4,rewardThreshold:3,rewardGame:"space-invaders",pendingRewardFromLastSession:null,interactionMode:"answer_entry"});
 expect(supplement).not.toMatch(/Maximum 2 sentences|Do NOT speak more than 2 sentences|react in 1 sentence/);
});
