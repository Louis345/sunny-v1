import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.hoisted(() =>
  vi.fn(async () => ({
    content: [{ type: "text", text: "A tiny generated story." }],
  }))
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreate },
  })),
}));

vi.mock("../utils/learningProfileIO", () => ({
  readLearningProfile: vi.fn(),
  writeLearningProfile: vi.fn(),
}));

vi.mock("../engine/generatedExperienceArtifact", () => ({
  generateExperienceArtifactFromChart: vi.fn(),
  generateExperienceHtmlWithSonnet: vi.fn(),
}));

import { setupRoutes } from "./routes";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import {
  generateExperienceArtifactFromChart,
  generateExperienceHtmlWithSonnet,
} from "../engine/generatedExperienceArtifact";

const mockedReadLearningProfile = vi.mocked(readLearningProfile);
const mockedWriteLearningProfile = vi.mocked(writeLearningProfile);
const mockedGenerateExperienceArtifactFromChart = vi.mocked(generateExperienceArtifactFromChart);

function baseProfile(node: Record<string, unknown>) {
  return {
    childId: "reina",
    bondPatterns: {
      topics: [],
      bondStyle: "unknown",
      averageBondTurns: 0,
      lastBondQuality: "moderate",
      topicFrequency: {},
    },
    algorithmParams: {
      sm2: {
        defaultEasinessFactor: 2.5,
        minEasinessFactor: 1.3,
        intervalModifier: 1,
        maxNewWordsPerSession: 5,
        maxReviewWordsPerSession: 12,
      },
      difficulty: {
        targetAccuracy: 0.7,
        easyThreshold: 0.85,
        hardThreshold: 0.5,
        breakThreshold: 0.4,
        windowSize: 8,
      },
    },
    moodAdjustment: false,
    pendingHomework: {
      homeworkId: "hw-spelling-test",
      weekOf: "2026-05-05",
      title: "Spelling Test",
      wordList: ["shiny"],
      nodes: [node],
    },
  } as never;
}

describe("POST /api/homework/regenerate", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    process.chdir(originalCwd);
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function useTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-regenerate-route-"));
    roots.push(root);
    process.chdir(root);
    return root;
  }

  async function postJson(route: string, body: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  it("routes Quest regeneration through the validated generated-experience artifact path", async () => {
    useTempRoot();
    mockedReadLearningProfile.mockReturnValue(baseProfile({
      id: "n-quest",
      type: "quest",
      words: ["shiny"],
    }));
    mockedGenerateExperienceArtifactFromChart.mockResolvedValue({
      ok: true,
      childId: "reina",
      homeworkId: "hw-spelling-test",
      briefId: "brief-quest-transfer",
      stage: "quest",
      filename: "quest-brief-quest-transfer.html",
      filePath: "/tmp/quest-brief-quest-transfer.html",
      contentId: "content-quest",
      validationReport: {
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-05T12:00:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: true,
          screenshotPaths: ["/tmp/quest.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 1,
          completed: true,
          completionPayloads: [{ completed: true }],
          usedValidationHook: true,
        },
      },
    } as never);

    const out = await postJson("/api/homework/regenerate", {
      childId: "reina",
      date: "2026-05-05",
      nodeId: "n-quest",
      briefId: "brief-quest-transfer",
      feedback: "Make it a wrestling strategy quest.",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      newFile: "quest-brief-quest-transfer.html",
      contentId: "content-quest",
      validationReport: {
        passed: true,
        runtimeValidation: { engine: "playwright", passed: true },
      },
    });
    expect(mockedGenerateExperienceArtifactFromChart).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      kind: "quest",
      briefId: "brief-quest-transfer",
      parentFeedback: "Make it a wrestling strategy quest.",
      generateHtml: generateExperienceHtmlWithSonnet,
    }));
  });

  it("routes Boss regeneration through the validated generated-experience artifact path", async () => {
    useTempRoot();
    mockedReadLearningProfile.mockReturnValue(baseProfile({
      id: "n-boss",
      type: "boss",
      words: ["shiny"],
    }));
    mockedGenerateExperienceArtifactFromChart.mockResolvedValue({
      ok: true,
      childId: "reina",
      homeworkId: "hw-spelling-test",
      briefId: "boss",
      stage: "boss",
      filename: "boss-final-check.html",
      filePath: "/tmp/boss-final-check.html",
      contentId: "content-boss",
      validationReport: {
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-05T12:00:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: true,
          screenshotPaths: ["/tmp/boss.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 1,
          completed: true,
          completionPayloads: [{ completed: true }],
          usedValidationHook: true,
        },
      },
    } as never);

    const out = await postJson("/api/homework/regenerate", {
      childId: "reina",
      date: "2026-05-05",
      nodeId: "n-boss",
      feedback: "Make it feel like a final arena.",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, newFile: "boss-final-check.html" });
    const call = mockedGenerateExperienceArtifactFromChart.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({
      childId: "reina",
      kind: "boss",
      parentFeedback: "Make it feel like a final arena.",
      generateHtml: generateExperienceHtmlWithSonnet,
    });
    expect(call).not.toHaveProperty("briefId");
  });

  it("blocks Quest regeneration when Playwright runtime validation fails", async () => {
    useTempRoot();
    mockedReadLearningProfile.mockReturnValue(baseProfile({
      id: "n-quest",
      type: "quest",
      words: ["shiny"],
    }));
    mockedGenerateExperienceArtifactFromChart.mockResolvedValue({
      ok: false,
      childId: "reina",
      homeworkId: "hw-spelling-test",
      briefId: "brief-quest-transfer",
      stage: "quest",
      reason: "generated_game_validation_failed",
      validationReport: {
        passed: false,
        score: 40,
        failures: ["Runtime validation did not observe node_complete/game_complete."],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-05T12:00:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: false,
          screenshotPaths: ["/tmp/quest.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 0,
          completed: false,
          completionPayloads: [],
          usedValidationHook: true,
        },
      },
    } as never);

    const out = await postJson("/api/homework/regenerate", {
      childId: "reina",
      date: "2026-05-05",
      nodeId: "n-quest",
      briefId: "brief-quest-transfer",
    });

    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({
      ok: false,
      error: "generated_game_validation_failed",
    });
    expect(mockedWriteLearningProfile).not.toHaveBeenCalled();
  });

  it("keeps karaoke regeneration on the existing story path", async () => {
    const root = useTempRoot();
    mockedReadLearningProfile.mockReturnValue(baseProfile({
      id: "n-karaoke",
      type: "karaoke",
      words: ["shiny"],
    }));

    const out = await postJson("/api/homework/regenerate", {
      childId: "reina",
      date: "2026-05-05",
      nodeId: "n-karaoke",
      feedback: "Make it gentle.",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, newFile: "karaoke-story.txt" });
    expect(anthropicCreate).toHaveBeenCalled();
    expect(mockedGenerateExperienceArtifactFromChart).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(
      root,
      "src/context/reina/homework/pending/2026-05-05/karaoke-story.txt",
    ))).toBe(true);
  });
});
