import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostActivityEngagementOverlay } from "../components/PostActivityEngagementOverlay";

describe("PostActivityEngagementOverlay", () => {
  it("renders completion evidence and emits replay/back actions", () => {
    const onAction = vi.fn();

    render(
      <PostActivityEngagementOverlay
        title="Word Radar"
        outcome={{ completed: true, accuracy: 0.92, activePlayTimeMs: 42_000 }}
        stats={[
          { label: "accuracy", value: "92%" },
          { label: "time", value: "42s" },
        ]}
        canReplay
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId("post-activity-engagement-overlay")).toBeTruthy();
    expect(screen.getByText("Word Radar")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));

    expect(onAction).toHaveBeenNthCalledWith(1, "replay_same");
    expect(onAction).toHaveBeenNthCalledWith(2, "back_to_map");
  });

  it("makes moving on the first, main choice and keeps replay available", () => {
    // Human catch (Nov 1): after most finished games the child tapped "Play
    // again" and left the replay within seconds. Logs held the replay_same ->
    // abandon pairs but nothing read them; the lab only checked that each
    // button emits its action, never which one the screen puts first.
    render(
      <PostActivityEngagementOverlay
        title="Word Radar"
        outcome={{ completed: true, accuracy: 1 }}
        canReplay
        onAction={vi.fn()}
      />,
    );

    const [first, ...rest] = screen.getAllByRole("button");
    expect(first.textContent).toBe("Back to map");
    expect(first.getAttribute("data-primary")).toBe("true");
    const replay = screen.getByRole("button", { name: "Play again" });
    expect(rest).toContain(replay);
    expect(replay.getAttribute("data-primary")).toBeNull();
  });

  it("only shows harder replay when the activity supports it", () => {
    const onAction = vi.fn();

    const { rerender } = render(
      <PostActivityEngagementOverlay
        title="Quest"
        outcome={{ completed: true, accuracy: 1 }}
        canReplay
        canTryHarder={false}
        onAction={onAction}
      />,
    );

    expect(screen.queryByRole("button", { name: "Harder replay" })).toBeNull();

    rerender(
      <PostActivityEngagementOverlay
        title="Pronunciation"
        outcome={{ completed: true, accuracy: 1 }}
        canReplay
        canTryHarder
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Try harder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Harder replay" }));
    expect(onAction).toHaveBeenCalledWith("replay_harder");
  });

});

// Caught by the browser acceptance runs (2026-11-07): with a treasure chest inside, the centred panel grew
// taller than a 1280×720 screen and pushed Back to map out of reach. The panel scrolls instead.
it("keeps its buttons reachable when its content is taller than the screen", () => {
  render(<PostActivityEngagementOverlay title="Done" outcome={{ completed: true }} onAction={() => {}}><div style={{ height: 2000 }} /></PostActivityEngagementOverlay>);
  const overlay = screen.getByTestId("post-activity-engagement-overlay");
  expect(overlay.className).toContain("overflow-y-auto");
  expect(overlay.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
});

// Owner, 2026-11-07, after Ila's session: the treasure is the center of attention. When a stop earns a chest, the
// screen opens on the chest alone; the summary (rating, buttons) comes only after she collects it.
describe("treasure first", () => {
  it("shows only the chest until she collects it, then the summary", () => {
    const onAction = vi.fn();
    render(
      <PostActivityEngagementOverlay
        title="Letter Box Trek"
        outcome={{ completed: true, accuracy: 0.8 }}
        onAction={onAction}
        treasure={(finish) => <button type="button" onClick={finish}>Collect treasure</button>}
      />,
    );
    expect(screen.getByTestId("post-activity-treasure-stage")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to map" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Collect treasure" }));
    expect(screen.queryByTestId("post-activity-treasure-stage")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to map" })).toBeTruthy();
  });

  it("goes straight to the summary when there is no treasure", () => {
    render(<PostActivityEngagementOverlay title="Letter Box Trek" outcome={{ completed: true }} onAction={vi.fn()} />);
    expect(screen.queryByTestId("post-activity-treasure-stage")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to map" })).toBeTruthy();
  });
});

// Bug 2026-11-10 (owner, Ila's session): the stars popup after every game was an annoyance. Her replay / harder /
// back-to-map signal comes from her map choices anyway, so a finished stop returns her straight to the map.
// Why the human caught it: the owner watched her dismiss the same popup after every game.
// Why the logs did not: each popup produced a valid choice event (often a Skip), which looks like healthy data.
// Why the lab missed it: overlay tests asserted the rating works, never whether it should be there at all.
describe("a finished stop goes straight back to the map", () => {
  it("never asks how fun it was and finishes by itself", () => {
    const onFinished = vi.fn();
    render(<PostActivityEngagementOverlay title="Puzzle Vault" outcome={{ completed: true, accuracy: 1 }} onAction={vi.fn()} onFinished={onFinished} />);
    expect(screen.queryByText("How fun was this activity?")).toBeNull();
    expect(screen.queryByTestId("post-activity-engagement-overlay")).toBeNull();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("after she collects the chest she is back on the map, with no summary in between", () => {
    const onFinished = vi.fn();
    render(
      <PostActivityEngagementOverlay title="Letter Box Trek" outcome={{ completed: true }} onAction={vi.fn()} onFinished={onFinished}
        treasure={(finish) => <button type="button" onClick={finish}>Collect treasure</button>} />,
    );
    expect(onFinished).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Collect treasure" }));
    expect(screen.queryByTestId("post-activity-engagement-overlay")).toBeNull();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("a stop that could not be saved still explains itself and offers the map", () => {
    const onFinished = vi.fn();
    render(<PostActivityEngagementOverlay title="Progress could not be saved" outcome={{ completed: false }} onAction={vi.fn()} onFinished={onFinished} />);
    expect(screen.getByRole("button", { name: "Back to map" })).toBeTruthy();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("the App mounts no rating and finishes stops through onFinished", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).not.toContain("onFunRating");
    expect(app).toContain("onFinished={handlePlannerBoardFinished}");
  });
});
