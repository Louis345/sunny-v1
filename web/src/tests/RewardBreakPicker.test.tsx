import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RewardBreakPicker } from "../components/RewardBreakPicker";

// 2026-11-09 (Reina): she owns the Asteroid card; her reward break must offer it, and her tap launches it.
it("offers the games she owns and launches the one she taps", async () => {
  const onPick = vi.fn();
  render(<RewardBreakPicker childId="reina" fetchWallet={async () => ({ ownedRewardIds: ["outfit:cat-ears", "game:asteroid"] })} onPick={onPick} />);
  await waitFor(() => expect(screen.queryByLabelText("Play Space Invaders")).toBeNull());
  fireEvent.click(screen.getByLabelText("Play Asteroid"));
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ gameId: "asteroid", file: "asteroid.html" }));
});

it("never stalls: with no wallet answer every arcade game is offered", async () => {
  render(<RewardBreakPicker childId="ila" fetchWallet={() => Promise.reject(Error("offline"))} onPick={() => {}} />);
  expect(screen.getByLabelText("Play Space Invaders")).toBeTruthy();
  expect(screen.getByLabelText("Play Asteroid")).toBeTruthy();
});
