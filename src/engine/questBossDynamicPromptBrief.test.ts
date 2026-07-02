import { describe, expect, it } from "vitest";
import {
  buildQuestBossArtifactPrompt,
  buildQuestBossCreativeDirectorInput,
  parseQuestBossDynamicPromptBrief,
  questBossDynamicPromptBriefSchema,
} from "./questBossDynamicPromptBrief";

describe("Quest/Boss dynamic prompt brief", () => {
  it("requires trigger dopamine, guard pushback, and visible world progression", () => {
    const result = questBossDynamicPromptBriefSchema.safeParse({
      childHook: {
        primaryMotivator: "competition",
        reasonFromChart: "Reina responds to race and challenge framing.",
      },
      learningTarget: {
        domain: "spelling",
        measuredSkill: "hidden spelling recall",
        targetWords: ["faster", "fastest"],
        weakPatterns: ["comparative suffixes"],
      },
      worldBrief: {
        theme: "race tower climb",
        centralObject: "tower gate",
        mechanicMetaphor: "Spelling moves the racers.",
      },
      evidenceContract: {
        attemptEvents: true,
        targetResults: true,
        completionSummary: true,
      },
    });

    expect(result.success).toBe(false);
  });

  it("builds creative-director input from child profile, prior activities, misses, and recoveries", () => {
    const input = buildQuestBossCreativeDirectorInput({
      childId: "reina",
      kind: "quest",
      assignment: {
        domain: "spelling",
        title: "Comparatives",
        targetWords: ["faster", "fastest", "slowest"],
        concepts: ["comparative suffix -er and superlative suffix -est"],
      },
      designerBrief: {
        likelyHooks: ["competition", "control"],
        avoidOrSoften: ["calm"],
        activityAffinity: ["spell-check", "monster-stampede"],
        signalSummary: ["spell-check:help_needed:help", "pronunciation:frustration:calm"],
      },
      baselineEvidence: [
        { nodeId: "node-1", summary: "spell-check:accuracy=0.66:status=falsified:misses=fastest,slowest:recoveries=slowest" },
      ],
    });

    expect(input.priorActivityEvidence.join("\n")).toContain("spell-check:accuracy=0.66");
    expect(input.childSignals).toContain("spell-check:help_needed:help");
    expect(input.activityAffinity).toEqual(["spell-check", "monster-stampede"]);
    expect(input.assignment.targetWords).toEqual(["faster", "fastest", "slowest"]);
  });

  it("turns the Haiku brief into artifact instructions that reject text-only feedback", () => {
    const prompt = buildQuestBossArtifactPrompt({
      brief: {
        childHook: {
          primaryMotivator: "competition",
          avoid: ["calm"],
          reasonFromChart: "Race framing has worked better than quiet practice.",
        },
        learningTarget: {
          domain: "spelling",
          measuredSkill: "hidden spelling recall",
          targetWords: ["faster", "fastest"],
          weakPatterns: ["-er/-est"],
        },
        worldBrief: {
          theme: "race tower climb",
          centralObject: "tower gate",
          mechanicMetaphor: "Each recalled word moves a racer flag up the tower.",
          visualProgression: ["gate locked", "flag advances", "tower trophy lights"],
        },
        triggerDopamine: {
          correct: ["flag jumps upward", "gate glow pulse"],
          wrong: ["guard shield pushback"],
          recovery: ["stronger comeback burst"],
          streak: ["crowd cheer glow"],
          completion: "tower top trophy finale",
        },
        guardPushback: {
          behavior: "gate refuses without revealing the answer",
          tone: "firm-but-playful",
          mustNotRevealAnswer: true,
        },
        evidenceContract: {
          attemptEvents: true,
          targetResults: true,
          completionSummary: true,
        },
      },
    });

    expect(prompt).toContain("Text feedback alone is insufficient");
    expect(prompt).toContain("guard shield pushback");
    expect(prompt).toContain("flag jumps upward");
    expect(prompt).toContain("fireAttemptEvent");
    expect(prompt).toContain("sendNodeComplete");
    expect(prompt.length).toBeLessThan(800);
  });

  it("accepts a schema-valid brief when the model wraps the JSON root", () => {
    const brief = parseQuestBossDynamicPromptBrief({
      creativeDirectorOutput: {
        childHook: {
          primaryMotivator: "competition",
          avoid: ["calm"],
          reasonFromChart: "Race framing has worked better than quiet practice.",
        },
        learningTarget: {
          domain: "spelling",
          measuredSkill: "hidden spelling recall",
          targetWords: ["faster", "fastest"],
          weakPatterns: ["-er/-est"],
        },
        worldBrief: {
          theme: "race tower climb",
          centralObject: "tower gate",
          mechanicMetaphor: "Each recalled word moves a racer flag up the tower.",
          visualProgression: ["gate locked", "flag advances", "tower trophy lights"],
        },
        triggerDopamine: {
          correct: ["flag jumps upward"],
          wrong: ["guard shield pushback"],
          recovery: ["stronger comeback burst"],
          streak: ["crowd cheer glow"],
          completion: "tower top trophy finale",
        },
        guardPushback: {
          behavior: "gate refuses without revealing the answer",
          tone: "firm-but-playful",
          mustNotRevealAnswer: true,
        },
        evidenceContract: {
          attemptEvents: true,
          targetResults: true,
          completionSummary: true,
        },
      },
    });

    expect(brief.childHook.primaryMotivator).toBe("competition");
    expect(brief.learningTarget.targetWords).toEqual(["faster", "fastest"]);
  });

  it("normalizes multiple completion dopamine reactions from tool input", () => {
    const brief = parseQuestBossDynamicPromptBrief({
      childHook: {
        primaryMotivator: "competition",
        avoid: ["calm"],
        reasonFromChart: "Race framing has worked better than quiet practice.",
      },
      learningTarget: {
        domain: "spelling",
        measuredSkill: "hidden spelling recall",
        targetWords: ["faster", "fastest"],
        weakPatterns: ["-er/-est"],
      },
      worldBrief: {
        theme: "race tower climb",
        centralObject: "tower gate",
        mechanicMetaphor: "Each recalled word moves a racer flag up the tower.",
        visualProgression: ["gate locked", "flag advances", "tower trophy lights"],
      },
      triggerDopamine: {
        correct: ["flag jumps upward"],
        wrong: ["guard shield pushback"],
        recovery: ["stronger comeback burst"],
        streak: ["crowd cheer glow"],
        completion: ["tower top trophy finale", "arena lights activate"],
      },
      guardPushback: {
        behavior: "gate refuses without revealing the answer",
        tone: "firm-but-playful",
        mustNotRevealAnswer: true,
      },
      evidenceContract: {
        attemptEvents: true,
        targetResults: true,
        completionSummary: true,
      },
    });

    expect(brief.triggerDopamine.completion).toBe("tower top trophy finale; arena lights activate");
  });
});
