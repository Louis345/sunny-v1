import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";
import { AdventureBoard } from "../components/AdventureBoard";
import { LearningPreparationStatus } from "../components/LearningPreparationStatus";
import {
  bossBoardPreview,
  predecessorHistoryBoard,
  questBoardPreview,
  supportBoardPreview,
} from "../storybook/boardLifecycleFixtures";

const meta = {
  title: "Learning Journey/Immutable Boards",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function LifecycleBoard({ board }: { board: AdventureBoardJson }) {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <AdventureBoard
        board={board}
        onNodeClick={(node) => console.info("[storybook:immutable-board:node]", node)}
      />
    </div>
  );
}

export const SupportBoardWithoutQuestOrBoss: Story = {
  render: () => <LifecycleBoard board={supportBoardPreview} />,
};

export const QuestBoardAuthorizedBeforePublication: Story = {
  render: () => <LifecycleBoard board={questBoardPreview} />,
};

export const BossBoardAuthorizedBeforePublication: Story = {
  render: () => <LifecycleBoard board={bossBoardPreview} />,
};

export const PreparingNextCompleteBoard: Story = {
  render: () => (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        color: "#fff8e8",
        background:
          "linear-gradient(rgba(15,10,43,.58), rgba(15,10,43,.76)), url(/generated/adventure-board-demo/silent-letter-world.jpeg) center/cover",
        fontFamily: "Inter, ui-rounded, system-ui, sans-serif",
      }}
    >
      <section
        aria-label="Next board preparation"
        style={{
          width: "min(560px, 100%)",
          padding: 34,
          border: "1px solid rgba(255,255,255,.24)",
          borderRadius: 28,
          background: "rgba(18,13,45,.92)",
          boxShadow: "0 24px 70px rgba(0,0,0,.38)",
          textAlign: "center",
        }}
      >
        <div aria-hidden="true" style={{ fontSize: 52, marginBottom: 12 }}>⭐</div>
        <p style={{ margin: 0, color: "#ffd76f", fontWeight: 900, letterSpacing: ".08em" }}>
          TODAY&apos;S TRAIL IS COMPLETE
        </p>
        <h1 style={{ margin: "12px 0", fontSize: "clamp(28px, 5vw, 42px)" }}>
          Sunny is preparing your next adventure
        </h1>
        <p style={{ margin: "0 auto", maxWidth: 430, fontSize: 18, color: "rgba(255,248,232,.8)" }}>
          Your work is safely saved. The next complete map will be ready on a later visit.
        </p>
        <button
          type="button"
          style={{
            marginTop: 26,
            minHeight: 48,
            border: 0,
            borderRadius: 999,
            padding: "12px 24px",
            background: "#ffd76f",
            color: "#23183f",
            font: "inherit",
            fontWeight: 900,
            cursor: "pointer",
          }}
          onClick={() => console.info("[storybook:immutable-board:finish-for-now]")}
        >
          Finish for now
        </button>
      </section>
    </main>
  ),
};

export const PredecessorUnchangedAfterSuccessor: Story = {
  render: () => (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <AdventureBoard
        board={predecessorHistoryBoard}
        onNodeClick={(node) => console.info("[storybook:immutable-board:history-node]", node)}
      />
      <p
        style={{
          position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 14px", borderRadius: 999,
          background: "rgba(18,13,45,.88)", color: "#fff8e8", font: "600 14px Inter, system-ui, sans-serif",
        }}
      >
        {predecessorHistoryBoard.title} · read-only history · next board: {questBoardPreview.title}
      </p>
    </div>
  ),
};

function RealPreparationStatus({ phase }: { phase: "successor_preparing" | "successor_published" }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#09090b" }}>
      <div style={{ width: "min(32rem, 100%)" }}>
        <LearningPreparationStatus
          status={{ phase, updatedAt: "storybook", nodes: [] }}
          onCheck={() => console.info("[storybook:immutable-board:check]")}
          onFinish={() => console.info("[storybook:immutable-board:finish-for-now]")}
        />
      </div>
    </main>
  );
}

export const SuccessorPreparingWithRealStatus: Story = {
  render: () => <RealPreparationStatus phase="successor_preparing" />,
};

export const SuccessorPublishedWaitsForNextVisit: Story = {
  render: () => <RealPreparationStatus phase="successor_published" />,
};
