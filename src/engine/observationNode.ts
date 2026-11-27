import type { LearningCycleNodeContract, LearningObservation } from "./learningCycleRepository";

/** The node an observation came from, for every source form the runtime writes: a node completion
 * (`activity:<session>:<node>`), a typed answer (`activity:<node>:recall`) and Discovery (`evaluation:<node>`).
 * One matcher for everything that counts a game's answers (2026-11-10: three places matched only `...:<node>`). */
export function observationNode<N extends Pick<LearningCycleNodeContract, "nodeId">>(cycle: { nodes: N[] }, observation: Pick<LearningObservation, "sourceId">): N | undefined {
  // The most specific id wins: an earlier `quest` node must not claim `...:b2:quest`'s answers.
  return cycle.nodes.find(node => observation.sourceId === `activity:${node.nodeId}:recall`)
    ?? cycle.nodes.filter(node => observation.sourceId.endsWith(`:${node.nodeId}`)).sort((a, b) => b.nodeId.length - a.nodeId.length)[0];
}
