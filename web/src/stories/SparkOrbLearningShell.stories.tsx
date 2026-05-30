import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { useState } from "react";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  SparkOrbLearningShell,
  type OrbCompanionAnchorContext,
  type OrbLearningLastMoment,
  type SparkOrbLearningEncounterEvent,
} from "../components/SparkOrbLearningShell";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";

export type SparkOrbLearningShellStoryArgs = {
  phase: SparkOrbEncounterPhase;
  domain: string;
  currentTarget: string;
  lastMoment: OrbLearningLastMoment;
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
  },
  args: {
    phase: "charge-2",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "spark_earned",
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

function ProblemCard({
  label,
  title,
  children,
  feedback,
}: {
  label: string;
  title: string;
  children: ReactElement | ReactElement[];
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

function ShellStory({
  args,
  children,
}: {
  args: SparkOrbLearningShellStoryArgs;
  children: ReactElement;
}): ReactElement {
  const { companion, companionName } = companionForChild("ila");
  return (
    <SparkOrbLearningShell
      childId="ila"
      childName="Ila"
      companion={companion}
      companionName={companionName}
      phase={args.phase}
      domain={args.domain}
      currentTarget={args.currentTarget}
      lastMoment={args.lastMoment}
      onCompanionAnchor={logCompanionAnchor}
      onEncounterEvent={logEncounterEvent}
    >
      {children}
    </SparkOrbLearningShell>
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
    phase: "ready",
    domain: "spelling",
    currentTarget: "word:because",
    lastMoment: "orb_ready",
  },
  render: (args) => (
    <ShellStory args={args}>
      <SpellingProblem />
    </ShellStory>
  ),
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
