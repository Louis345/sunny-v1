export const FULL_TOUR_CUES = [
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
] as const;

export type HatchHuntFullTourCue = (typeof FULL_TOUR_CUES)[number];
export type HatchHuntFullTourSpeed = 0.5 | 1 | 2;

export interface HatchHuntFullTourState {
  cueIndex: number;
  speed: HatchHuntFullTourSpeed;
  status: "playing" | "paused" | "completed";
}

export function createHatchHuntFullTour({
  speed,
}: {
  speed: HatchHuntFullTourSpeed;
}): HatchHuntFullTourState {
  return { cueIndex: 0, speed, status: "playing" };
}

export function pauseHatchHuntFullTour(
  state: HatchHuntFullTourState,
): HatchHuntFullTourState {
  return state.status === "playing" ? { ...state, status: "paused" } : state;
}

export function resumeHatchHuntFullTour(
  state: HatchHuntFullTourState,
): HatchHuntFullTourState {
  return state.status === "paused" ? { ...state, status: "playing" } : state;
}

export function setHatchHuntFullTourSpeed(
  state: HatchHuntFullTourState,
  speed: HatchHuntFullTourSpeed,
): HatchHuntFullTourState {
  return { ...state, speed };
}

export function advanceHatchHuntFullTour(
  state: HatchHuntFullTourState,
): HatchHuntFullTourState {
  if (state.status !== "playing") return state;
  const nextIndex = state.cueIndex + 1;
  return nextIndex >= FULL_TOUR_CUES.length
    ? { ...state, cueIndex: FULL_TOUR_CUES.length - 1, status: "completed" }
    : { ...state, cueIndex: nextIndex };
}

export function completeHatchHuntFullTour(
  state: HatchHuntFullTourState,
): HatchHuntFullTourState {
  return { ...state, cueIndex: FULL_TOUR_CUES.length - 1, status: "completed" };
}
