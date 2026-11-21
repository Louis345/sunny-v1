import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CallProgressBadge } from "../components/CallProgressBadge";

// Owner, 2026-11-07, after Ila's session: she never knew how close the FaceTime call was. The map says it.
// BUGS.md S5 (owner, 2026-11-08): "4 stops" did not match the map, which shows more portals (start, choice options,
// finish). The number counts games she still plays on her path, so the badge says games, not stops. Why logs missed
// it: the count was right; only the word was wrong. Why the lab missed it: no test compared the word with the map.
it("says how many games are left until the call, and hides when there is nothing to count", () => {
  const { rerender, container } = render(<CallProgressBadge stopsLeft={3} companionName="Elli" />);
  expect(screen.getByText("3 games to your call with Elli")).toBeTruthy();
  rerender(<CallProgressBadge stopsLeft={1} companionName="Elli" />);
  expect(screen.getByText("1 more game to your call with Elli!")).toBeTruthy();
  rerender(<CallProgressBadge stopsLeft={0} companionName="Elli" />);
  expect(container.textContent).toBe("");
  rerender(<CallProgressBadge stopsLeft={undefined} companionName="Elli" />);
  expect(container.textContent).toBe("");
});
