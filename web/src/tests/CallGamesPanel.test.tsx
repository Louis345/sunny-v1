import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CallGamesPanel } from "../components/CallGamesPanel";

// Owner 2026-11-09: in FaceTime she taps Games and sees every 8-bit game: the ones she won lit, the rest dark until
// she wins them. A lit game plays in the call; a dark one only shows how to win it.
it("shows every game, lit when she owns it and dark until then, and plays only an owned game", () => {
  const onPlay = vi.fn();
  render(<CallGamesPanel ownedRewardIds={["game:asteroid"]} onPlay={onPlay} onClose={() => {}} />);
  expect(screen.getByTestId("reward-tile-game:asteroid").getAttribute("data-locked")).toBe("false");
  expect(screen.getByTestId("reward-tile-game:space-invaders").getAttribute("data-locked")).toBe("true");
  fireEvent.click(screen.getByText("Play"));
  expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ gameId: "asteroid", file: "asteroid.html" }));
  expect(screen.queryAllByText("Play")).toHaveLength(1);
});

it("adds a Games button to the call when the call offers games", async () => {
  const fs = await import("node:fs");
  const overlay = fs.readFileSync("src/components/CompanionVideoCallOverlay.tsx", "utf8");
  expect(overlay).toContain('aria-label="Games"');
  const showroom = fs.readFileSync("src/components/CompanionShowroom.tsx", "utf8");
  expect(showroom).toContain("onOpenGames=");
  expect(showroom).toContain("<CallGamesPanel");
});
