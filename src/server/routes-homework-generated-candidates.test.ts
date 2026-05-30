import express from "express";
import fs from "fs";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/questVisualCandidateService", () => ({
  prepareQuestVisualCandidates: vi.fn(),
  selectQuestVisualCandidate: vi.fn(),
  resolveQuestVisualCandidateImagePath: vi.fn(),
}));

import {
  prepareQuestVisualCandidates,
  resolveQuestVisualCandidateImagePath,
  selectQuestVisualCandidate,
} from "../engine/questVisualCandidateService";
import { setupRoutes } from "./routes";

const mockedPrepare = vi.mocked(prepareQuestVisualCandidates);
const mockedSelect = vi.mocked(selectQuestVisualCandidate);
const mockedResolveImage = vi.mocked(resolveQuestVisualCandidateImagePath);

describe("Quest visual generated candidates routes", () => {
  const servers: Array<{ close: () => void }> = [];
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function start() {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    return `http://127.0.0.1:${port}`;
  }

  it("prepares Quest visual candidates as child choice cards", async () => {
    mockedPrepare.mockResolvedValue({
      ok: true,
      choiceSetId: "quest-node-4-visuals",
      cards: [
        {
          optionId: "mystery-vault",
          activityId: "quest-visual-candidate",
          nodeType: "quest",
          label: "Secret Spelling Vault",
          purposeLabel: "MYSTERY VAULT",
          thumbnailUrl: "/api/homework/generated-candidates/reina/quest-node-4-visuals/mystery-vault.png",
          domain: "spelling",
          activityKind: "generated_learning",
          contentId: "quest-visual-candidate-mystery-vault",
        },
      ],
      candidates: [],
      manifestPath: "/tmp/manifest.json",
    });
    const base = await start();

    const res = await fetch(`${base}/api/homework/generated-candidates/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childId: "reina",
        kind: "quest",
        nodeId: "node-4-quest",
        choiceSetId: "quest-node-4-visuals",
      }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      choiceSetId: "quest-node-4-visuals",
      cards: [
        {
          optionId: "mystery-vault",
          nodeType: "quest",
          label: "Secret Spelling Vault",
        },
      ],
    });
    expect(body).not.toHaveProperty("manifestPath");
    expect(body).not.toHaveProperty("candidates");
    expect(mockedPrepare).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      kind: "quest",
      nodeId: "node-4-quest",
      choiceSetId: "quest-node-4-visuals",
    }));
  });

  it("selects one Quest visual candidate and leaves siblings as not_selected", async () => {
    mockedSelect.mockResolvedValue({
      ok: true,
      selectedCandidateId: "mystery-vault",
      notSelectedCandidateIds: ["strategy-machine", "cozy-collection"],
      newFile: "quest-mystery-vault.html",
      gameHtmlPath: "/tmp/quest-mystery-vault.html",
      contentId: "quest-visual-mystery-vault",
      validationReport: { passed: true, score: 100, failures: [], warnings: [], attempts: 1, validatedAt: "2026-05-30T18:00:00.000Z" },
      choiceEvent: {
        type: "quest_visual_candidate_choice",
        selectedOptionId: "mystery-vault",
        skippedOptionIds: ["strategy-machine", "cozy-collection"],
        selectedFamily: "mystery_vault",
        skippedFamilies: ["strategy_machine", "cozy_collection"],
        masteryEvidence: false,
      },
    });
    const base = await start();

    const res = await fetch(`${base}/api/homework/generated-candidates/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childId: "reina",
        kind: "quest",
        nodeId: "node-4-quest",
        choiceSetId: "quest-node-4-visuals",
        selectedCandidateId: "mystery-vault",
      }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      selectedCandidateId: "mystery-vault",
      notSelectedCandidateIds: ["strategy-machine", "cozy-collection"],
      newFile: "quest-mystery-vault.html",
      contentId: "quest-visual-mystery-vault",
      choiceEvent: {
        masteryEvidence: false,
      },
    });
    expect(mockedSelect).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      kind: "quest",
      nodeId: "node-4-quest",
      choiceSetId: "quest-node-4-visuals",
      selectedCandidateId: "mystery-vault",
    }));
  });

  it("serves prepared candidate images through an explicit route", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-candidate-image-"));
    tmpRoots.push(tmpDir);
    const imagePath = path.join(tmpDir, "mystery-vault.svg");
    fs.writeFileSync(imagePath, "<svg xmlns=\"http://www.w3.org/2000/svg\" />", "utf8");
    mockedResolveImage.mockReturnValue(imagePath);
    const base = await start();

    const res = await fetch(`${base}/api/homework/generated-candidates/reina/quest-node-4-visuals/mystery-vault.svg`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<svg");
    expect(mockedResolveImage).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      choiceSetId: "quest-node-4-visuals",
      filename: "mystery-vault.svg",
    }));
  });
});
