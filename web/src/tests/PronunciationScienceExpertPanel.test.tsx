import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PronunciationScienceExpertPanel,
  type ExpertPronunciationResult,
} from "../storybook/PronunciationScienceExpertPanel";

const flowState: ExpertPronunciationResult["flowState"] = {
  timeOnTask_ms: 42_000,
  bestStreak: 6,
  heatReached: true,
  comboReached: false,
  retries: 3,
  missToHitRecoveries: 2,
  idleEvents: 0,
  pauseRequests: 1,
  replayRequests: 1,
  powerBarSurvival_ms: 42_000,
  abandoned: false,
};

describe("PronunciationScienceExpertPanel", () => {
  it("renders provider comparison, Wilson signals, flow state, care plan, and parent preview", () => {
    render(
      <PronunciationScienceExpertPanel
        results={[
          {
            targetWord: "ahead",
            spokenTranscript: "ahead",
            provider: "speechace",
            wordScore: 58,
            phonemeScores: [
              { phoneme: "ah", score: 90, position: "initial" },
              { phoneme: "h", score: 20, position: "medial", soundMostLike: "d" },
              { phoneme: "d", score: 88, position: "final" },
            ],
            omissions: ["h"],
            insertions: [],
            substitutions: [{ expected: "h", actual: "d", position: "medial" }],
            wilsonSignals: ["medial_sound_confusion", "segmentation", "recovery_after_model"],
            confidence: 0.58,
            flowState,
          },
        ]}
        comparisons={[
          {
            targetWord: "ahead",
            agreement: "agree",
            clearestProvider: "speechace",
            reason: "Both providers flagged medial-sound risk.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Pronunciation Science Expert")).toBeTruthy();
    expect(screen.getByLabelText("Provider comparison expert")).toBeTruthy();
    expect(screen.getByLabelText("Flow-state evidence")).toBeTruthy();
    expect(screen.getByLabelText("Care plan expert interpretation")).toBeTruthy();
    expect(screen.getByLabelText("Parent preview")).toBeTruthy();
    expect(screen.getByText("medial sound confusion")).toBeTruthy();
    expect(screen.getByText("Miss to hit recoveries")).toBeTruthy();
    expect(screen.getByText(/The likely issue is the medial sound/)).toBeTruthy();
  });

  it("renders live comparison controls and provider statuses", () => {
    render(
      <PronunciationScienceExpertPanel
        results={[]}
        comparisons={[]}
        providerStatuses={[
          { provider: "azure", ok: false, status: "missing_key", message: "missing" },
          { provider: "speechace", ok: true, status: "scored" },
        ]}
        onLiveCompare={() => {}}
        liveCompareStatus="Ready"
      />,
    );

    expect(screen.getByRole("button", { name: "Record and compare APIs" })).toBeTruthy();
    expect(screen.getByText("azure: missing_key")).toBeTruthy();
    expect(screen.getByText("speechace: scored")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
  });
});
