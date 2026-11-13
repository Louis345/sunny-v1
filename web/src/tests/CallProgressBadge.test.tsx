import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CallProgressBadge } from "../components/CallProgressBadge";

// Owner, 2026-11-07, after Ila's session: she never knew how close the FaceTime call was. The map says it.
it("says how many stops are left until the call, and hides when there is nothing to count", () => {
  const { rerender, container } = render(<CallProgressBadge stopsLeft={3} companionName="Elli" />);
  expect(screen.getByText("3 stops to your call with Elli")).toBeTruthy();
  rerender(<CallProgressBadge stopsLeft={1} companionName="Elli" />);
  expect(screen.getByText("1 more stop to your call with Elli!")).toBeTruthy();
  rerender(<CallProgressBadge stopsLeft={0} companionName="Elli" />);
  expect(container.textContent).toBe("");
  rerender(<CallProgressBadge stopsLeft={undefined} companionName="Elli" />);
  expect(container.textContent).toBe("");
});
