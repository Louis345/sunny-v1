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

// 11/23 (owner: "it's just persona driven. No rules."): the base is persona + where you are + how Sunny works.
describe("companion-base.md is situation and facts, not rules", () => {
  it("names the persona, the two modes and the record facts", () => {
    expect(companionBase).toContain("Your persona says who you are");
    expect(companionBase).toContain("**Tutoring.**");
    expect(companionBase).toContain("**On a call.**");
    expect(companionBase).toContain("recorded as help");
  });

  it("carries no rule words", () => {
    expect(companionBase).not.toMatch(/\b(never|always|must|do not|don't|at most|only when)\b/i);
    expect(companionBase).not.toContain("GAME_REVEAL_RULE");
  });
});

it("Elli's identity permits live teaching instead of contradicting its capabilities", () => {
  const identity = readFileSync(resolve(__dirname, "../../src/companions/elli.md"), "utf8");
  expect(identity).not.toContain("Do not repeat the target");
  expect(identity).not.toContain("Never reveal the active answer");
  // Teaching capabilities belong to the shared mission every companion inherits.
  expect(companionBase).toContain("pronunciation_model");
  expect(companionBase).toContain("setSpeechRate");
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

it("assembles teaching freedom without canned praise or practice letter bans",async()=>{
 const {buildSessionPrompt}=await import('../agents/prompts');
 const prompt=await buildSessionPrompt('synthetic-prompt-probe' as never,resolve(__dirname,'../companions/elli.md'),'Assigned spelling words',[],'homework',{carePlan:null});
 expect(prompt).not.toContain('Say "Amazing!"');
 expect(prompt).not.toContain('Never suggest which letter to pick');
 expect(prompt).not.toContain('one response only');
 expect(prompt).not.toContain('Never replace speech with only an emote');
 expect(prompt).toContain('pronunciation_model');
 expect(prompt).toContain('recorded as help');
});

it("gives Elli a teaching purpose without a personality instruction to withdraw from frustration", async () => {
 const {buildSessionPrompt}=await import('../agents/prompts');
 const prompt=await buildSessionPrompt('synthetic-prompt-probe' as never,resolve(__dirname,'../companions/elli.md'),'Assigned spelling words',[],'homework',{carePlan:null});
 expect(prompt).not.toContain('She never sounds like a teacher');
 expect(prompt).not.toContain('Elli backs off and just');
 expect(prompt).toContain('On practice, help is the point');
});
