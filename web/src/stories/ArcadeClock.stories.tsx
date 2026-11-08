import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";
import { ArcadeClock } from "../components/CallClock";

type ArcadeStoryArgs = { coins: number; savedMinutes: number; ownsGame: boolean };

const meta: Meta<ArcadeStoryArgs> = {
  title: "Rewards/Arcade Clock",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Reward games are timed (owner, 2026-11-08): 25 coins buys 3 minutes on the same paid-minute meter as the earned call. The game is blocked until she inserts a coin, warns at a minute left, and at time up offers another coin or the way back to her map. This story fakes the reward routes in memory; nothing is saved.",
      },
    },
  },
  argTypes: {
    coins: { control: { type: "number", min: 0, max: 200, step: 5 } },
    savedMinutes: { control: { type: "number", min: 0, max: 10, step: 1 } },
    ownsGame: { control: "boolean" },
  },
  args: { coins: 60, savedMinutes: 0, ownsGame: false },
};
export default meta;
type Story = StoryObj<ArcadeStoryArgs>;

/** In-memory stand-in for /api/rewards/{arcade,wallet,purchase} so the clock runs in Storybook. */
function installFakeRewardServer(args: ArcadeStoryArgs): void {
  const state = { coins: args.coins, minutes: args.savedMinutes, spent: new Set<string>() };
  const realFetch = window.fetch.bind(window);
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/rewards/arcade/ila") return json({ minutesLeft: state.minutes, coins: state.coins, price: 25, minutes: 3, warnAtSecondsLeft: 60 });
    if (url === "/api/rewards/wallet/ila") return json({ coins: state.coins, ownedRewardIds: args.ownsGame ? ["game:space-invaders"] : [] });
    if (url === "/api/rewards/arcade/minute") {
      if (state.spent.has(body.receiptId)) return json({ ok: true, minutesLeft: state.minutes, coins: state.coins });
      if (state.minutes < 1) return json({ ok: false, reason: "no_minutes", coins: state.coins });
      state.minutes -= 1;
      state.spent.add(body.receiptId);
      return json({ ok: true, minutesLeft: state.minutes, coins: state.coins });
    }
    if (url === "/api/rewards/purchase") {
      if (state.coins < 25) return json({ ok: false, reason: "not_enough_coins", price: 25, balance: state.coins });
      state.coins -= 25;
      state.minutes += 3;
      console.info(" 🎮 [storybook:arcade-clock] [purchase] [paid]", body);
      return json({ ok: true, balance: state.coins, price: 25, duplicate: false, callMinutes: 0, arcadeMinutes: state.minutes });
    }
    return realFetch(input, init);
  };
}

function ArcadeStory(args: ArcadeStoryArgs): ReactElement {
  const [playId] = useState(() => {
    installFakeRewardServer(args);
    return `story-${Date.now().toString(36)}`;
  });
  const [left, setLeft] = useState(false);
  return (
    <div style={{ padding: 16, background: "#0b0820", minHeight: "100vh", fontFamily: "Lexend, system-ui, sans-serif" }}>
      <div style={{ position: "relative", height: "min(90vh, 640px)", borderRadius: 8, overflow: "hidden", background: "#0a0a12", display: "grid", placeItems: "center", color: "#7CFC8A" }}>
        <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: 28, letterSpacing: 4 }}>
          {left ? "Back on her map" : "👾 👾 👾 SPACE INVADERS 👾 👾 👾"}
        </div>
        {!left ? (
          <ArcadeClock childId="ila" playId={playId} gameMode="space-invaders" active onLeave={() => setLeft(true)} />
        ) : null}
      </div>
    </div>
  );
}

export const InsertCoin: Story = { name: "Insert coin to play", render: (args) => <ArcadeStory {...args} /> };
export const ShortOfCoins: Story = { name: "Not enough coins", args: { coins: 10 }, render: (args) => <ArcadeStory {...args} /> };
export const OneMinuteSaved: Story = {
  name: "One saved minute (time's up after a minute)",
  args: { savedMinutes: 1 },
  render: (args) => <ArcadeStory {...args} />,
};
