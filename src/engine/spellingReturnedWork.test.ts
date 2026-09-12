import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle } from "./learningCycleIngest";
import { createReturnedWorkDraft, confirmReturnedWorkDraft } from "./returnedWorkPipeline";
import { getLearningCycle } from "./learningCycleRepository";
import { buildLongitudinalLearningHistory } from "./longitudinalLearning";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
it.each(["correct", "swapped", "invented"])("validates %s returned spelling links against frozen words", async variant => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-return-")); roots.push(rootDir);
  const childId = "lab", homeworkId = "words";
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["source"], measurementRole: "fresh_checkpoint" });
  createSpellingDiscoveryCycle({ childId, homeworkId, title: "Words", contentFingerprint: "f", items }, { rootDir });
  const extract = vi.fn(async (input: { spellingItems?: unknown[] }) => {
    expect(input.spellingItems).toEqual(items.map(item => ({ itemId: item.id, word: item.word, wordId: item.wordId, constructId: item.constructId })));
    return { items: items.map((item, i) => ({ itemId: `returned-${i}`, prompt: item.word, correct: true, childResponse: item.word, extractionConfidence: 1, constructLinks: [{ role: "primary" as const, confidence: 1, constructId: variant === "correct" ? item.constructId : variant === "swapped" ? items[1 - i].constructId : "spelling.invented" }] })) };
  });
  const draft = await createReturnedWorkDraft({ childId, homeworkId, filename: "returned.pdf", mimeType: "application/pdf", dataBase64: Buffer.from("recorded returned assignment").toString("base64") }, { rootDir, extract });
  const interpret = vi.fn(async cycle => ({ status: "inconclusive" as const, reason: "No preregistered delayed prediction", nextAction: "Use the new word evidence in later planning", evidenceIds: cycle.observations.map((row: {observationId:string}) => row.observationId), predictionEvaluationIds: [], preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Fresh delayed evidence"] }));
  const confirm = () => confirmReturnedWorkDraft({ childId, homeworkId, sourceId: draft.source.sourceId }, { rootDir, interpret });
  if (variant !== "correct") {
    await expect(confirm()).rejects.toThrow("returned_spelling_mapping_invalid");
    expect(getLearningCycle(childId, homeworkId, { rootDir })!.observations).toHaveLength(0);
    expect(interpret).not.toHaveBeenCalled();
  } else {
    await confirm(); await confirm();
    expect(interpret).toHaveBeenCalledOnce();
    const history = buildLongitudinalLearningHistory(childId, { rootDir });
    expect(history.constructs[items[0].constructId].observations).toHaveLength(1);
    expect(history.constructs[items[0].constructId].observations[0].result.correct).toBe(true);
  }
});
