import { describe, expect, it } from "vitest";
import {
  FULL_TOUR_CUES,
  createHatchHuntFullTour,
  pauseHatchHuntFullTour,
  resumeHatchHuntFullTour,
  setHatchHuntFullTourSpeed,
} from "../components/HatchHuntFullTour";

describe("Hatch Hunt Storybook full tour", () => {
  it("uses a bounded sequence that ends at Farm arrival without native presentation", () => {
    expect(FULL_TOUR_CUES.length).toBeLessThanOrEqual(16);
    expect(FULL_TOUR_CUES).toEqual([
      "choose_egg",
      "answer_guardian",
      "answer_crack_one",
      "answer_crack_two",
      "answer_crack_three",
      "watch_hatch",
      "watch_escape",
      "answer_because",
      "answer_garden",
      "answer_spark",
      "launch_orb",
      "watch_capture",
      "farm_arrival",
    ]);
    expect(FULL_TOUR_CUES).not.toContain("bring_with_me");
    expect(FULL_TOUR_CUES).not.toContain("native_launch");
  });

  it("can pause, resume, and adjust playback speed without advancing its cue", () => {
    const playing = createHatchHuntFullTour({ speed: 1 });
    const paused = pauseHatchHuntFullTour(playing);
    const faster = setHatchHuntFullTourSpeed(paused, 2);
    const resumed = resumeHatchHuntFullTour(faster);

    expect(paused.status).toBe("paused");
    expect(faster.speed).toBe(2);
    expect(faster.cueIndex).toBe(playing.cueIndex);
    expect(resumed.status).toBe("playing");
    expect(resumed.cueIndex).toBe(playing.cueIndex);
  });
});
