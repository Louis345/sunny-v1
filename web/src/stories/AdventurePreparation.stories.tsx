import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { AdventurePreparationScreen, type AdventurePreparationScreenProps, type PreparationItem } from "../components/AdventurePreparation/AdventurePreparationScreen";
import { preparationLine, type PreparationEvent, type PreparationState } from "../components/AdventurePreparation/adventurePreparationMachine";
import { useAdventurePreparation } from "../components/AdventurePreparation/useAdventurePreparation";

/**
 * "Getting your next adventure ready": the wait between Discovery and the new map.
 * Storybook only; not wired into the app yet. In the app the real 3D Elli stands in
 * the slot under the bubble, so here the slot shows a labelled placeholder.
 */
const meta = { title: "Learning Journey/Adventure Preparation", parameters: { layout: "centered" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const WORDS = ["because", "friend", "said", "again", "could", "light", "night", "house", "school", "there", "where"];
const items: PreparationItem[] = WORDS.map(face => ({ face, spoken: face }));
const stops = [{ activityType: "spell-check" }, { activityType: "word-radar" }, { activityType: "letter-rush" }, { activityType: "visual-explainer" }];
const SIZES = { kiosk: [1200, 780], tablet: [768, 1024], phone: [390, 844] } as const;
const noop = () => undefined;
const ElliPlaceholder = () => <div className="ap-elli-placeholder" style={{ width: "100%", height: "100%" }}>Elli stands here<br />(real 3D companion)</div>;

function Frame({ size, children }: { size: keyof typeof SIZES; children: ReactNode }) {
  const [width, height] = SIZES[size];
  return <div style={{ width, height, borderRadius: 28, overflow: "hidden", boxShadow: "0 30px 80px -30px rgba(13,10,30,.6)" }}>{children}</div>;
}

function screenFor(state: PreparationState, extra: Partial<AdventurePreparationScreenProps> = {}): AdventurePreparationScreenProps {
  const ready = extra.ready ?? (state === "ready" ? 4 : state === "long" ? 3 : state === "build" || state === "help" || state === "stop" ? 2 : 0);
  return {
    state, items, reviewed: state === "look" ? [0, 1, 2, 3, 4, 5, 6] : [], stops: state === "look" || state === "plan" ? [] : stops, ready,
    line: preparationLine(state, { subject: "spelling", ready }),
    grownUp: { visible: true, answeredCount: 11, elapsedLabel: state === "ready" ? "3 min 12 s" : state === "long" ? "6 min" : "1 min so far" },
    elliSlot: <ElliPlaceholder />,
    onHearItem: item => console.info("[story] hear", item.spoken), onHearLine: noop, onStop: noop, onTryAgain: noop, onFinishLater: noop, onBye: noop, onLetsGo: noop,
    ...extra,
  };
}

const kiosk = (state: PreparationState, extra?: Partial<AdventurePreparationScreenProps>): Story => ({
  render: () => <Frame size="kiosk"><AdventurePreparationScreen {...screenFor(state, extra)} /></Frame>,
});

export const S01LookingAtWhatYouDid = kiosk("look");
export const S02PlanningYourMap = kiosk("plan");
export const S03BuildingYourActivities = kiosk("build");
export const S04YourMapIsReady = kiosk("ready");
export const S05TakingLonger = kiosk("long");
export const S05bTakingLongerWithHangoutOffer = kiosk("long", { offerHangout: true });
export const S06NeedsAGrownUp = kiosk("help");
export const S07StopForNow = kiosk("stop");
export const S08TabletBuilding: Story = { render: () => <Frame size="tablet"><AdventurePreparationScreen {...screenFor("build")} /></Frame> };
export const S09PhoneBuilding: Story = { render: () => <Frame size="phone"><AdventurePreparationScreen {...screenFor("build")} /></Frame> };
export const S10PhoneNeedsAGrownUp: Story = { render: () => <Frame size="phone"><AdventurePreparationScreen {...screenFor("help")} /></Frame> };
export const S11TabletReady: Story = { render: () => <Frame size="tablet"><AdventurePreparationScreen {...screenFor("ready")} /></Frame> };

/** Mock event driver: plays a whole wait through the real state machine. */
type Path = "happy" | "slow" | "failed" | "stop";
function replayScript(path: Path): Array<[number, PreparationEvent]> {
  const script: Array<[number, PreparationEvent]> = [[200, { type: "REVIEW_STARTED", total: WORDS.length }]];
  WORDS.forEach((_, index) => script.push([400, { type: "REVIEW_ITEM", index }]));
  script.push([800, { type: "REVIEW_DONE" }], [3000, { type: "PLAN_DONE", stops }]);
  const readyStep = (n: number): [number, PreparationEvent] => [3000, { type: "ACTIVITY_READY", n, total: stops.length }];
  if (path === "happy") script.push(readyStep(1), readyStep(2), readyStep(3), readyStep(4));
  if (path === "slow") script.push(readyStep(1), readyStep(2), [2500, { type: "SLOW" }], readyStep(3), [6000, { type: "ACTIVITY_READY", n: 4, total: 4 }]);
  if (path === "failed") script.push(readyStep(1), readyStep(2), [2500, { type: "FAILED", reason: "creator_timeout", retryable: true }]);
  if (path === "stop") script.push(readyStep(1), [1500, { type: "STOP" }], readyStep(2), readyStep(3), readyStep(4));
  return script;
}

function Replay({ path, speed, size }: { path: Path; speed: number; size: keyof typeof SIZES }) {
  const [spoken, setSpoken] = useState<string[]>([]);
  const { snapshot, send } = useAdventurePreparation({ subject: "spelling", say: line => setSpoken(lines => [...lines, line]) });
  useEffect(() => {
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let at = 0;
    for (const [delay, event] of replayScript(path)) {
      at += delay / speed;
      timers.push(setTimeout(() => { if (!cancelled) send(event); }, at));
    }
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [path, speed, send]);
  if (!snapshot) return null;
  const ctx = snapshot.context;
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <Frame size={size}>
        <AdventurePreparationScreen
          {...screenFor(snapshot.value as PreparationState, { reviewed: ctx.reviewed, stops: ctx.stops, ready: ctx.ready, line: ctx.line })}
          onStop={() => send({ type: "STOP" })} onTryAgain={() => send({ type: "RETRY" })}
        />
      </Frame>
      <ol aria-label="Elli said" style={{ width: 260, font: "13px/1.5 Lexend, sans-serif", color: "#2a2440" }}>
        {spoken.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
    </div>
  );
}

export const ReplayWholeWait: StoryObj<{ path: Path; speed: number; size: keyof typeof SIZES }> = {
  args: { path: "happy", speed: 1, size: "kiosk" },
  argTypes: { path: { control: "radio", options: ["happy", "slow", "failed", "stop"] }, speed: { control: "radio", options: [1, 10] }, size: { control: "radio", options: ["kiosk", "tablet", "phone"] } },
  render: args => <Replay key={`${args.path}:${args.speed}:${args.size}`} {...args} />,
};
