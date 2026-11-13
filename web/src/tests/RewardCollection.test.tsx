import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RewardCollection } from "../components/RewardCollection";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

// Owner, 2026-11-07: she sees everything she could earn; what she has is in colour, the rest is greyed out
// with where to find it, so she knows what she is playing for.
it("shows how much of the collection she has found", () => {
  render(<RewardCollection ownedIds={["game:asteroid", "outfit:cat-ears"]} />);
  expect(screen.getByText(`2 of ${REWARD_CATALOG.length} found`)).toBeTruthy();
});

it("greys out what she has not found yet and says which chest drops it and how likely", () => {
  render(<RewardCollection ownedIds={[]} />);
  const invaders = screen.getByTestId("reward-tile-game:space-invaders");
  expect(invaders.getAttribute("data-locked")).toBe("true");
  expect(within(invaders).getByText(/Legendary chest · \d+(\.\d)?%/)).toBeTruthy();
  expect(within(invaders).queryByRole("button")).toBeNull();
});

it("lets her play a game or wear an outfit she owns", () => {
  const onUse = vi.fn();
  render(<RewardCollection ownedIds={["game:asteroid", "outfit:royal-crown"]} onUse={onUse} />);
  fireEvent.click(within(screen.getByTestId("reward-tile-game:asteroid")).getByRole("button", { name: "Play" }));
  fireEvent.click(within(screen.getByTestId("reward-tile-outfit:royal-crown")).getByRole("button", { name: "Wear" }));
  expect(onUse.mock.calls.map(call => call[0].id)).toEqual(["game:asteroid", "outfit:royal-crown"]);
});
