import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { generateObject } from "ai";
import {
  buildTodaysPlan,
  psychologistStructuredOutputSchema,
  assertTodaysPlanInvariants,
  todaysPlanActivitySchema,
} from "../agents/psychologist/today-plan";
import {
  readNatalieContext,
  buildPsychologistContext,
} from "../agents/psychologist/natalie-context";
import { appendDeferredActivity } from "../utils/appendToContext";
import { createSixTools, type SixToolsHost } from "../agents/tools/six-tools";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

const NATALIE_FIXTURE = path.join(
  process.cwd(),
  "src/context/ila/natalie/_vitest_slp_note.md",
);

describe("clinical plan — psychologist output shape", () => {
  it("parses todaysPlan activities with required and optional fields", () => {
    const raw = {
      todaysPlan: [
        {
          activity: "Compound word probe",
          priority: 1,
          required: true,
          reason: "Stalling on railroad",
          timeboxMinutes: 10,
          method: "Break into syllables (Natalie)",
          source: "natalie/2026-03-18.md",
          words: ["railroad", "cowboy"],
          probeSequence: ["say", "segment", "spell"],
        },
        {
          activity: "Reward game",
          priority: 2,
          required: false,
          reason: "Motivation",
          timeboxMinutes: 5,
          skipConditions: ["fatigue"],
          minimumWords: 3,
        },
      ],
      childProfile: "Curious; needs visual anchors.",
      stopAfter: "After one solid compound success or 25 minutes.",
      rewardPolicy: "Game only after 3 correct written attempts.",
    };
    const parsed = psychologistStructuredOutputSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Array.isArray(parsed.data.todaysPlan)).toBe(true);
      for (const a of parsed.data.todaysPlan) {
        const one = todaysPlanActivitySchema.safeParse(a);
        expect(one.success).toBe(true);
      }
    }
  });
});

describe("buildTodaysPlan — child-agnostic path", () => {
  const prevStateless = process.env.SUNNY_STATELESS;

  const mockObject = {
    todaysPlan: [
      {
        activity: "Core work",
        priority: 1,
        required: true,
        reason: "Priority target",
        timeboxMinutes: 10,
      },
      {
        activity: "Optional stretch",
        priority: 2,
        required: false,
        reason: "If energy allows",
        timeboxMinutes: 5,
        skipConditions: ["low energy"],
      },
    ],
    childProfile: "Engaged with short bursts.",
    stopAfter: "Natural closing cue from child.",
    rewardPolicy: "Games after completed block.",
  };

  beforeEach(() => {
    process.env.SUNNY_STATELESS = "true";
    vi.mocked(generateObject).mockResolvedValue({
      object: mockObject,
    } as Awaited<ReturnType<typeof generateObject>>);
  });

  afterEach(() => {
    if (prevStateless === undefined) delete process.env.SUNNY_STATELESS;
    else process.env.SUNNY_STATELESS = prevStateless;
  });

  it('buildTodaysPlan("Ila") and buildTodaysPlan("Reina") return valid plans via same pipeline', async () => {
    const ilaPlan = await buildTodaysPlan("Ila");
    const reinaPlan = await buildTodaysPlan("Reina");
    expect(psychologistStructuredOutputSchema.safeParse(ilaPlan).success).toBe(
      true,
    );
    expect(
      psychologistStructuredOutputSchema.safeParse(reinaPlan).success,
    ).toBe(true);
    expect(ilaPlan.todaysPlan.length).toBeGreaterThan(0);
    expect(reinaPlan.todaysPlan.length).toBeGreaterThan(0);
    expect(vi.mocked(generateObject).mock.calls.length).toBe(2);
  });
});

describe("Natalie context + buildPsychologistContext", () => {
  beforeAll(() => {
    fs.mkdirSync(path.dirname(NATALIE_FIXTURE), { recursive: true });
    fs.writeFileSync(
      NATALIE_FIXTURE,
      "## Session\n- Used compound breakdown successfully.\n",
      "utf-8",
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(NATALIE_FIXTURE, { force: true });
    } catch {
      /* ignore */
    }
  });

  it('readNatalieContext("ila") returns markdown when natalie .md files exist', () => {
    const s = readNatalieContext("ila");
    expect(s).toBeTruthy();
    expect(s!).toContain("Clinical Sessions (Licensed SLP)");
  });

  it('buildPsychologistContext("ila") includes Clinical Sessions when natalie notes exist', () => {
    const ctx = buildPsychologistContext("ila");
    expect(ctx).toContain("Clinical Sessions (Licensed SLP)");
  });

  it('buildPsychologistContext("reina") includes Clinical Sessions iff natalie .md exists', () => {
    const ctx = buildPsychologistContext("reina");
    const nat = readNatalieContext("reina");
    if (nat) {
      expect(ctx).toContain("Clinical Sessions (Licensed SLP)");
    } else {
      expect(ctx).not.toContain("Clinical Sessions (Licensed SLP)");
    }
  });
});

describe("todaysPlan invariants", () => {
  it("requires at least one required activity", () => {
    expect(() =>
      assertTodaysPlanInvariants([
        {
          activity: "x",
          priority: 1,
          required: false,
          reason: "r",
          timeboxMinutes: 1,
        },
      ]),
    ).toThrow();
  });

  it("forbids skipConditions on required activities", () => {
    expect(() =>
      assertTodaysPlanInvariants([
        {
          activity: "x",
          priority: 1,
          required: true,
          reason: "r",
          timeboxMinutes: 1,
          skipConditions: ["tired"],
        },
      ]),
    ).toThrow();
  });

  it("allows skipConditions only when required is false", () => {
    expect(() =>
      assertTodaysPlanInvariants([
        {
          activity: "core",
          priority: 1,
          required: true,
          reason: "r",
          timeboxMinutes: 5,
        },
        {
          activity: "extra",
          priority: 2,
          required: false,
          reason: "r2",
          timeboxMinutes: 3,
          skipConditions: ["fatigue"],
        },
      ]),
    ).not.toThrow();
  });
});

describe("sessionLog skipped → deferred context line", () => {
  it("appendDeferredActivity writes Deferred Activities block", async () => {
    const tmp = path.join(os.tmpdir(), `deferred-${Date.now()}.md`);
    fs.writeFileSync(tmp, "# Test context\n", "utf-8");
    await appendDeferredActivity(
      "Ila",
      "Spelling ladder",
      "Child asked to stop",
      tmp,
    );
    const body = fs.readFileSync(tmp, "utf-8");
    expect(body).toContain("## Deferred Activities");
    expect(body).toContain("Spelling ladder deferred");
    expect(body).toContain("reason: Child asked to stop");
    expect(body).toContain("reschedule: next session");
    fs.rmSync(tmp, { force: true });
  });

  it("sessionLog tool accepts skipped and forwards to host", async () => {
    const host: SixToolsHost = {
      canvasShow: vi.fn(async () => ({})),
      canvasClear: vi.fn(async () => ({})),
      canvasStatus: vi.fn(async () => ({})),
      sessionLog: vi.fn(async () => ({
        logged: true,
        deferred: true,
      })),
      sessionStatus: vi.fn(async () => ({})),
      sessionEnd: vi.fn(async () => ({})),
      expressCompanion: vi.fn(async () => ({ ok: true })),
    };
    const tools = createSixTools(host);
    const exec = tools.sessionLog.execute;
    expect(exec).toBeDefined();
    const out = await exec!(
      {
        skipped: true,
        reason: "Overwhelmed",
        activity: "Word sort",
      },
      { toolCallId: "test", messages: [] },
    );
    expect(host.sessionLog).toHaveBeenCalled();
    expect(out).toMatchObject({ logged: true, deferred: true });
  });
});
