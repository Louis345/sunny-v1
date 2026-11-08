import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";
import { CreatureDenOverlay, DenButton } from "../components/CreatureDenOverlay";
import { LiveCreatureEncounter } from "../components/LiveCreatureEncounter";

vi.mock("../utils/sparkOrbSfx", () => ({ playSparkOrbSfx: vi.fn(), startSparkOrbPullTone: () => null }));
vi.mock("../components/CompanionLayer", () => ({ CompanionLayer: () => <div data-testid="mock-companion" /> }));
// The orb is tested on its own; here it only reports a catch or an escape.
vi.mock("../components/SparkOrbLearningShell", () => ({
  SparkOrbLearningShell: (props: { chargeGoal: number; catchRule?: { rarity: string }; onCaptureCompleted?: () => void; onEscaped?: () => void }) => (
    <div data-testid="mock-orb" data-charges={props.chargeGoal} data-rarity={props.catchRule?.rarity}>
      <button type="button" onClick={() => props.onCaptureCompleted?.()}>caught</button>
      <button type="button" onClick={() => props.onEscaped?.()}>escaped</button>
    </div>
  ),
}));

const companion = { ...COMPANION_DEFAULTS, companionId: "elli" } as CompanionConfig;
const encounter = { encounterId: "board-1:s1", creatureId: "glowmoth", charges: 2, isNew: true };
let posts: Array<{ url: string; body: any }> = [];

beforeEach(() => {
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) posts.push({ url, body });
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/creatures/encounter") return json({ ok: true, duplicate: false });
    if (url === "/api/creatures/ila") {
      return json({
        den: { creatures: [{ creatureId: "lumipuff", nickname: "Lumi", bond: 40, caughtAt: "x" }], sidekickId: null, food: { apple_bite: 2 } },
        history: { seenIds: ["lumipuff"], caughtIds: ["lumipuff"], boardsCompleted: 1, encountersThisBoard: 0, lastTryAt: {} },
        pending: [],
        scene: { season: "autumn", timeOfDay: "night" },
      });
    }
    if (url === "/api/creatures/den") {
      return json({ ok: true, den: { creatures: [{ creatureId: "lumipuff", nickname: "Lumi", bond: 40, caughtAt: "x" }], sidekickId: body.action === "recall" ? body.creatureId : null, food: { apple_bite: 2 } } });
    }
    throw new Error(`unexpected ${url}`);
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const reveal = () => act(() => vi.advanceTimersByTime(3_000));

describe("LiveCreatureEncounter", () => {
  it("letting it go records let go and finishes", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<LiveCreatureEncounter childId="ila" encounter={encounter} companion={companion} onDone={onDone} />);
    reveal();
    expect(screen.getByText("Glowmoth")).toBeInTheDocument();
    expect(screen.getByText(/2 throws/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Let it go/ })));
    expect(posts).toEqual([{ url: "/api/creatures/encounter", body: { childId: "ila", encounterId: "board-1:s1", outcome: "let_go" } }]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("catching it uses her earned throws and the creature's rarity, saves the catch, and shows it joined her den", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<LiveCreatureEncounter childId="ila" encounter={encounter} companion={companion} onDone={onDone} />);
    reveal();
    fireEvent.click(screen.getByRole("button", { name: /Catch it/ }));
    const orb = screen.getByTestId("mock-orb");
    expect(orb).toHaveAttribute("data-charges", "2");
    expect(orb).toHaveAttribute("data-rarity", "rare");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "caught" })));
    expect(posts.at(-1)).toEqual({ url: "/api/creatures/encounter", body: { childId: "ila", encounterId: "board-1:s1", outcome: "caught" } });
    expect(screen.getByText(/joined your den/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back to my map/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("when every throw breaks free, it got away and is recorded as let go", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<LiveCreatureEncounter childId="ila" encounter={encounter} companion={companion} onDone={onDone} />);
    reveal();
    fireEvent.click(screen.getByRole("button", { name: /Catch it/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "escaped" })));
    expect(posts.at(-1)?.body.outcome).toBe("let_go");
    expect(screen.getByText(/got away/)).toBeInTheDocument();
  });
});

describe("the den on her map", () => {
  it("the Den button appears only once she has a creature", () => {
    const { rerender } = render(<DenButton creatureCount={0} onOpen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Den/ })).not.toBeInTheDocument();
    rerender(<DenButton creatureCount={2} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Den/ })).toBeInTheDocument();
  });

  it("loads her den from the server and saves a recall there", async () => {
    render(<CreatureDenOverlay childId="ila" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("den-wild-lumipuff")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("den-wild-lumipuff"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Recall Lumi/ })));
    expect(posts.at(-1)).toEqual({ url: "/api/creatures/den", body: { childId: "ila", action: "recall", creatureId: "lumipuff" } });
    await waitFor(() => expect(screen.getByTestId("den-wild-lumipuff")).toHaveAttribute("data-sidekick", "true"));
  });
});

describe("the kiosk wires her creatures in", () => {
  it("takes the encounter from the completion, starts her creatures once per session, and shows the den and sidekick", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(app).toContain("if (completion?.creatureEncounter) setCreatureEncounter(completion.creatureEncounter);");
    expect(app).toContain("startCreatureSession(adventureChildId)");
    expect(app).toContain("creatureSessionStartedRef.current === adventureChildId");
    expect(app).toContain("<DenButton");
    expect(app).toContain("<SidekickBuddy");
  });
});
