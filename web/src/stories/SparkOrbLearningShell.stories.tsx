import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  SparkOrbLearningShell,
  type OrbCompanionAnchorContext,
  type OrbLearningLastMoment,
  type SparkOrbLearningEncounterEvent,
} from "../components/SparkOrbLearningShell";
import {
  MonsterDenPreview,
} from "../components/CapturedMonsterDen";
import {
  createPersistentStorybookMonsterInventory,
  createStorybookMonsterInventory,
  recordCapturedCreatureReward,
  storybookReceiptForInventoryRecord,
  type CapturedCreatureRewardGatewayReceipt,
  type OrbCaptureCompletedEvent,
} from "../components/capturedMonsterReward";
import {
  publishNativeActiveCreature,
  publishNativeCreatureMoment,
  readNativeActiveCreatureSelection,
  returnNativeCreatureToFarmSafely,
  selectionIdForReceipt,
} from "../components/nativeCreatureBridge";
import {
  LUMIPUFF_MONSTER,
  MOSSBACK_MONSTER,
  capturedMonsterById,
  capturedMonsterCatalog,
  type CapturedMonsterCapturePersonality,
  type CapturedMonsterConfig,
} from "../components/capturedMonsterCatalog";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

export type SparkOrbLearningShellStoryArgs = {
  phase: SparkOrbEncounterPhase;
  domain: string;
  currentTarget: string;
  lastMoment: OrbLearningLastMoment;
  capturePersonality: CapturedMonsterCapturePersonality;
  creatureId?: string;
};

const phases: SparkOrbEncounterPhase[] = [
  "idle",
  "charge-1",
  "charge-2",
  "ready",
  "launching",
  "collected",
];

const moments: OrbLearningLastMoment[] = [
  "watching",
  "spark_earned",
  "missed_try",
  "recovered",
  "orb_ready",
  "launched",
  "collected",
];

const capturePersonalities: CapturedMonsterCapturePersonality[] = [
  "playful",
  "shy",
  "brave",
  "sleepy",
];

const creatureIds = capturedMonsterCatalog.map((creature) => creature.id);

const meta: Meta<SparkOrbLearningShellStoryArgs> = {
  title: "Reward Encounters/Spark Orb Learning Shell",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only preview for the domain-agnostic Spark Orb learning shell: problem panel, orb encounter, and real companion travel buddy context.",
      },
    },
  },
  argTypes: {
    phase: { control: "select", options: phases },
    domain: { control: "text" },
    currentTarget: { control: "text" },
    lastMoment: { control: "select", options: moments },
    capturePersonality: { control: "select", options: capturePersonalities },
    creatureId: { control: "select", options: creatureIds },
  },
  args: {
    phase: "idle",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "watching",
    capturePersonality: "playful",
    creatureId: LUMIPUFF_MONSTER.id,
  },
};

export default meta;
type Story = StoryObj<SparkOrbLearningShellStoryArgs>;

function companionForChild(childId: string): { companion: CompanionConfig; companionName: string } {
  const entry =
    COMPANION_MANIFEST.find((candidate) => {
      const defaults = candidate.defaultFor;
      return Array.isArray(defaults) ? defaults.includes(childId) : defaults === childId;
    }) ?? COMPANION_MANIFEST.find((candidate) => candidate.id === "elli") ?? COMPANION_MANIFEST[0];

  if (!entry) {
    throw new Error("spark_orb_learning_shell_missing_companion_manifest");
  }
  return {
    companion: entry.companionConfig,
    companionName: entry.name,
  };
}

function logCompanionAnchor(context: OrbCompanionAnchorContext): void {
  console.info(" 🎮 [storybook:spark-orb-learning] [companion-anchor] [reported]", context);
}

function logEncounterEvent(event: SparkOrbLearningEncounterEvent): void {
  console.info(" 🎮 [storybook:spark-orb-learning] [encounter-event] [reported]", event);
}

const storybookSparkOrbInventory =
  typeof window === "undefined"
    ? createStorybookMonsterInventory({ childId: "ila" })
    : createPersistentStorybookMonsterInventory({ childId: "ila" });

function logCaptureCompleted(
  event: OrbCaptureCompletedEvent,
): CapturedCreatureRewardGatewayReceipt {
  const receipt = recordCapturedCreatureReward({
    mode: "storybook_only",
    event,
    inventory: storybookSparkOrbInventory,
  });
  console.info(" 🎮 [storybook:spark-orb-learning] [capture-reward] [reported]", receipt);
  return receipt;
}

function ProblemCard({
  label,
  title,
  children,
  feedback,
}: {
  label: string;
  title: string;
  children: ReactNode;
  feedback: string;
}): ReactElement {
  return (
    <div className="spark-orb-story-problem">
      <div className="spark-orb-story-problem__label">{label}</div>
      <h2>{title}</h2>
      <div className="spark-orb-story-problem__body">{children}</div>
      <div className="spark-orb-story-problem__feedback">{feedback}</div>
      <style>{`
        .spark-orb-story-problem {
          display: grid;
          gap: 16px;
          height: 100%;
          align-content: start;
        }

        .spark-orb-story-problem__label {
          color: #0e8f9f;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .spark-orb-story-problem h2 {
          color: #10202d;
          font-size: clamp(30px, 4vw, 46px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1.04;
          margin: 0;
        }

        .spark-orb-story-problem__body {
          display: grid;
          gap: 12px;
        }

        .spark-orb-story-problem__answer,
        .spark-orb-story-problem__choice,
        .spark-orb-story-problem__passage,
        .spark-orb-story-problem__write-box {
          border-radius: 16px;
          font-weight: 850;
        }

        .spark-orb-story-problem__answer {
          align-items: center;
          background: #f4f8fb;
          border: 2px solid transparent;
          color: #10202d;
          display: flex;
          justify-content: space-between;
          padding: 15px 16px;
        }

        .spark-orb-story-problem__choice-grid {
          display: grid;
          gap: 10px;
        }

        .spark-orb-story-problem__choice {
          align-items: center;
          background: #ffffff;
          border: 2px solid rgba(16, 32, 45, 0.12);
          color: #10202d;
          cursor: pointer;
          display: flex;
          font-size: 18px;
          justify-content: space-between;
          line-height: 1;
          min-height: 54px;
          padding: 14px 16px;
          transition:
            border-color 140ms ease,
            box-shadow 140ms ease,
            transform 140ms ease;
        }

        .spark-orb-story-problem__choice:hover,
        .spark-orb-story-problem__choice:focus-visible {
          border-color: rgba(14, 143, 159, 0.72);
          box-shadow: 0 10px 22px rgba(14, 143, 159, 0.12);
          outline: none;
          transform: translateY(-1px);
        }

        .spark-orb-story-problem__choice[data-correct="true"] {
          background: #effdf5;
          border-color: rgba(101, 185, 109, 0.8);
        }

        .spark-orb-story-problem__answer[data-correct="true"] {
          background: #effdf5;
          border-color: rgba(101, 185, 109, 0.8);
        }

        .spark-orb-story-problem__passage {
          background: #f5faf6;
          border: 1px solid rgba(101, 185, 109, 0.2);
          color: #25482d;
          line-height: 1.45;
          padding: 16px;
        }

        .spark-orb-story-problem__write-box {
          align-items: center;
          background: #f4f8fb;
          border: 2px dashed rgba(16, 32, 45, 0.2);
          display: flex;
          font-size: 40px;
          height: 96px;
          justify-content: center;
        }

        .spark-orb-story-problem__feedback {
          background: #10202d;
          border-radius: 18px;
          color: #ffe46b;
          font-size: 18px;
          font-weight: 950;
          line-height: 1.25;
          padding: 16px;
        }
      `}</style>
    </div>
  );
}

type StoryQuestion = {
  target: string;
  prompt: string;
  stem: string;
  answer: string;
  choices: string[];
};

const spellingQuestions: StoryQuestion[] = [
  {
    target: "word:because",
    prompt: "Spell the word you hear",
    stem: "becau_e",
    answer: "because",
    choices: ["because", "becuase", "becuse"],
  },
  {
    target: "word:garden",
    prompt: "Choose the garden word",
    stem: "gar_en",
    answer: "garden",
    choices: ["gardan", "garden", "gardin"],
  },
  {
    target: "word:spark",
    prompt: "Finish the spark word",
    stem: "spa_k",
    answer: "spark",
    choices: ["spack", "spark", "shark"],
  },
];

function chargeCountForStoryPhase(phase: SparkOrbEncounterPhase): number {
  if (phase === "charge-1") return 1;
  if (phase === "charge-2") return 2;
  if (phase === "ready" || phase === "launching" || phase === "collected") return 3;
  return 0;
}

function phaseForChargeCount(chargeCount: number): SparkOrbEncounterPhase {
  if (chargeCount >= 3) return "ready";
  if (chargeCount === 2) return "charge-2";
  if (chargeCount === 1) return "charge-1";
  return "idle";
}

function lastMomentForChargeCount(chargeCount: number): OrbLearningLastMoment {
  if (chargeCount >= 3) return "orb_ready";
  if (chargeCount > 0) return "spark_earned";
  return "watching";
}

function SpellingProblem({ questionIndex = 3 }: { questionIndex?: number }): ReactElement {
  return (
    <ProblemCard
      label={`Spelling · Question ${questionIndex} of 3`}
      title="Spell the word you hear"
      feedback="Correct answer: +1 spark. SFX: bright ping, orb glow, buddy smile."
    >
      <div className="spark-orb-story-problem__answer">Question {questionIndex} of 3</div>
      <div className="spark-orb-story-problem__write-box">becau_e</div>
      <div className="spark-orb-story-problem__answer" data-correct="true">
        because <span>+1</span>
      </div>
    </ProblemCard>
  );
}

type AimAndLaunchLearningStoryProps = SparkOrbLearningShellStoryArgs & {
  onRecordedCapture?: (receipt: CapturedCreatureRewardGatewayReceipt) => void;
  creature?: CapturedMonsterConfig;
};

function AimAndLaunchLearningStory({
  onRecordedCapture,
  creature,
  ...args
}: AimAndLaunchLearningStoryProps): ReactElement {
  const [chargeCount, setChargeCount] = useState(() => chargeCountForStoryPhase(args.phase));
  const [feedback, setFeedback] = useState("Each correct answer lights one spark.");
  const { companion, companionName } = companionForChild("ila");
  const activeQuestionIndex = Math.min(chargeCount, spellingQuestions.length - 1);
  const activeQuestion = spellingQuestions[activeQuestionIndex] ?? spellingQuestions[0];
  const phase = phaseForChargeCount(chargeCount);
  const lastMoment = lastMomentForChargeCount(chargeCount);
  const ready = chargeCount >= 3;

  useEffect(() => {
    setChargeCount(chargeCountForStoryPhase(args.phase));
  }, [args.phase]);

  function handleAnswer(choice: string): void {
    if (ready || !activeQuestion) return;
    const correct = choice === activeQuestion.answer;
    if (!correct) {
      setFeedback("Try the other spelling.");
      playSparkOrbSfx("miss");
      console.info(" 🎮 [storybook:spark-orb-learning] [question-answer] [try-again]", {
        questionIndex: activeQuestionIndex + 1,
        choice,
        target: activeQuestion.target,
        chargeCount,
        chargeGoal: 3,
        phase,
      });
      return;
    }

    const nextCharge = Math.min(3, chargeCount + 1);
    const nextPhase = phaseForChargeCount(nextCharge);
    setChargeCount(nextCharge);
    setFeedback(nextCharge >= 3 ? "Orb is ready." : "Spark earned.");
    playSparkOrbSfx(nextCharge >= 3 ? "ready" : "charge");
    console.info(" 🎮 [storybook:spark-orb-learning] [question-answer] [charge-earned]", {
      questionIndex: activeQuestionIndex + 1,
      choice,
      target: activeQuestion.target,
      chargeCount: nextCharge,
      chargeGoal: 3,
      phase: nextPhase,
    });
  }

  function handleCaptureCompleted(event: OrbCaptureCompletedEvent): void {
    const receipt = logCaptureCompleted(event);
    onRecordedCapture?.(receipt);
  }

  return (
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={companion}
      companionName={companionName}
      phase={phase}
      domain={args.domain}
      currentTarget={activeQuestion?.target ?? args.currentTarget}
      lastMoment={lastMoment}
      capturedCreature={{
        ...(creature ?? capturedMonsterById(args.creatureId ?? "") ?? LUMIPUFF_MONSTER),
        capturePersonality: args.capturePersonality,
      }}
      onCompanionAnchor={logCompanionAnchor}
      onEncounterEvent={logEncounterEvent}
      onCaptureCompleted={handleCaptureCompleted}
    >
      <ProblemCard
        label={`Spelling · Question ${activeQuestionIndex + 1} of 3`}
        title={activeQuestion?.prompt ?? "Spell the word you hear"}
        feedback={ready ? "Ready to launch." : feedback}
      >
        <div className="spark-orb-story-problem__answer">
          <span>Question {activeQuestionIndex + 1} of 3</span>
          <strong>{chargeCount}/3</strong>
        </div>
        <div className="spark-orb-story-problem__write-box">{activeQuestion?.stem}</div>
        <div className="spark-orb-story-problem__choice-grid">
          {(activeQuestion?.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-label={choice}
              className="spark-orb-story-problem__choice"
              data-correct={choice === activeQuestion?.answer ? "true" : "false"}
              disabled={ready}
              onClick={() => handleAnswer(choice)}
            >
              <span>{choice}</span>
              {choice === activeQuestion?.answer ? <strong>+1</strong> : null}
            </button>
          ))}
        </div>
      </ProblemCard>
    </SparkOrbLearningShell>
  );
}

function CreatureHandoffDemoStory(
  args: SparkOrbLearningShellStoryArgs,
): ReactElement {
  const initialCreature =
    capturedMonsterById(args.creatureId ?? "") ?? LUMIPUFF_MONSTER;
  const [encounterCreatureId, setEncounterCreatureId] = useState(
    initialCreature.id,
  );
  const [receipt, setReceipt] =
    useState<CapturedCreatureRewardGatewayReceipt | null>(null);
  const [surface, setSurface] = useState<"learning" | "arrival" | "farm" | "continued">(
    "learning",
  );
  const [farmCreatureId, setFarmCreatureId] = useState(initialCreature.id);
  const [activeCreatureId, setActiveCreatureId] = useState<string | null>(
    storybookSparkOrbInventory.state().activeCreatureId,
  );
  const [, setInventoryRevision] = useState(0);
  const [presentationStatus, setPresentationStatus] =
    useState<"idle" | "starting" | "active" | "resting">(
      activeCreatureId ? "active" : "idle",
    );
  const [returnError, setReturnError] = useState<string | null>(null);
  const encounterCreature =
    capturedMonsterById(encounterCreatureId) ?? LUMIPUFF_MONSTER;
  const farmRecords = storybookSparkOrbInventory.list();
  const selectedRecord =
    farmRecords.find((record) => record.creatureId === farmCreatureId) ??
    receipt?.reward.inventoryRecord ??
    null;
  const selectedFarmCreature = selectedRecord
    ? capturedMonsterById(selectedRecord.creatureId)
    : null;
  const activeRecord =
    farmRecords.find((record) => record.creatureId === activeCreatureId) ?? null;
  const activeReceipt = activeRecord
    ? storybookReceiptForInventoryRecord(activeRecord)
    : null;

  useEffect(() => {
    if (surface !== "farm" || !activeReceipt) return;
    const selectedReceipt = activeReceipt;
    async function reconcileNativeReturn(): Promise<void> {
      try {
        const nativeSelectionId = await readNativeActiveCreatureSelection();
        if (nativeSelectionId === selectionIdForReceipt(selectedReceipt)) return;
        storybookSparkOrbInventory.returnActiveCreature();
        setActiveCreatureId(null);
        setPresentationStatus("idle");
        console.info(
          " 🎮 [sunny-farm] [native-return-reconciled] [idle]",
          { previousSelectionId: selectionIdForReceipt(selectedReceipt) },
        );
      } catch (error) {
        console.error(
          " 🎮 [sunny-farm] [native-return-reconciled] [failed]",
          error,
        );
      }
    }
    function handleVisibility(): void {
      if (document.visibilityState === "visible") {
        void reconcileNativeReturn();
      }
    }
    function handleFocus(): void {
      void reconcileNativeReturn();
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeReceipt, surface]);

  async function bringWithMe(): Promise<void> {
    if (!selectedRecord) return;
    const selectedReceipt = storybookReceiptForInventoryRecord(selectedRecord);
    storybookSparkOrbInventory.selectActiveCreature(selectedRecord.creatureId);
    setActiveCreatureId(selectedRecord.creatureId);
    setPresentationStatus("starting");
    try {
      await publishNativeActiveCreature({
        ...selectedReceipt,
        reward: {
          ...selectedReceipt.reward,
          inventoryRecord: selectedRecord,
        },
      });
      setPresentationStatus("active");
    } catch (error) {
      setPresentationStatus("resting");
      console.error(" 🎮 [sunny-farm] [active-creature-selected] [failed]", error);
      throw error;
    }
  }

  async function showBuddyMoment(
    moment:
      | "correct"
      | "recovery"
      | "streak"
      | "idle"
      | "session-complete",
    streakCount?: number,
  ): Promise<void> {
    if (!activeReceipt) return;
    try {
      await publishNativeCreatureMoment({
        selectionId: selectionIdForReceipt(activeReceipt),
        moment,
        streakCount,
        protectedInteraction: false,
      });
    } catch (error) {
      console.error(" 🎮 [sunny-buddy] [learning-moment] [failed]", error);
    }
  }

  async function returnToFarm(): Promise<void> {
    if (!activeReceipt) return;
    const selectionId = selectionIdForReceipt(activeReceipt);
    setReturnError(null);
    try {
      await returnNativeCreatureToFarmSafely(
        { childId: activeReceipt.childId, selectionId },
        {
          onAccepted() {
            storybookSparkOrbInventory.returnActiveCreature();
            setActiveCreatureId(null);
            setPresentationStatus("idle");
          },
        },
      );
    } catch (error) {
      setReturnError(
        `${activeReceipt.reward.inventoryRecord.nickname} couldn’t return yet—try again.`,
      );
      console.error(" 🎮 [sunny-farm] [active-creature-returned] [failed]", error);
      throw error;
    }
  }

  function startEncounter(creature: CapturedMonsterConfig): void {
    setEncounterCreatureId(creature.id);
    setReceipt(null);
    setReturnError(null);
    setSurface("learning");
  }

  if (surface === "farm" && selectedRecord && selectedFarmCreature) {
    const selectedIsActive = activeCreatureId === selectedRecord.creatureId;
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <nav
          aria-label="Sunny Farm creatures"
          style={{
            background: "rgba(16,35,62,.94)",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            padding: "12px 18px",
          }}
        >
          {farmRecords.map((record) => {
            const creature = capturedMonsterById(record.creatureId);
            if (!creature) return null;
            return (
              <button
                key={record.creatureId}
                aria-pressed={record.creatureId === selectedRecord.creatureId}
                onClick={() => setFarmCreatureId(record.creatureId)}
                style={{
                  alignItems: "center",
                  borderRadius: 999,
                  display: "flex",
                  fontWeight: 900,
                  gap: 8,
                  padding: "7px 12px",
                }}
                type="button"
              >
                <img alt="" aria-hidden="true" src={creature.imageSrc} style={{ height: 38 }} />
                {record.nickname}
                {record.creatureId === activeCreatureId ? " · With you" : ""}
              </button>
            );
          })}
          {capturedMonsterCatalog
            .filter(
              (creature) =>
                !farmRecords.some((record) => record.creatureId === creature.id),
            )
            .map((creature) => (
              <button
                key={creature.id}
                onClick={() => startEncounter(creature)}
                style={{ borderRadius: 999, fontWeight: 900, padding: "9px 14px" }}
                type="button"
              >
                Explore {creature.habitatName}
              </button>
            ))}
        </nav>
        <MonsterDenPreview
          key={selectedRecord.id}
          creature={selectedFarmCreature}
          initialNickname={selectedRecord.nickname}
          initialBond={selectedRecord.bond}
          initialMood={selectedRecord.mood}
          active={selectedIsActive}
          presentationStatus={selectedIsActive ? presentationStatus : "idle"}
          onEvent={(event) => {
            storybookSparkOrbInventory.updateCreature(event.creatureId, {
              nickname: event.nickname,
              ...(event.lifeState ? { mood: event.lifeState } : {}),
              ...(event.bond != null ? { bond: event.bond } : {}),
            });
            setInventoryRevision((revision) => revision + 1);
          }}
          onSelectActive={bringWithMe}
          onReturnActive={returnToFarm}
        />
        {activeRecord ? (
          <aside
            aria-label="Active Sunny buddy"
            style={{
              alignItems: "center",
              background: "rgba(16,35,62,.94)",
              border: "2px solid rgba(255,255,255,.85)",
              borderRadius: 999,
              boxShadow: "0 12px 32px rgba(15,23,42,.24)",
              color: "white",
              display: "flex",
              gap: 10,
              padding: "9px 11px 9px 16px",
              position: "fixed",
              right: 18,
              top: 18,
              zIndex: 25,
            }}
          >
            <strong>{activeRecord.nickname} is with you</strong>
            <button
              aria-label={`Return ${activeRecord.nickname} to Farm from Sunny`}
              onClick={() => {
                void returnToFarm().catch((error) => {
                  console.error(
                    " 🎮 [sunny-farm] [return-button] [failed]",
                    error,
                  );
                });
              }}
              style={{
                border: 0,
                borderRadius: 999,
                fontWeight: 900,
                padding: "8px 12px",
              }}
              type="button"
            >
              🏡 Farm
            </button>
          </aside>
        ) : null}
        {returnError ? (
          <p
            role="alert"
            style={{
              background: "#fff4e5",
              borderRadius: 14,
              color: "#7c2d12",
              fontWeight: 850,
              padding: 12,
              position: "fixed",
              right: 18,
              top: 72,
              zIndex: 26,
            }}
          >
            {returnError}
          </p>
        ) : null}
        {activeRecord ? (
          <aside
            aria-label="Active buddy behavior lab"
            style={{
              background: "rgba(255,255,255,.94)",
              borderRadius: 20,
              bottom: 18,
              boxShadow: "0 14px 36px rgba(15,23,42,.2)",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              left: 18,
              maxWidth: 500,
              padding: 14,
              position: "fixed",
              zIndex: 20,
            }}
          >
            <strong style={{ flexBasis: "100%" }}>
              See {activeRecord.nickname} react across Sunny
            </strong>
            <button type="button" onClick={() => void showBuddyMoment("correct")}>
              Correct answer
            </button>
            <button type="button" onClick={() => void showBuddyMoment("recovery")}>
              Recovered
            </button>
            <button type="button" onClick={() => void showBuddyMoment("streak", 3)}>
              3 answer streak
            </button>
            <button type="button" onClick={() => void showBuddyMoment("idle")}>
              Quiet moment
            </button>
            <button
              type="button"
              onClick={() => void showBuddyMoment("session-complete")}
            >
              Session complete
            </button>
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AimAndLaunchLearningStory
        key={encounterCreature.id}
        {...args}
        capturePersonality={encounterCreature.capturePersonality}
        creature={encounterCreature}
        onRecordedCapture={(recordedReceipt) => {
          setReceipt(recordedReceipt);
          setFarmCreatureId(recordedReceipt.creatureId);
          setSurface("arrival");
          console.info(" 🎮 [sunny-farm] [farm_arrival_viewed] [recorded]", {
            childId: recordedReceipt.childId,
            creatureId: recordedReceipt.creatureId,
          });
        }}
      />
      {surface === "arrival" && receipt ? (
        <div
          role="dialog"
          aria-label={`${receipt.reward.inventoryRecord.nickname} arrived at Sunny Farm`}
          style={{
            alignItems: "center",
            background:
              "radial-gradient(circle at 50% 20%, rgba(255,245,170,.98), rgba(92,193,151,.97))",
            border: "4px solid rgba(255,255,255,.9)",
            borderRadius: 30,
            boxShadow: "0 28px 80px rgba(12,42,34,.35)",
            display: "grid",
            gap: 14,
            left: "50%",
            maxWidth: 520,
            padding: "26px 30px",
            position: "fixed",
            textAlign: "center",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "calc(100vw - 36px)",
            zIndex: 40,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 950, letterSpacing: ".1em" }}>
            NEW FARM FRIEND
          </span>
          <img
            src={receipt.reward.inventoryRecord.imageSrc}
            alt={receipt.reward.inventoryRecord.nickname}
            style={{ height: 180, justifySelf: "center", objectFit: "contain" }}
          />
          <h2 style={{ fontSize: 34, margin: 0 }}>
            {receipt.reward.inventoryRecord.nickname} landed safely!
          </h2>
          <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            {receipt.reward.inventoryRecord.nickname} now lives in your Farm.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => setSurface("farm")}
              style={{ borderRadius: 999, fontSize: 18, fontWeight: 900, padding: "12px 20px" }}
            >
              Visit Farm
            </button>
            <button
              type="button"
              onClick={() => setSurface("continued")}
              style={{ borderRadius: 999, fontSize: 18, fontWeight: 900, padding: "12px 20px" }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CollectedAnimationStory(args: SparkOrbLearningShellStoryArgs): ReactElement {
  const [captureProgress, setCaptureProgress] = useState(0);
  const { companion, companionName } = companionForChild("ila");

  return (
    <div>
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={companion}
        companionName={companionName}
        phase="ready"
        domain={args.domain}
        currentTarget={args.currentTarget}
        lastMoment={captureProgress >= 92 ? "collected" : "orb_ready"}
        capturedCreature={{
          ...LUMIPUFF_MONSTER,
          capturePersonality: args.capturePersonality,
        }}
        captureProgress={captureProgress}
        onCompanionAnchor={logCompanionAnchor}
        onEncounterEvent={logEncounterEvent}
      >
        <SpellingProblem />
      </SparkOrbLearningShell>
      <div
        style={{
          alignItems: "center",
          background: "#edf4f7",
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(260px, 520px)",
          justifyContent: "center",
          padding: "0 18px 24px",
        }}
      >
        <label
          style={{
            background: "#ffffff",
            border: "1px solid rgba(16, 32, 45, 0.14)",
            borderRadius: 18,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.1)",
            display: "grid",
            gap: 10,
            padding: "14px 16px",
          }}
        >
          <span
            style={{
              color: "#10202d",
              fontSize: 14,
              fontWeight: 950,
            }}
          >
            Capture animation {captureProgress}%
          </span>
          <input
            type="range"
            aria-label="Capture animation progress"
            min={0}
            max={100}
            step={1}
            value={captureProgress}
            onChange={(event) => setCaptureProgress(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    </div>
  );
}

export const AimAndLaunchSkill: Story = {
  args: {
    phase: "idle",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "watching",
  },
  render: (args) => <AimAndLaunchLearningStory {...args} />,
};

export const CollectedAnimation: Story = {
  args: {
    phase: "ready",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "orb_ready",
  },
  render: (args) => <CollectedAnimationStory {...args} />,
};

export const CreatureHandoffDemo: Story = {
  args: {
    phase: "idle",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "watching",
    capturePersonality: "playful",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Complete three factual practice answers and capture Lumipuff. Lumi lands in Sunny Farm without waking Electron. Choose Bring With Me in the Farm to activate the persistent native 3D buddy.",
      },
    },
  },
  render: (args) => <CreatureHandoffDemoStory {...args} />,
};

export const MossyCreatureHandoffDemo: Story = {
  args: {
    phase: "idle",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "watching",
    capturePersonality: MOSSBACK_MONSTER.capturePersonality,
    creatureId: MOSSBACK_MONSTER.id,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Earn Mossy through factual practice, welcome her to Whispering Grove, then select her as the one persistent native buddy. Previously captured creatures remain available for swapping in Sunny Farm.",
      },
    },
  },
  render: (args) => <CreatureHandoffDemoStory {...args} />,
};
