import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/generatedExperienceCandidates", () => ({
  prepareGeneratedExperienceCandidates: vi.fn(),
  selectGeneratedExperienceCandidate: vi.fn(),
}));
vi.mock("../engine/generatedExperienceConcepts", () => ({
  prepareGeneratedExperienceConcepts: vi.fn(),
  selectGeneratedExperienceConcept: vi.fn(),
}));

import { setupRoutes } from "./routes";
import {
  prepareGeneratedExperienceCandidates,
  selectGeneratedExperienceCandidate,
} from "../engine/generatedExperienceCandidates";
import {
  prepareGeneratedExperienceConcepts,
  selectGeneratedExperienceConcept,
} from "../engine/generatedExperienceConcepts";

const mockedPrepare = vi.mocked(prepareGeneratedExperienceCandidates);
const mockedSelect = vi.mocked(selectGeneratedExperienceCandidate);
const mockedPrepareConcepts = vi.mocked(prepareGeneratedExperienceConcepts);
const mockedSelectConcept = vi.mocked(selectGeneratedExperienceConcept);

describe("generated Quest/Boss candidate routes", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

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

  it("prepares validated Quest candidates before showing child choice cards", async () => {
    mockedPrepare.mockResolvedValue({
      ok: true,
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      candidates: [{
        candidateId: "candidate-story",
        optionId: "story",
        status: "validated_available",
        label: "Story Quest",
        description: "A mystery shell.",
        tags: ["story"],
        contentId: "content-story",
        newFile: "candidate-story.html",
        validationReport: { passed: true, score: 100, failures: [], warnings: [], attempts: 1, validatedAt: "now" },
      }],
      rejectedCandidates: [],
    } as never);

    const out = await postJson("/api/homework/generated-candidates/prepare", {
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["story", "puzzle"],
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      candidates: [{ candidateId: "candidate-story", status: "validated_available" }],
    });
    expect(mockedPrepare).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["story", "puzzle"],
    }));
  });

  it("selects one candidate and returns not-selected sibling ids", async () => {
    mockedSelect.mockReturnValue({
      ok: true,
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedCandidateId: "candidate-story",
      notSelectedCandidateIds: ["candidate-puzzle"],
      newFile: "candidate-story.html",
      contentId: "content-story",
      validationReport: { passed: true, score: 100, failures: [], warnings: [], attempts: 1, validatedAt: "now" },
    } as never);

    const out = await postJson("/api/homework/generated-candidates/select", {
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedCandidateId: "candidate-story",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      newFile: "candidate-story.html",
      notSelectedCandidateIds: ["candidate-puzzle"],
    });
    expect(mockedSelect).toHaveBeenCalledWith(expect.objectContaining({
      selectedCandidateId: "candidate-story",
    }));
  });

  it("does not attach validation-failed candidates", async () => {
    mockedPrepare.mockResolvedValue({
      ok: true,
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      candidates: [],
      rejectedCandidates: [{
        candidateId: "candidate-bad",
        optionId: "bad",
        status: "validation_failed",
        reason: "visible target",
      }],
    } as never);

    const out = await postJson("/api/homework/generated-candidates/prepare", {
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["bad"],
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      candidates: [],
      rejectedCandidates: [{ status: "validation_failed" }],
    });
  });

  it("prepares concept cards before generating a Quest/Boss game", async () => {
    mockedPrepareConcepts.mockResolvedValue({
      ok: true,
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      concepts: [{
        conceptId: "concept-launch",
        optionId: "launch",
        status: "concept_candidate",
        label: "Orb Launch Lab",
        description: "Charge an orb by proving the assignment.",
        tags: ["charge-meter"],
        artDirection: "Bright field and one launch object.",
        companionMicroQuestion: {
          prompt: "What caught your eye?",
          answerType: "free_text",
        },
      }],
      rejectedConcepts: [],
      brief: {
        briefId: "brief-1",
        domainTemplate: { domain: "spelling" },
      },
    } as never);

    const out = await postJson("/api/homework/generated-candidates/concepts/prepare", {
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["launch", "vault"],
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      concepts: [{ conceptId: "concept-launch", status: "concept_candidate" }],
    });
    expect(mockedPrepareConcepts).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["launch", "vault"],
    }));
    expect(mockedPrepare).not.toHaveBeenCalled();
  });

  it("selects a concept, records weak companion answer, and returns the generated selected game", async () => {
    mockedSelectConcept.mockResolvedValue({
      ok: true,
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedConceptId: "concept-launch",
      selectedCandidateId: "candidate-quest-choice-launch",
      notSelectedConceptIds: ["concept-vault"],
      notSelectedCandidateIds: [],
      newFile: "quest-quest-choice-launch.html",
      date: "2026-05-29",
      contentId: "content-candidate-quest-choice-launch",
      validationReport: { passed: true, score: 100, failures: [], warnings: [], attempts: 1, validatedAt: "now" },
    } as never);

    const out = await postJson("/api/homework/generated-candidates/concepts/select", {
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedConceptId: "concept-launch",
      microQuestionAnswer: "the launch looked fun",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      selectedConceptId: "concept-launch",
      newFile: "quest-quest-choice-launch.html",
      notSelectedConceptIds: ["concept-vault"],
    });
    expect(mockedSelectConcept).toHaveBeenCalledWith(expect.objectContaining({
      selectedConceptId: "concept-launch",
      microQuestionAnswer: "the launch looked fun",
    }));
  });
});
