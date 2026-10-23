import {successorResumeAction} from './learningBoardInstances';
import {createHash} from 'node:crypto';
import { adventureBoardDefinitionSchema } from '../shared/adventureBoardDefinition';
import { authoredJourney, choiceJourneyFixture, linearJourneyFixture } from '../scripts/fixtures/authoredJourney';
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertPublishedBoardsImmutable,
  boardTopologyHash,
  isPublishedArtifactNode,
  listBoardInstances,
  publishBoardInstance,
} from "./learningBoardInstances";
import {
  createLearningCycle,
  getLearningCycle,
  projectLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "./learningCycleRepository";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-board-instances-"));
}

function node(nodeId: string, overrides: Partial<LearningCycleNodeContract> = {}): LearningCycleNodeContract {
  return {
    nodeId,
    role: "baseline",
    title: nodeId,
    state: "ready",
    academicTarget: { domain: "math", skill: "equal_groups", targets: ["5x2"] },
    algorithmOwner: "retrieval-practice",
    theoryId: "theory-1",
    experimentId: `experiment-${nodeId}`,
    mechanic: "sort",
    theme: "space",
    openingScreen: { title: nodeId, purpose: "Practice." },
    generationPrompt: null,
    artifactBinding: null,
    artwork: { status: "pending", localPath: null, prompt: null },
    sfxContract: [],
    companionContract: { events: [] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
    ...overrides,
  };
}

const binding = {
  contentId: "content-1",
  artifactId: "artifact-1",
  localArtifactPath: "/generated/a.html",
  localArtworkPath: "/generated/a.jpeg",
  contractFingerprint: "fp-1",
  validationStatus: "passed" as const,
};

function cycleInput(withBoard: boolean): CreateLearningCycleInput {
  const nodes = [
    node("shared-entry"),
    node("route-a", { routeId: "route-a", state: "locked" }),
    node("route-b", { routeId: "route-b", state: "locked" }),
    node("checkpoint", { state: "locked" }),
  ];
  const agencyExperiment = {
    experimentId: "agency-1",
    sharedNodeIds: ["shared-entry"],
    routes: [
      { routeId: "route-a", nodeIds: ["route-a", "checkpoint"] },
      { routeId: "route-b", nodeIds: ["route-b", "checkpoint"] },
    ],
  };
  const base: CreateLearningCycleInput = {
    childId: "boardkid",
    homeworkId: "hw-boards",
    domain: "math",
    assignment: { title: "Equal groups", contentFingerprint: "fp", capturedEvidenceIds: ["assignment:1"], targets: ["5x2"] },
    academicTheory: {
      theoryId: "theory-1", revision: 1, hypothesis: "h", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [],
    },
    engagementTheory: null,
    nodes,
    agencyExperiment,
  };
  if (!withBoard) return base;
  const draft = { ...base, boards: [] } as unknown as LearningCycleRecordV2;
  const board = publishBoardInstance(draft, {
    kind: "teaching",
    predecessorBoardId: "hw-boards:board:0",
    plannerDecisionId: "hw-boards:decision:r4",
    evidenceIds: ["obs-1"],
    nodeIds: nodes.map((candidate) => candidate.nodeId),
    agencyExperiment,
    publishedAt: "2026-10-01T12:00:00.000Z",
  });
  return { ...base, boards: [board] };
}

function published(): LearningCycleRecordV2 {
  return createLearningCycle(cycleInput(true), { rootDir: root(), now: new Date("2026-10-01T12:00:00.000Z") });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("immutable board instances (contract 21, test 1)", () => {
  it("publishes a unique board identity linked to its decision, predecessor and evidence", () => {
    const cycle = published();
    const [board] = listBoardInstances(cycle);
    expect(board).toMatchObject({
      boardId: "hw-boards:board:1",
      kind: "teaching",
      predecessorBoardId: "hw-boards:board:0",
      plannerDecisionId: "hw-boards:decision:r4",
      evidenceIds: ["obs-1"],
      nodeIds: ["shared-entry", "route-a", "route-b", "checkpoint"],
      publishedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(board!.topologyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(boardTopologyHash(cycle, board!)).toBe(board!.topologyHash);
  });

  it("keeps the topology hash stable across forward runtime state, artifact binding, artwork and evidence", () => {
    const cycle = published();
    const [board] = listBoardInstances(cycle);
    const advanced = structuredClone(cycle);
    advanced.nodes[0]!.state = "completed";
    advanced.nodes[0]!.artifactBinding = binding;
    advanced.nodes[0]!.artwork = { status: "ready", localPath: "/generated/a.jpeg", prompt: null };
    advanced.nodes[0]!.evidenceIds = ["obs-2"];
    expect(boardTopologyHash(advanced, board!)).toBe(board!.topologyHash);
    expect(() => assertPublishedBoardsImmutable(cycle, advanced)).not.toThrow();
  });

  it.each([
    ["repurposed title", (next: LearningCycleRecordV2) => { next.nodes[1]!.title = "New Name"; next.nodes[1]!.openingScreen.title = "New Name"; }],
    ["repurposed mechanic", (next: LearningCycleRecordV2) => { next.nodes[1]!.mechanic = "race"; }],
    ["replaced item contract", (next: LearningCycleRecordV2) => { next.nodes[3]!.academicTarget.targets = ["5x9"]; }],
    ["rewired route choice", (next: LearningCycleRecordV2) => { next.agencyExperiment!.routes[1]!.nodeIds = ["route-b"]; }],
  ])("rejects a %s on a published board", (_label, mutate) => {
    const cycle = published();
    const next = structuredClone(cycle);
    mutate(next);
    expect(() => assertPublishedBoardsImmutable(cycle, next)).toThrow("learning_board_topology_changed");
  });

  it("rejects appending a node that no published board owns", () => {
    const cycle = published();
    const next = structuredClone(cycle);
    next.nodes.push(node("appended-support"));
    expect(() => assertPublishedBoardsImmutable(cycle, next)).toThrow("learning_board_node_unowned:appended-support");
  });

  it("rejects removing a node or a board instance", () => {
    const cycle = published();
    const withoutNode = structuredClone(cycle);
    withoutNode.nodes = withoutNode.nodes.filter((candidate) => candidate.nodeId !== "route-b");
    expect(() => assertPublishedBoardsImmutable(cycle, withoutNode)).toThrow("learning_board_topology_changed");
    const withoutBoard = structuredClone(cycle);
    withoutBoard.boards = [];
    expect(() => assertPublishedBoardsImmutable(cycle, withoutBoard)).toThrow("learning_board_removed:hw-boards:board:1");
  });

  it("rejects relocking a completed node or returning a playable node to generating", () => {
    const cycle = published();
    const completed = structuredClone(cycle);
    completed.nodes[0]!.state = "completed";
    const relocked = structuredClone(completed);
    relocked.nodes[0]!.state = "locked";
    expect(() => assertPublishedBoardsImmutable(completed, relocked)).toThrow("learning_board_state_regressed:shared-entry");
    const regenerating = structuredClone(cycle);
    regenerating.nodes[0]!.state = "generating";
    expect(() => assertPublishedBoardsImmutable(cycle, regenerating)).toThrow("learning_board_state_regressed:shared-entry");
  });

  it("treats route navigation inside the frozen choice as navigation, not relock", () => {
    const cycle = published();
    const next = structuredClone(cycle);
    next.nodes[1]!.state = "ready";
    const back = structuredClone(next);
    back.nodes[1]!.state = "locked";
    expect(() => assertPublishedBoardsImmutable(next, back)).not.toThrow();
  });

  it("writes an artifact binding once and only allows retirement, never rebinding", () => {
    const cycle = published();
    const bound = structuredClone(cycle);
    bound.nodes[0]!.artifactBinding = binding;
    expect(() => assertPublishedBoardsImmutable(cycle, bound)).not.toThrow();
    const rebound = structuredClone(bound);
    rebound.nodes[0]!.artifactBinding = { ...binding, artifactId: "artifact-2" };
    expect(() => assertPublishedBoardsImmutable(bound, rebound)).toThrow("learning_board_artifact_rebound:shared-entry");
    const retired = structuredClone(bound);
    retired.nodes[0]!.artifactBinding = null;
    retired.nodes[0]!.state = "blocked";
    expect(() => assertPublishedBoardsImmutable(bound, retired)).not.toThrow();
    const reboundAfterRetirement = structuredClone(retired);
    reboundAfterRetirement.nodes[0]!.artifactBinding = { ...binding, artifactId: "artifact-after-retirement" };
    reboundAfterRetirement.nodes[0]!.state = "ready";
    expect(() => assertPublishedBoardsImmutable(retired, reboundAfterRetirement))
      .toThrow("learning_board_artifact_rebound:shared-entry");
    const clearedButPlayable = structuredClone(bound);
    clearedButPlayable.nodes[0]!.artifactBinding = null;
    expect(() => assertPublishedBoardsImmutable(bound, clearedButPlayable)).toThrow("learning_board_artifact_rebound:shared-entry");
  });

  it("allows refreshing verification proof for the same artifact bytes but never new bytes", () => {
    const cycle = published();
    const bound = structuredClone(cycle);
    bound.nodes[0]!.artifactBinding = { ...binding, creativeProvenance: { rationale: "r", qualityPrediction: "q", creatorPromptHash: "c", artworkPromptHash: "a", generatedHtmlHash: "html-1" } };
    const reverified = structuredClone(bound);
    reverified.nodes[0]!.artifactBinding!.validationProof = { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: ["new.png"], htmlHash: "html-1", verifierVersion: 9 };
    expect(() => assertPublishedBoardsImmutable(bound, reverified)).not.toThrow();
    const repaired = structuredClone(bound);
    repaired.nodes[0]!.artifactBinding!.creativeProvenance!.generatedHtmlHash = "html-2";
    expect(() => assertPublishedBoardsImmutable(bound, repaired)).toThrow("learning_board_artifact_rebound:shared-entry");
    expect(isPublishedArtifactNode(bound, "shared-entry")).toBe(true);
    expect(isPublishedArtifactNode(cycle, "shared-entry")).toBe(false);
  });

  it("enforces immutability on every canonical transition of a cycle with published boards", () => {
    const rootDir = root();
    const cycle = createLearningCycle(cycleInput(true), { rootDir });
    expect(() => transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "plan_reconciled",
      assignment: cycle.assignment,
      academicTheory: cycle.academicTheory,
      engagementTheory: null,
      nodes: [...cycle.nodes, node("reconciled-extra")],
      reason: "re-ingestion attempted to append a node",
    }, { rootDir })).toThrow("learning_board_node_unowned:reconciled-extra");
    expect(getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })).toEqual(cycle);
  });

  it("rejects a board that claims an already-owned node or an unknown node", () => {
    const cycle = published();
    const successor = {
      kind: "successor" as const,
      predecessorBoardId: "hw-boards:board:1",
      plannerDecisionId: "hw-boards:decision:r9",
      evidenceIds: ["obs-1"],
      publishedAt: "2026-10-02T12:00:00.000Z",
    };
    expect(() => publishBoardInstance(cycle, { ...successor, nodeIds: ["checkpoint"] }))
      .toThrow("learning_board_node_already_owned:checkpoint");
    expect(() => publishBoardInstance(cycle, { ...successor, nodeIds: ["missing"] }))
      .toThrow("learning_board_node_missing:missing");
  });
});

describe("legacy board readability (test 16)", () => {
  it("keeps a historical cycle readable without reconstructing a missing presentation", () => {
    const rootDir = root();
    const legacy = createLearningCycle(cycleInput(false), { rootDir, now: new Date("2026-07-01T00:00:00.000Z") });
    const file = path.join(rootDir, "src/context/boardkid/homework/cycles/hw-boards.json");
    const before = fs.readFileSync(file, "utf8");
    const reread = getLearningCycle("boardkid", "hw-boards", { rootDir })!;

    expect(reread.boards).toBeUndefined();
    expect(listBoardInstances(reread)).toEqual([expect.objectContaining({
      boardId: "cycle-board:hw-boards",
      kind: "legacy",
      predecessorBoardId: null,
      plannerDecisionId: null,
      nodeIds: legacy.nodes.map((candidate) => candidate.nodeId),
      publishedAt: "2026-07-01T00:00:00.000Z",
    })]);
    expect(() => projectLearningCycle(reread)).toThrow("board_definition_missing");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("does not retroactively enforce contract-21 immutability on legacy cycles", () => {
    const legacy = createLearningCycle(cycleInput(false), { rootDir: root() });
    const next = structuredClone(legacy);
    next.nodes.push(node("legacy-append"));
    expect(() => assertPublishedBoardsImmutable(legacy, next)).not.toThrow();
  });
});

describe("board instance functions are pure (test 17)", () => {
  it("never mutates the cycle or writes files", () => {
    const rootDir = root();
    const cycle = deepFreeze(createLearningCycle(cycleInput(true), { rootDir }));
    const filesBefore = fs.readdirSync(rootDir, { recursive: true }).sort();
    const [board] = listBoardInstances(cycle);
    boardTopologyHash(cycle, board!);
    assertPublishedBoardsImmutable(cycle, cycle);
    expect(fs.readdirSync(rootDir, { recursive: true }).sort()).toEqual(filesBefore);
  });
});


describe("authored board definition persistence", () => {
  it("rejects whitespace identities rather than mutating authored meaning during validation", () => {
    const definition = authoredJourney(); definition.rootPathId += " ";
    expect(() => adventureBoardDefinitionSchema.parse(definition)).toThrow();
  });
  it("freezes and hashes composition, portals, and shared-activity paths without reinterpretation", () => {
    const directory = root();
    const input = cycleInput(false);
    input.nodes = [node("learn"),node("play"),node("check")];
    delete input.agencyExperiment;
    const cycle = createLearningCycle(input, {rootDir:directory});
    const definition = authoredJourney();
    const board = publishBoardInstance(cycle, {kind:"teaching",predecessorBoardId:null,plannerDecisionId:"decision",evidenceIds:[],nodeIds:["learn","play","check"],publishedAt:cycle.createdAt,definition} as any);
    expect((board as any).definition).toEqual(definition);
    const changed = structuredClone(board) as any;
    changed.definition.portals[0].position.landscape.x = .27;
    expect(boardTopologyHash(cycle,changed)).not.toBe(boardTopologyHash(cycle,board));
    const projected = projectLearningCycle({...cycle,boards:[board]});
    expect(projected.adventureBoard.nodes.map(portal => portal.label)).toEqual(definition.portals.map(portal => portal.label));
    expect(projected.adventureBoard.nodes.map(portal => portal.position)).toEqual(definition.portals.map(portal => portal.position.landscape));
    expect(projected.adventureBoard.choiceSets?.[0].options.map(option => option.label)).toEqual(['Learn first','Play first']);
  });
});

// Regression: one authored journey governs canonical choice, rendering and completion.
describe('canonical authored navigation', () => {
  function setup(kind: 'teaching'|'probe'|'quest' = 'teaching') {
    const input = cycleInput(false);
    input.initialLifecycle = kind==='probe' ? 'evaluation_ready' : kind==='quest' ? 'quest_ready' : 'baseline_ready'; delete input.agencyExperiment;
    input.nodes = ['check','play','learn'].map(id => node(id,{role:kind==='probe'?'evaluation':kind==='quest'&&id==='play'?'quest':'baseline',artifactBinding:{...binding,contentId:id,artifactId:id}}));
    const definition = authoredJourney();
    const board = publishBoardInstance({...input,boards:[]} as unknown as LearningCycleRecordV2, {kind:kind==='probe'?'probe':'teaching',definition,predecessorBoardId:null,plannerDecisionId:'decision',evidenceIds:[],nodeIds:input.nodes.map(n=>n.nodeId),publishedAt:'2026-10-09T00:00:00Z'});
    const opts = {rootDir:root()};
    let cycle = createLearningCycle({...input,boards:[board]},opts);
    const choose = (optionId:string) => cycle = transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'journey_choice_selected',choiceId:'order',optionId,choiceEventId:`choice-${optionId}-${cycle.revision}`} as never,opts);
    const complete = (nodeId:string) => cycle = transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'instrument_observed',nodeId,completed:true,observations:[],academicEvidence:[{evidenceId:`done-${nodeId}`,summary:'synthetic'}],engagementEvidence:[],companionObservations:[]},opts);
    return {choose,complete,get:()=>cycle};
  }
  it('waits at the fork, follows play first, persists switching and completes only the selected chapter', () => {
    const run=setup();
    expect(projectLearningCycle(run.get()).adventureBoard.progress?.activeChoiceSetId).toBe('order');
    expect(() => run.complete('learn')).toThrow('not_launchable');
    run.choose('play');
    expect(projectLearningCycle(run.get()).adventureBoard.progress?.currentNodeId).toBe('play-b');
    run.complete('play'); run.choose('learn');
    expect(projectLearningCycle(run.get()).adventureBoard.progress?.currentNodeId).toBe('learn-a');
    run.complete('learn'); run.complete('check');
    expect(run.get().lifecycle).toBe('baseline_evaluating');
    expect(run.get().routeSelection?.choices).toEqual({order:'learn'});
    expect(run.get().boards![0].definition).toEqual(authoredJourney());
  });
  it('keeps the Discovery lifecycle when its authored fork opens',()=>{
    const run=setup('probe');run.choose('learn');expect(run.get().lifecycle).toBe('evaluation_ready');
  });
  it('closes an encounter chapter at the selected path endpoint, not early at the encounter',()=>{
    const run=setup('quest');run.choose('play');expect(run.get().lifecycle).toBe('quest_ready');
    run.complete('play');expect(run.get().lifecycle).not.toBe('quest_evaluating');
    run.complete('learn');run.complete('check');expect(run.get().lifecycle).toBe('quest_evaluating');
  });
  it('rejects unknown options without changing state', () => {
    const run=setup(); const before=structuredClone(run.get());
    expect(() => run.choose('invented')).toThrow('choice_option_missing');
    expect(run.get()).toEqual(before);
  });
});

// The human saw a complete-looking map whose controls overlapped. Activity-only
// verification missed it because the canvas itself was never a release gate.
it('publishes a prepared authored board once every artifact is verified, without waiting for a canvas proof', () => {
  const opts={rootDir:root()}; const input=cycleInput(false); delete input.agencyExperiment;
  input.nodes=['learn','play','check'].map(id=>node(id,{state:'generating'}));
  const definition=authoredJourney();
  const board=publishBoardInstance({...input,boards:[]} as unknown as LearningCycleRecordV2,{kind:'teaching',definition,predecessorBoardId:null,plannerDecisionId:'decision',evidenceIds:[],nodeIds:input.nodes.map(n=>n.nodeId),publishedAt:null});
  const previous={...board,boardId:'prior',definition:undefined,nodeIds:['probe'],publishedAt:'2026-10-01T00:00:00Z'};
  input.nodes.push(node('probe',{role:'evaluation',state:'completed'}));
  previous.topologyHash=boardTopologyHash(input as unknown as LearningCycleRecordV2,previous);
  let cycle=createLearningCycle({...input,boards:[previous,board],initialLifecycle:'board_generating'},opts);
  for(const id of ['learn','play']) cycle=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'artifact_bound',nodeId:id,artifact:{...binding,artifactId:id}},opts);
  expect(cycle.boards![1].publishedAt).toBeNull(); // an unverified activity still holds the board
  cycle=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'artifact_bound',nodeId:'check',artifact:{...binding,artifactId:'check'}},opts);
  expect(cycle.boards![1].publishedAt).not.toBeNull(); // the canvas never holds it
  const proof={definitionHash:createHash('sha256').update(JSON.stringify(definition)).digest('hex'),rendererHash:'tested-renderer',viewports:['1280x720','768x1024'],screenshots:['/test/landscape.png','/test/portrait.png'],verifiedAt:'2026-10-09T00:00:00Z'};
  expect(()=>transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'board_canvas_verified',boardId:board.boardId,proof:{...proof,definitionHash:'wrong'}},opts)).toThrow('board_canvas_proof_mismatch');
  cycle=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'board_canvas_verified',boardId:board.boardId,proof},opts);
  expect(cycle.boards![1].publishedAt).not.toBeNull();
  expect(getLearningCycle(cycle.childId,cycle.homeworkId,opts)!.canvasVerifications).toEqual(cycle.canvasVerifications);
});

it('accepts Teaching after the selected Probe execution without requiring its sibling',()=>{
 const opts={rootDir:root()};const input=cycleInput(false);delete input.agencyExperiment;
 input.nodes=[node('left',{role:'evaluation',state:'completed'}),node('right',{role:'evaluation',state:'ready'})];
 const definition=choiceJourneyFixture([{id:'left',label:'Left',nodeIds:['left']},{id:'right',label:'Right',nodeIds:['right']}]);
 const board=publishBoardInstance(input as unknown as LearningCycleRecordV2,{kind:'probe',definition,predecessorBoardId:null,plannerDecisionId:null,evidenceIds:[],nodeIds:['left','right'],publishedAt:'2026-10-01T00:00:00Z'});
 const cycle=createLearningCycle({...input,boards:[board],initialLifecycle:'board_designing',routeSelection:{choices:{choice:'left'},experimentId:'choice',selectedRouteId:'choice=left',selectedAt:'now',choiceEventId:'choice-1',history:[]}},opts);
 const result=transitionLearningCycle(cycle.childId,cycle.homeworkId,cycle.revision,{type:'targeted_board_revealed',boardDefinition:linearJourneyFixture(['teach']),programHash:'p',designHash:'d',nodes:[node('teach')],academicTheory:cycle.academicTheory,academicPredictions:[],assumptions:[]},opts);
 expect(result.boards![1].definition).toEqual(linearJourneyFixture(['teach']));
 expect(result.nodes.find(node=>node.nodeId==='right')!.state).toBe('ready');
});

it('keeps an initial Teaching board unpublished and invisible until both artifacts and canvas are verified',async()=>{
 const {withInitialBoard}=await import('./learningBoardInstances');
 const {verifyPreparingBoardCanvas}=await import('./adventureBoardCanvas');
 const rootDir=root();
 const definition=linearJourneyFixture(['learn']);
 const created=createLearningCycle(withInitialBoard({...cycleInput(false),agencyExperiment:undefined,nodes:[node('learn')],boardDefinition:definition},'teaching','2026-10-01T12:00:00.000Z'),{rootDir});
 expect(created.boards![0].publishedAt).toBeNull();
 expect(created.lifecycle).toBe('board_generating');
 expect(projectLearningCycle(created).adventureBoard.nodes).toEqual([]);
 expect(()=>transitionLearningCycle(created.childId,created.homeworkId,created.revision,{type:'instrument_observed',nodeId:'learn',academicEvidence:[],engagementEvidence:[],companionObservations:[],observations:[]},{rootDir})).toThrow('learning_board_not_published');
 await verifyPreparingBoardCanvas({rootDir,childId:created.childId,homeworkId:created.homeworkId,directory:path.join(rootDir,'proof')});
 const verified=getLearningCycle(created.childId,created.homeworkId,{rootDir})!;
 expect(verified.boards![0].publishedAt).toBeNull();
 const ready=transitionLearningCycle(verified.childId,verified.homeworkId,verified.revision,{type:'artifact_bound',nodeId:'learn',artifact:binding},{rootDir});
 expect(ready.boards![0].publishedAt).not.toBeNull();
 expect(projectLearningCycle(ready).adventureBoard.nodes.map(n=>n.id)).toEqual(['start','learn','end']);
 fs.rmSync(rootDir,{recursive:true,force:true});
},20000);
