import { describe, expect, it } from "vitest";
import {
  buildCurrentBoardSnapshot,
  buildCurrentBoardSnapshotContext,
  findCompanionTruthContradictions,
} from "./currentBoardSnapshot";

describe("CurrentBoardSnapshot", () => {
  it("tells Elli a node is still opening without claiming the activity is ready", () => {
    // Human catch: Elli announced Word Radar while Ila was still looking at the map.
    // Logs recorded a launch request, but the lab had not compared speech truth to runtime readiness.
    const opening = buildCurrentBoardSnapshot({
      childId: "ila", sessionId: "voice-1",
      state: { nodeId: "practice", phase: "opening", boardState: "activity_opening", activityTitle: "Word Radar" },
    });
    expect(buildCurrentBoardSnapshotContext(opening)).toContain("Do not say the activity is ready");
    const closed = buildCurrentBoardSnapshot({
      childId: "ila", sessionId: "voice-1",
      state: { phase: "closed", boardState: "map" },
    });
    expect(buildCurrentBoardSnapshotContext(closed)).toContain("The child is back on the map");
    expect(closed.activityId).toBeUndefined();
  });
  it("keeps child speech separate from the current board truth", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "spell-check",
        nodeId: "n-spell",
        activityId: "spell-check",
        phase: "spelling",
        currentWord: "above",
        itemIndex: 0,
        totalItems: 5,
        coins: 140,
      },
      allowedActivities: ["spell-check", "pronunciation", "mystery"],
    });

    expect(snapshot).toMatchObject({
      childId: "ila",
      sessionId: "voice-1",
      game: "spell-check",
      currentTarget: "above",
      targetIsSpeakable: true,
      answerVisibility: "visible",
      allowedActivities: ["spell-check", "pronunciation", "mystery"],
      coins: 140,
    });

    const context = buildCurrentBoardSnapshotContext(snapshot, {
      childSpeech: "what word is it?",
    });
    expect(context).toContain("[Internal live board state]");
    expect(context).toContain('Child speech: "what word is it?"');
    expect(context).toContain("Current game: spell-check");
    expect(context).not.toContain("above");
    expect(context).toContain("replayWord");
    expect(context).not.toContain("Word Radar");
  });

  it("gives Elli the AI-authored math activity and live challenge without exposing correctness", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "reina",
      sessionId: "voice-1",
      state: {
        game: "generated-baseline",
        activityId: "skip-count-glider",
        nodeId: "skip-count-glider",
        phase: "question",
        activityTitle: "Skyglider Skip-Count Run",
        learningFocus: "skip-counting by 2s, 5s, and 10s",
        mechanic: "tap the lantern that continues the count",
        currentChallenge: "Skip count by 5s: 5, 10, 15, __?",
        availableActions: ["20", "16", "25"],
        itemIndex: 0,
        totalItems: 3,
        answerVisibility: "hidden",
      },
    });

    expect(snapshot).toMatchObject({
      activityTitle: "Skyglider Skip-Count Run",
      learningFocus: "skip-counting by 2s, 5s, and 10s",
      mechanic: "tap the lantern that continues the count",
      currentChallenge: "Skip count by 5s: 5, 10, 15, __?",
      availableActions: ["20", "16", "25"],
    });
    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("Activity title: Skyglider Skip-Count Run");
    expect(context).toContain("Learning focus: skip-counting by 2s, 5s, and 10s");
    expect(context).toContain("Current challenge: Skip count by 5s: 5, 10, 15, __?");
    expect(context).toContain("Available child actions: 20 | 16 | 25");
    expect(context).not.toContain("Correct answer");
  });

  it("extracts the exact visible prompt from an object-shaped generated challenge", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "reina",
      sessionId: "voice-1",
      state: {
        game: "generated-math",
        activityId: "N1",
        nodeId: "N1",
        phase: "question",
        currentChallenge: {
          id: "N1-I1",
          prompt: "Which rectangle is cut into 3 equal parts?",
          mode: "selection",
          readAloudRequested: true,
        },
        availableActions: ["tap_rectangle_A", "tap_rectangle_B"],
        answerVisibility: "hidden",
      },
    });

    expect(snapshot.currentChallenge).toBe(
      "Which rectangle is cut into 3 equal parts?",
    );
    expect(buildCurrentBoardSnapshotContext(snapshot)).toContain(
      "Current challenge: Which rectangle is cut into 3 equal parts?",
    );
  });

  it("does not expose hidden Wheel answers to Elli", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "Wheel of Fortune",
        phase: "picking",
        currentWord: "above",
        boardState: "_ B _ _ E",
        itemIndex: 2,
        totalItems: 5,
      },
    });

    expect(snapshot.answerVisibility).toBe("hidden");
    expect(snapshot.currentTarget).toBeUndefined();
    expect(snapshot.targetIsSpeakable).toBe(false);

    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("Answer visibility: hidden");
    expect(context).toContain("Board: _ B _ _ E");
    expect(context).not.toContain("above");
  });

  it("ignores raw and unknown fields while preserving exact reward fields", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "pronunciation",
        currentWord: "ahead",
        score: 20,
        coinsEarned: 5,
        inventedTotal: 12000,
        apiKey: "secret",
        rawAudio: "base64",
      },
    });

    const serialized = JSON.stringify(snapshot);
    expect(snapshot.score).toBe(20);
    expect(snapshot.coinsEarned).toBe(5);
    expect(serialized).not.toContain("12000");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("base64");
  });

  it("detects companion claims that contradict the current truth packet", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "word-radar",
        activityId: "word-radar",
        phase: "complete",
        accuracy: 0.57,
        evidenceTier: "practice",
        masteryEligible: false,
        questState: "locked",
        bossState: "locked",
      },
    });

    const contradictions = findCompanionTruthContradictions(
      "You crushed Word Radar with 100% accuracy and the boss level is unlocked.",
      snapshot,
    );

    expect(contradictions).toContain("mastery_claim_contradicts_activity_result");
    expect(contradictions).toContain("boss_unlock_claim_contradicts_board_state");
  });
});

// The UI supplied these facts, but the projection discarded them. The lab
// tested screen and prompt separately rather than the complete handoff.
it("preserves displayed loading facts through projection into Elli context", () => {
  const snapshot = buildCurrentBoardSnapshot({ childId: "sandbox", sessionId: "loading",
    state: { game: "adventure-preparation", phase: "build", ready: 2, total: 5,
      elapsedLabel: "3 min so far", remainingTimeKnown: false,
      screenText: ["Building your activities", "2 of 5 map activities ready."] } });
  const context = buildCurrentBoardSnapshotContext(snapshot);
  expect(context).toContain("2 of 5 map activities ready.");
  expect(context).toContain("3 min so far");
  expect(context).toContain("Remaining time is not known");
  const next = buildCurrentBoardSnapshot({childId:"sandbox",sessionId:"loading",state:{phase:"closed",boardState:"map"}});
  expect(buildCurrentBoardSnapshotContext(next)).not.toContain("3 min so far");
});

// October 18 human catch: the model coached room words ("Tuscaloosa") while
// the game still targeted "title". Hidden text was mistaken for absent truth.
// Existing labs covered Wheel secrecy, not spelling's audio-vs-written boundary.
describe("spelling pronunciation context", () => {
  const snapshot = (state: Record<string, unknown>) => buildCurrentBoardSnapshot({
    childId: "lab-child", sessionId: "lab-session", state,
  });

  it("retains hidden spelling truth internally without permitting written-answer disclosure", () => {
    const value = snapshot({ game: "word-radar", itemId: "item-title", currentTarget: "title", answerVisibility: "hidden", assessmentMode: true });
    expect(value).toHaveProperty("spellingTarget", "title");
    expect(value.currentTarget).toBeUndefined();
    expect(value.targetIsSpeakable).toBe(false);
    const context = buildCurrentBoardSnapshotContext(value, { childSpeech: "Help with Tuscaloosa" });
    expect(context).not.toContain("title");
    expect(context).toContain("replayWord");
    expect(context).toContain("replayWord");
    expect(context).toContain("Do not model syllables or reveal written letters during hidden assessment");
    expect(context).not.toContain("ARPABET");
  });

  it.each([
    ["myself", "M AY2 S EH1 L F", 2],
    ["tonight", "T AH0 N AY1 T", 2],
    ["dissatisfied", "D IH0 S AE1 T AH0 S F AY2 D", 4],
  ])("grounds permitted modeling of %s in dictionary sounds and vowel nuclei", (word, phones, count) => {
    const context = buildCurrentBoardSnapshotContext(snapshot({ game: "monster-stampede", currentWord: word, answerVisibility: "visible" }));
    expect(context).toContain(`ARPABET: ${phones}`);
    expect(context).toContain(`Syllable count: ${count}`);
    expect(context).toContain("Elli chooses the demonstration, pacing and explanation");
    expect(context).not.toContain("Model the whole word, then");
    expect(context).toContain("Do not pronounce silent spelling letters as separate sounds");
    expect(context).toContain("Do not grade the child's pronunciation from transcript text");
  });

  it("does not turn explicit assessment into teaching just because text is visible", () => {
    const context = buildCurrentBoardSnapshotContext(snapshot({ game: "word-radar", currentTarget: "tonight", answerVisibility: "visible", assessmentMode: true }));
    expect(context).toContain("replayWord");
    expect(context).not.toContain("ARPABET");
  });

  it("does not invent a pronunciation reference for an unknown word", () => {
    const context = buildCurrentBoardSnapshotContext(snapshot({ game: "spell-check", currentTarget: "zzzxqnotaword", answerVisibility: "visible" }));
    expect(context).toContain("Pronunciation reference unavailable");
    expect(context).not.toContain("Syllable count:");
  });

  it("does not disclose hidden Wheel or math answers through spelling support", () => {
    for (const game of ["Wheel of Fortune", "generated-math"]) {
      const value = snapshot({ game, currentWord: "secret-answer", answerVisibility: "hidden" });
      expect(value).not.toHaveProperty("spellingTarget");
      expect(buildCurrentBoardSnapshotContext(value)).not.toContain("secret-answer");
    }
  });
});

// Review catch: default-visible UI normalization was incorrectly used as teaching
// permission. Earlier labs covered explicit assessment, not absent/unknown facts.
describe("spelling teaching permission", () => {
  it.each([
    { answerVisibility: "unknown" },
    {},
    { answerVisibility: "visible", evidenceTier: "mastery_candidate" },
    { answerVisibility: "hidden", practiceCapture: true },
  ])("requires explicit teaching permission for %j", (permission) => {
    const snapshot = buildCurrentBoardSnapshot({ childId: "lab-child", sessionId: "permission",
      state: { game: "letter-rush", currentWord: "tonight", ...permission } });
    expect(snapshot.spellingSupportMode).toBe("stimulus_only");
    expect(buildCurrentBoardSnapshotContext(snapshot)).not.toContain("ARPABET");
  });
  it.each(["visible", "revealed"])("permits explicit %s practice", (answerVisibility) => {
    const snapshot = buildCurrentBoardSnapshot({ childId: "lab-child", sessionId: "permission",
      state: { game: "letter-rush", currentWord: "tonight", answerVisibility } });
    expect(snapshot.spellingSupportMode).toBe("pronunciation_model");
  });
});

// Review catch: the recorded "n-i-g-h-t" disclosure was audible to the human,
// but earlier labs checked input context without checking response truth.
describe("hidden spelling disclosure truth checks", () => {
  const snapshot = (answerVisibility = "hidden") => buildCurrentBoardSnapshot({
    childId: "lab-child", sessionId: "disclosure", state: {
      game: "letter-rush", currentWord: "tonight", answerVisibility,
    },
  });
  it.each([
    "Spell T-O-N-I-G-H-T.",
    "You already have n-i-g-h-t in your head.",
    "Try t o n i g h t.",
    "The letters are t, o, n, i, g, h, t.",
  ])("flags protected target letter sequences: %s", (response) => {
    expect(findCompanionTruthContradictions(response, snapshot()))
      .toContain("hidden_spelling_letters_disclosed");
  });
  it.each([
    "The word is tonight. Listen once more: tonight.",
    "Try c-a-t.",
    "I can repeat the word for you.",
  ])("does not confuse whole stimuli or unrelated letters with target disclosure: %s", (response) => {
    expect(findCompanionTruthContradictions(response, snapshot())).toEqual([]);
  });
  it("allows letter sequences during explicitly visible teaching", () => {
    expect(findCompanionTruthContradictions("T-O-N-I-G-H-T", snapshot("visible"))).toEqual([]);
  });
});

// Human catch: prompt-only restrictions still let Elli chunk the private word.
// Keep runtime truth, but expose a replay capability instead of the stimulus.
it.each(["hidden", "unknown", undefined, "visible"])("does not leak protected spelling through context aliases (%s)", answerVisibility => {
 const snapshot=buildCurrentBoardSnapshot({childId:"lab-child",sessionId:"s",state:{
  game:"word-radar",assessmentMode:true,answerVisibility,currentWord:"dissatisfied",
  currentChallenge:"Spell dissatisfied",activityTitle:"Practice dissatisfied",lastOutcomeWord:"dissatisfied",
  availableActions:["Hear dissatisfied"],missedWords:["dissatisfied"],correctWords:["dissatisfied"],
 }});
 expect(snapshot.spellingTarget).toBe("dissatisfied");
 const context=buildCurrentBoardSnapshotContext(snapshot);
 expect(context.toLowerCase()).not.toContain("dissatisfied");
 expect(context).toContain("replayWord");
});

it.each([
 ["instruction", "baseline", true], ["practice", "mystery", true], ["practice", "quest", false],
 ["practice", "boss", false], ["practice", "evaluation", false], ["fresh_checkpoint", "baseline", false],
 [undefined, "baseline", undefined],
])("derives frozen teaching role %s in %s without browser pedagogy",async(role,nodeRole,expected)=>{
 const {canonicalSpellingPractice}=await import("./currentBoardSnapshot");
 const cycle:any={domain:"spelling",nodes:[{nodeId:"n",role:nodeRole,evidenceContract:{spellingItems:{i:{lineage:role?{measurementRole:role}:undefined}}}}]};
 const launch={nodeId:"n",launchId:"launch",launchToken:"token"};const bound={nodeId:"n",itemId:"i",launchId:"launch"};const state={nodeId:"n",itemId:"i",launchToken:"token"};
 expect(canonicalSpellingPractice(cycle,launch,bound,state)).toBe(expected);
 expect(canonicalSpellingPractice(cycle,launch,{...bound,launchId:"old"},state)).toBe(expected===false ? false : undefined);
 expect(canonicalSpellingPractice(cycle,launch,bound,{...state,itemId:"other"})).toBe(["evaluation","quest","boss"].includes(nodeRole as string) ? false : undefined);
 expect(canonicalSpellingPractice(cycle,launch,bound,{...state,launchToken:"old"})).toBe(expected===false ? false : undefined);
});

it('retains partial spelling identity only with an active server binding, never a different game',async()=>{
 const {retainSpellingItemState}=await import('./currentBoardSnapshot');
 const previous:any={itemId:'i',nodeId:'n',launchToken:'l',itemIndex:0,phase:'response',game:'word-radar'};
 const state={nodeId:'n',launchToken:'l',itemIndex:0,game:'word-radar'};
 const bound={itemId:'i',launchId:'bound'};const launch={launchId:'bound'};
 expect(retainSpellingItemState(state,previous,bound,launch)).toMatchObject({itemId:'i',phase:'response'});
 expect(retainSpellingItemState(state,previous,undefined,launch)).toBe(state);
 expect(retainSpellingItemState(state,previous,bound,{launchId:'other'})).toBe(state);
 const changed={...state,game:'different'};
 expect(retainSpellingItemState(changed,previous,bound,launch)).toBe(changed);
});
