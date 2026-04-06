import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mathProblem } from "../agents/elli/tools/mathProblem";
import { readWordBank } from "../utils/wordBankIO";

const childId = "ila";
const mathLog = path.resolve(process.cwd(), "src", "logs", "ila_math.json");
const wordBankPath = path.resolve(
  process.cwd(),
  "src",
  "context",
  childId,
  "word_bank.json",
);

async function runMath(args: {
  childName: "Ila" | "Reina" | "creator";
  operation: "addition" | "subtraction";
  operandA: number;
  operandB: number;
  childAnswer: number | null;
}): Promise<Record<string, unknown>> {
  const exec = (mathProblem as { execute?: (a: unknown) => Promise<string> })
    .execute;
  if (!exec) throw new Error("mathProblem.execute missing");
  const raw = await exec(args);
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("math interleaving integration", () => {
  let savedLog: string | null = null;
  let savedBank: string | null = null;

  beforeEach(() => {
    savedLog = fs.existsSync(mathLog)
      ? fs.readFileSync(mathLog, "utf-8")
      : null;
    savedBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
    if (fs.existsSync(mathLog)) fs.unlinkSync(mathLog);
  });

  afterEach(() => {
    if (savedLog !== null) fs.writeFileSync(mathLog, savedLog, "utf-8");
    else if (fs.existsSync(mathLog)) fs.unlinkSync(mathLog);
    if (savedBank !== null) fs.writeFileSync(wordBankPath, savedBank, "utf-8");
  });

  it("returns nextRecommendation from interleaving algorithm", async () => {
    await runMath({
      childName: "Ila",
      operation: "addition",
      operandA: 2,
      operandB: 3,
      childAnswer: null,
    });
    const out = await runMath({
      childName: "Ila",
      operation: "addition",
      operandA: 4,
      operandB: 1,
      childAnswer: 5,
    });
    expect(typeof out.nextRecommendation).toBe("string");
    expect(["addition", "subtraction"]).toContain(out.nextRecommendation);
  });

  it("records math attempts to word bank", async () => {
    await runMath({
      childName: "Ila",
      operation: "addition",
      operandA: 2,
      operandB: 3,
      childAnswer: null,
    });
    await runMath({
      childName: "Ila",
      operation: "addition",
      operandA: 7,
      operandB: 2,
      childAnswer: 9,
    });
    const bank = readWordBank(childId);
    const hit = bank.words.find((w) => w.word === "7+2");
    expect(hit?.tracks.math).toBeDefined();
  });
});
