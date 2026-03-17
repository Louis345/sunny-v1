import type { HomeworkAssignment, HomeworkProblem } from "../../utils/loadHomework";

export interface PlaceValueStep {
  column: "hundreds" | "tens" | "ones";
  topDigit: number;
  bottomDigit: number;
  effectiveTopDigit: number;   // after receiving a borrow from the right
  effectiveBottomDigit: number; // always same as bottomDigit (borrowing doesn't change subtrahend)
  correctAnswer: number;
  requiresBorrowing: boolean;  // this column must borrow from its left neighbor
  isLending: boolean;          // this column lends 1 to the column on its right
  elliPrompt: string;
  borrowingNote: string | null;
  hintIfWrong: string;
}

export interface LessonStep {
  stepNumber: number;
  type: "warmup" | "place_value" | "celebrate";
  // warmup steps
  canvasContent?: string;
  elliPrompt?: string;
  correctAnswer?: number;
  // place_value steps
  operandA?: number;
  operandB?: number;
  operation?: "addition" | "subtraction";
  columnSteps?: PlaceValueStep[];  // ordered sequence of column steps
  problemLabel?: string;
}

export interface MathLessonPlan {
  child: string;
  generatedAt: string;
  source: string;
  steps: LessonStep[];
  elliFocusNote: string;  // high-level note injected into Elli's prompt
}

// ─── Column decomposition ───────────────────────────────────────────────────

function digits(n: number): { h: number; t: number; o: number } {
  const abs = Math.abs(n);
  return {
    h: Math.floor(abs / 100) % 10,
    t: Math.floor(abs / 10) % 10,
    o: abs % 10,
  };
}

const PLACE_NAMES: Record<"hundreds" | "tens" | "ones", string> = {
  hundreds: "hundreds",
  tens: "tens",
  ones: "ones",
};

const LEFT_NEIGHBOR: Record<"ones" | "tens", "tens" | "hundreds"> = {
  ones: "tens",
  tens: "hundreds",
};

// ─── Core algorithm: build column steps for one subtraction problem ──────────

function buildSubtractionSteps(a: number, b: number): PlaceValueStep[] {
  const aD = digits(a);
  const bD = digits(b);

  // Columns in RIGHT-TO-LEFT order (ones first — borrowing cascades right to left)
  const cols: Array<"ones" | "tens" | "hundreds"> = ["ones", "tens", "hundreds"];

  // Determine borrowing: scan right to left
  const borrows: Record<string, boolean> = { ones: false, tens: false, hundreds: false };
  const lends: Record<string, boolean> = { ones: false, tens: false, hundreds: false };

  const effectiveTop: Record<string, number> = {
    ones: aD.o,
    tens: aD.t,
    hundreds: aD.h,
  };
  const effectiveBot: Record<string, number> = {
    ones: bD.o,
    tens: bD.t,
    hundreds: bD.h,
  };

  // First pass: detect borrowing right to left
  for (const col of cols) {
    if (effectiveTop[col] < effectiveBot[col]) {
      borrows[col] = true;
      effectiveTop[col] += 10;
      const neighbor = LEFT_NEIGHBOR[col as "ones" | "tens"];
      if (neighbor) {
        lends[neighbor] = true;
        effectiveTop[neighbor] -= 1; // neighbor lends 1 ten/hundred
      }
    }
  }

  return cols.map((col): PlaceValueStep => {
    const top = effectiveTop[col];
    const bot = effectiveBot[col];
    const answer = top - bot;
    const needsBorrow = borrows[col];
    const isLending = lends[col];
    const placeName = PLACE_NAMES[col];

    let elliPrompt: string;
    let borrowingNote: string | null = null;
    let hintIfWrong: string;

    if (needsBorrow) {
      const neighbor = LEFT_NEIGHBOR[col as "ones" | "tens"]!;
      borrowingNote = `The ${aD[col === "ones" ? "o" : col === "tens" ? "t" : "h"]} is smaller than the ${bD[col === "ones" ? "o" : col === "tens" ? "t" : "h"]}, so we borrow 1 from the ${PLACE_NAMES[neighbor]} neighbor. Now the ${placeName} becomes ${top}.`;
      elliPrompt = `Look at the ${placeName} place — ${aD[col === "ones" ? "o" : col === "tens" ? "t" : "h"]} minus ${bot}. Hmm, can we do that? We need to borrow! After borrowing, it becomes ${top} minus ${bot}. What's that?`;
      hintIfWrong = `Remember we borrowed, so it's ${top} minus ${bot}. Count up from ${bot} to ${top} — how many steps?`;
    } else if (isLending) {
      elliPrompt = `The ${placeName} place lent 1 to help out, so now it's ${top} minus ${bot}. What do you get?`;
      hintIfWrong = `We lent 1, so we have ${top} left. ${top} minus ${bot} — what's that?`;
    } else if (bot === 0) {
      elliPrompt = `Look at the ${placeName} place — it's ${top} minus 0. Nothing to subtract! What's ${top} minus 0?`;
      hintIfWrong = `Subtracting zero doesn't change anything. ${top} minus 0 is still ${top}.`;
    } else {
      elliPrompt = `Now the ${placeName} place — what's ${top} minus ${bot}?`;
      hintIfWrong = `Count back ${bot} from ${top}. What do you land on?`;
    }

    return {
      column: col,
      topDigit: col === "ones" ? aD.o : col === "tens" ? aD.t : aD.h,
      bottomDigit: bot,
      effectiveTopDigit: top,
      effectiveBottomDigit: bot,
      correctAnswer: answer,
      requiresBorrowing: needsBorrow,
      isLending,
      elliPrompt,
      borrowingNote,
      hintIfWrong,
    };
  });
}

function buildAdditionSteps(a: number, b: number): PlaceValueStep[] {
  const aD = digits(a);
  const bD = digits(b);

  // Addition: left to right (hundreds → tens → ones)
  const cols: Array<"hundreds" | "tens" | "ones"> = ["hundreds", "tens", "ones"];

  return cols.map((col): PlaceValueStep => {
    const top = col === "hundreds" ? aD.h : col === "tens" ? aD.t : aD.o;
    const bot = col === "hundreds" ? bD.h : col === "tens" ? bD.t : bD.o;
    const answer = top + bot;
    const placeName = PLACE_NAMES[col];

    return {
      column: col,
      topDigit: top,
      bottomDigit: bot,
      effectiveTopDigit: top,
      effectiveBottomDigit: bot,
      correctAnswer: answer,
      requiresBorrowing: false,
      isLending: false,
      elliPrompt: `What's ${top} plus ${bot} in the ${placeName} place?`,
      borrowingNote: null,
      hintIfWrong: `Count up ${bot} from ${top}. What do you get?`,
    };
  });
}

// ─── Lesson plan builder ─────────────────────────────────────────────────────

function warmupStep(problem: HomeworkProblem, stepNumber: number): LessonStep {
  const op = problem.operation === "subtraction" ? "-" : "+";
  const answer =
    problem.operation === "subtraction"
      ? problem.operandA - problem.operandB
      : problem.operandA + problem.operandB;

  return {
    stepNumber,
    type: "warmup",
    canvasContent: `${problem.operandA} ${op} ${problem.operandB}`,
    elliPrompt: `Quick warm-up — what's ${problem.operandA} ${op === "-" ? "minus" : "plus"} ${problem.operandB}?`,
    correctAnswer: answer,
  };
}

function placeValueStep(problem: HomeworkProblem, stepNumber: number): LessonStep {
  const columnSteps =
    problem.operation === "subtraction"
      ? buildSubtractionSteps(problem.operandA, problem.operandB)
      : buildAdditionSteps(problem.operandA, problem.operandB);

  const hasBorrowing = columnSteps.some((s) => s.requiresBorrowing);
  const op = problem.operation === "subtraction" ? "minus" : "plus";

  return {
    stepNumber,
    type: "place_value",
    operandA: problem.operandA,
    operandB: problem.operandB,
    operation: problem.operation ?? "addition",
    columnSteps,
    problemLabel: problem.label,
    elliPrompt: hasBorrowing
      ? `Here's ${problem.operandA} ${op} ${problem.operandB}. This one needs borrowing — we'll go column by column starting from the ones place.`
      : `Here's ${problem.operandA} ${op} ${problem.operandB}. Let's go column by column.`,
  };
}

export function buildLessonPlan(hw: HomeworkAssignment): MathLessonPlan {
  const steps: LessonStep[] = [];
  let stepNumber = 1;

  const warmups = hw.problems.filter((p) => p.label?.toLowerCase().includes("warm"));
  const mainProblems = hw.problems.filter((p) => !p.label?.toLowerCase().includes("warm"));

  for (const p of warmups) {
    steps.push(warmupStep(p, stepNumber++));
  }

  for (const p of mainProblems) {
    if (p.type === "place_value") {
      steps.push(placeValueStep(p, stepNumber++));
    } else {
      steps.push(warmupStep(p, stepNumber++));
    }
  }

  const hasBorrowing = mainProblems.some(
    (p) =>
      p.operation === "subtraction" &&
      p.type === "place_value" &&
      buildSubtractionSteps(p.operandA, p.operandB).some((s) => s.requiresBorrowing),
  );

  const elliFocusNote = [
    `This is a ${hw.topic.replace(/_/g, " ")} session from ${hw.source ?? "homework"}.`,
    hasBorrowing
      ? `CRITICAL: These problems require borrowing (regrouping). Always start at the ONES column and work RIGHT TO LEFT. Never start at hundreds for subtraction.`
      : `Work LEFT TO RIGHT: hundreds → tens → ones.`,
    `For each column: ask the column question, wait for the answer, then update the canvas with revealedColumns before moving on.`,
    `If the child answers incorrectly: give the borrowingNote hint, then ask again once. If still wrong, give the answer and move on — never drill more than twice.`,
    `scaffoldLevel=full throughout. Ila needs labels and dividers.`,
    hw.notes ? `Teacher notes: ${hw.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    child: hw.child,
    generatedAt: new Date().toISOString(),
    source: hw.source ?? hw.id,
    steps,
    elliFocusNote,
  };
}

// ─── Lesson plan → Elli system prompt section ────────────────────────────────

export function lessonPlanToPrompt(plan: MathLessonPlan): string {
  const stepDescriptions = plan.steps
    .map((step) => {
      if (step.type === "warmup") {
        return `  Step ${step.stepNumber} [WARMUP]: Show canvas teaching mode "${step.canvasContent}". Ask: "${step.elliPrompt}" Expected answer: ${step.correctAnswer}.`;
      }

      if (step.type === "place_value" && step.columnSteps) {
        const op = step.operation === "subtraction" ? "minus" : "plus";
        const colLines = step.columnSteps
          .map((c, i) => {
            const revealedSoFar = step.columnSteps!.slice(0, i).map((x) => x.column);
            const borrowTag = c.requiresBorrowing ? " [BORROWING REQUIRED]" : c.isLending ? " [LENDING]" : "";
            return (
              `    Column ${i + 1} — ${c.column.toUpperCase()}${borrowTag}:\n` +
              `      showCanvas(place_value, ${step.operandA}${op === "minus" ? "−" : "+"}${step.operandB}, activeColumn=${c.column}, revealedColumns=[${revealedSoFar.join(",")}])\n` +
              `      Ask: "${c.elliPrompt}"\n` +
              `      Correct answer: ${c.correctAnswer}\n` +
              (c.borrowingNote ? `      If borrowing needed, explain: "${c.borrowingNote}"\n` : "") +
              `      If wrong: "${c.hintIfWrong}"`
            );
          })
          .join("\n");

        return `  Step ${step.stepNumber} [PLACE VALUE]: ${step.operandA} ${op} ${step.operandB}${step.problemLabel ? ` (${step.problemLabel})` : ""}\n${colLines}`;
      }

      return `  Step ${step.stepNumber}: ${step.type}`;
    })
    .join("\n\n");

  return `HOMEWORK OVERRIDE — ignore the standard curriculum today. This lesson plan takes priority.

${plan.elliFocusNote}

LESSON PLAN — execute these steps in order:

${stepDescriptions}

After all steps: celebrate warmly, tell the child how many problems they completed, and end the session.`.trim();
}
