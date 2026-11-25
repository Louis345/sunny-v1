import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RewardCollection } from "../components/RewardCollection";
import { collectionView } from "../../../src/shared/rewardCatalog";

// Owner, 2026-11-07: she sees everything she could earn; what she has is in colour, the rest is greyed out
// with where to find it, so she knows what she is playing for.
it("shows how much of the collection she has found", () => {
  render(<RewardCollection ownedIds={["game:asteroid", "outfit:cat-ears"]} />);
  expect(screen.getByText(`2 of ${collectionView([]).length} found`)).toBeTruthy();
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

// 2026-11-15 (Ila, Princess's closet): Wear on Cat Ears did nothing (they do not fit Princess yet; the only sign was a
// line of text elsewhere on the page), and every dress showed the same teal emoji. Rule: a button she can see always
// works; a dress shows its real colour.
describe("only buttons that work, and dresses in their real colour", () => {
  it("shows Wear only on what fits this companion; the rest is dimmed with no button", () => {
    render(<RewardCollection ownedIds={["outfit:cat-ears", "outfit:sky-ribbon-dress"]} onUse={() => {}} canUse={(item) => item.id !== "outfit:cat-ears"} />);
    const ears = screen.getByTestId("reward-tile-outfit:cat-ears");
    expect(ears.querySelector("button")).toBeNull();
    expect(ears.getAttribute("data-fits")).toBe("false");
    expect(screen.getByTestId("reward-tile-outfit:sky-ribbon-dress").querySelector("button")?.textContent).toBe("Wear");
  });

  it("paints each outfit's icon in its real colour", () => {
    render(<RewardCollection ownedIds={[]} tintOf={(item) => (item.id === "outfit:sky-ribbon-dress" ? "#7cc8ff" : undefined)} />);
    const icon = screen.getByTestId("reward-tile-outfit:sky-ribbon-dress").querySelector(".reward-tile__icon") as HTMLElement;
    expect(icon.style.backgroundColor).toBe("rgb(124, 200, 255)");
  });
});
