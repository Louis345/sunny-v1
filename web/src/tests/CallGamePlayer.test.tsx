import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CallGamePlayer } from "../components/CallGamePlayer";

// Owner 2026-11-12: "FaceTime is still extremely buggy." In a call, Space Invaders sat on "Waiting for Sunny to start
// your reward" forever: it starts only on a {type:"start"} message, and the call's game frame never sent one (the
// board's Canvas does). Asteroid and Space Frogger listen for the same message. Why the human caught it: the game
// never moved. Why logs missed it: nothing logged the frame load. Why the lab missed it: no test opened a call game.
const GAME = { gameId: "space-invaders", name: "Space Invaders", icon: "👾", file: "space-invaders.html" };

it("starts the game it opens, with her name and her companion's", () => {
  render(<CallGamePlayer game={GAME} childId="ila" childName="Ila" companionName="Elli" onBack={vi.fn()} />);
  const frame = screen.getByTitle("Space Invaders") as HTMLIFrameElement;
  expect(frame.getAttribute("src")).toBe("/games/space-invaders.html?child=ila");
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent.load(frame);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith({ type: "start", childName: "Ila", companionName: "Elli", config: {} }, "*");
});

it("goes back to the game list", () => {
  const onBack = vi.fn();
  render(<CallGamePlayer game={GAME} childId="ila" childName="Ila" companionName="Elli" onBack={onBack} />);
  fireEvent.click(screen.getByRole("button", { name: "Back to games" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
