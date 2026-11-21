import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_DEFAULTS, type CompanionConfig } from "../../../src/shared/companionTypes";
import { ChestThenCreature } from "../components/LiveCreatureEncounter";

// The 3D game is tested on its own (and needs WebGL); here it shows what it was given and reports the catch.
vi.mock("../components/OrbCatcher3D", () => ({
  OrbCatcher3D: (props: { creature: { id: string }; drill?: { plannedRounds: number; questions: Array<{ prompt: string }> }; announcerChildId?: string; theme?: { id: string }; onResult?: (outcome: "caught" | "escaped") => void }) => (
    <div
      data-testid="mock-orb-3d"
      data-creature={props.creature.id}
      data-rounds={props.drill?.plannedRounds ?? 0}
      data-questions={props.drill?.questions.map((question) => question.prompt).join(",") ?? ""}
      data-announcer={props.announcerChildId ?? ""}
      data-theme={props.theme?.id ?? ""}
    >
      <button type="button" onClick={() => props.onResult?.("caught")}>caught</button>
    </div>
  ),
}));

const companion = { ...COMPANION_DEFAULTS, companionId: "elli" } as CompanionConfig;
const gift = {
  encounterId: "birthday:2026",
  creatureId: "starwhal",
  charges: 3,
  isNew: true,
  gift: "birthday" as const,
  questions: [
    { id: "a", kind: "spelling" as const, prompt: "carnival", answer: "carnival" },
    { id: "b", kind: "spelling" as const, prompt: "pardon", answer: "pardon" },
  ],
};
let posts: Array<{ url: string; body: any }> = [];
let lines: string[] = [];

beforeEach(() => {
  posts = [];
  lines = [];
  // Her recorded "Happy birthday!" line: it plays as the present opens, and the game starts when it ends.
  vi.stubGlobal("Audio", class {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src: string) { lines.push(src); }
    play() { queueMicrotask(() => this.onended?.()); return Promise.resolve(); }
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) posts.push({ url, body: JSON.parse(String(init.body)) });
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ ok: true, duplicate: false }) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("birthday gift after a finished stop (owner, 2026-11-21)", () => {
  it("shows a present first, then Orb Catcher with the words she just practiced, in her own world", async () => {
    render(<ChestThenCreature renderChest={null} encounter={gift} childId="ila" companion={companion} onFinish={() => {}} />);
    expect(screen.getByTestId("birthday-gift").dataset.stage).toBe("present");
    expect(screen.queryByTestId("mock-orb-3d")).toBeNull();
    fireEvent.click(screen.getByTestId("birthday-present"));
    expect(lines).toEqual(["/generated/announcer/ila/clips/slot-birthday.mp3"]);
    const game = await screen.findByTestId("mock-orb-3d");
    expect(game.dataset.creature).toBe("starwhal");
    expect(game.dataset.questions).toBe("carnival,pardon");
    expect(game.dataset.rounds).toBe("2");
    expect(game.dataset.announcer).toBe("ila");
    expect(game.dataset.theme).toBe("yokai-night");
  });

  it("the catch is saved to her den, then she goes back to her map", { timeout: 10_000 }, async () => {
    const onFinish = vi.fn();
    render(<ChestThenCreature renderChest={null} encounter={gift} childId="reina" companion={companion} onFinish={onFinish} />);
    fireEvent.click(screen.getByTestId("birthday-present"));
    expect((await screen.findByTestId("mock-orb-3d")).dataset.theme).toBe("championship");
    fireEvent.click(screen.getByText("caught"));
    await waitFor(() => expect(posts).toEqual([{ url: "/api/creatures/encounter", body: { childId: "reina", encounterId: "birthday:2026", outcome: "caught" } }]));
    fireEvent.click(await screen.findByTestId("birthday-done", {}, { timeout: 5000 }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
