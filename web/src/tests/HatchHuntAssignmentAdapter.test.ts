import { describe, expect, it } from "vitest";
import type { HatchHuntAssignmentConfig } from "../../../src/shared/hatchHuntAssignment";
import { buildHatchHuntRuntimeQuestions, buildInjectedHatchHuntQuestions } from "../components/HatchHuntAssignmentAdapter";

describe("Hatch Hunt assignment injection", () => {
  it("builds the live hatch and chase question sets entirely from the supplied assignment", () => {
    const config = {
      schemaVersion: 1,
      activityId: "hatch-hunt",
      mode: "baseline_assignment",
      encounterId: "encounter:ila:spelling:1",
      childId: "ila",
      homeworkId: "hw-spelling-week-3",
      domain: "spelling",
      creatureId: "mossback",
      source: {
        fingerprint: "sha256:spelling-week-3",
        documentIds: ["upload:spelling-week-3"],
      },
      baselineItems: [
        {
          id: "baseline:knock",
          targetId: "spelling.word.knock",
          sourceEvidenceIds: ["upload:spelling-week-3:knock"],
          exposure: "unseen",
          prompt: "Type the word knock.",
          response: { mode: "text", acceptedAnswers: ["knock"] },
          timerSeconds: null,
        },
        {
          id: "baseline:sign",
          targetId: "spelling.word.sign",
          sourceEvidenceIds: ["upload:spelling-week-3:sign"],
          exposure: "unseen",
          prompt: "Type the word sign.",
          response: { mode: "text", acceptedAnswers: ["sign"] },
          timerSeconds: null,
        },
      ],
      verificationItems: [
        {
          id: "verify:sign",
          targetId: "spelling.word.sign",
          sourceEvidenceIds: ["upload:spelling-week-3:sign"],
          exposure: "unseen",
          prompt: "Type the word sign.",
          response: { mode: "text", acceptedAnswers: ["sign"] },
          timerSeconds: null,
        },
      ],
      recoveryByTarget: {
        "spelling.word.knock": [{
          id: "recovery:knock-silent-k",
          prompt: "The first letter is silent.",
          workedExplanation: "Knock begins with silent k.",
        }],
        "spelling.word.sign": [{
          id: "recovery:sign-silent-g",
          prompt: "Listen for the silent letter in sign.",
          workedExplanation: "Sign keeps a silent g before n.",
        }],
      },
      evidencePolicy: {
        purpose: "baseline",
        firstAttemptIndependent: true,
        maximumClaim: "practice_only",
        captureIsAcademicEvidence: false,
      },
    } satisfies HatchHuntAssignmentConfig;

    const questions = buildInjectedHatchHuntQuestions(config);

    expect(questions.hatch).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "baseline:knock",
        prompt: "Type the word knock.",
        targetId: "spelling.word.knock",
        response: { mode: "text", acceptedAnswers: ["knock"] },
      }),
    ]));
    expect(questions.chase).toEqual([
      expect.objectContaining({
        id: "verify:sign",
        prompt: "Type the word sign.",
        targetId: "spelling.word.sign",
      }),
    ]);
    expect(JSON.stringify(questions)).not.toContain("because");
    expect(JSON.stringify(questions)).not.toContain("6 × 7");

    const runtime = buildHatchHuntRuntimeQuestions(config);
    expect(runtime.hatch).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "recovery:knock-silent-k",
        difficulty: "recovery",
        targetId: "spelling.word.knock",
        prompt: "The first letter is silent.",
      }),
    ]));
    expect(runtime.chase[0]?.recovery).toMatchObject({
      prompt: "Listen for the silent letter in sign.",
      workedAnswer: "Sign keeps a silent g before n.",
    });
  });
});
