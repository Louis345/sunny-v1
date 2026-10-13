import { journeyExecutions, type AdventureJourneyDefinition } from '../shared/adventureBoardDefinition';
/** Exposure relationships are factual graph constraints, not teaching choices. */
export function spellingCheckpointLineageIssues(
  nodes: ReadonlyArray<{ id: string; type: string; targets: readonly string[] }>,
  measurements: ReadonlyArray<{ id: string; spelling?: { role: string; interventionNodeIds: readonly string[] } }>,
  definition?: AdventureJourneyDefinition,
): Array<{ code: "planner_checkpoint_lineage_missing" | "planner_final_checkpoint_missing"; nodeId: string; measurementId: string; interventionNodeIds: string[] }> {
  if (definition) {
    const byNodeId = new Map(nodes.map(node => [node.id,node]));
    return journeyExecutions(definition).flatMap(path => spellingCheckpointLineageIssues(path.activityNodeIds.map(id => {
      const node = byNodeId.get(id);
      if (!node) throw new Error(`activity_binding_missing:${id}`);
      return node;
    }),measurements));
  }
  const byId = new Map(measurements.map(row => [row.id, row.spelling]));
  const pending = new Map<string, Set<string>>();
  const issues: ReturnType<typeof spellingCheckpointLineageIssues> = [];
  for (const node of nodes) {
    if (node.type === "quest" || node.type === "boss") continue;
    const measurementId = `measure-${node.id}`;
    const measurement = byId.get(measurementId);
    if (!measurement) continue; // Required measurements have their own validation.
    const missing = new Set<string>();
    for (const target of node.targets) {
      const key = target.toLocaleLowerCase("en-US");
      const exposures = pending.get(key) ?? new Set<string>();
      if (measurement.role === "fresh_checkpoint") {
        for (const id of exposures) if (!measurement.interventionNodeIds.includes(id)) missing.add(id);
        exposures.clear();
      } else exposures.add(node.id);
      pending.set(key, exposures);
    }
    if (missing.size) issues.push({ code: "planner_checkpoint_lineage_missing", nodeId: node.id, measurementId, interventionNodeIds: [...missing] });
  }
  return issues;
}

/** A convergent checkpoint can name candidate exposures from alternative paths.
 * A citation must exist, and must precede the checkpoint on each path containing both.
 * Actual attempt provenance still records only exposures the child received. */
export function checkpointInterventionsArePrior(executions: ReadonlyArray<ReadonlyMap<string,number>>, checkpointId:string, interventionIds:readonly string[]):boolean {
 return interventionIds.every(id=>executions.some(order=>order.has(id)) && executions.every(order=>!order.has(checkpointId)||!order.has(id)||order.get(id)!<order.get(checkpointId)!));
}

/** Code knows the path order, so it derives each checkpoint's candidate exposures:
 * every earlier instruction or practice for one of its words since that word's last
 * checkpoint, across all executions. What she actually received is recorded at runtime. */
export function deriveCheckpointLineage(nodes:ReadonlyArray<{id:string;targets:readonly string[];role?:string}>,executions:ReadonlyArray<readonly string[]>):Record<string,string[]> {
 const byId=new Map(nodes.map(node=>[node.id,node])),lineage=new Map(nodes.map(node=>[node.id,new Set<string>()]));
 for(const execution of executions){
  const pending=new Map<string,Set<string>>();
  for(const id of execution){
   const node=byId.get(id);if(!node?.role)continue;
   for(const target of node.targets){
    const key=target.toLocaleLowerCase("en-US"),exposures=pending.get(key)??new Set<string>();
    if(node.role==="fresh_checkpoint"){exposures.forEach(exposure=>lineage.get(id)!.add(exposure));exposures.clear();}
    else exposures.add(id);
    pending.set(key,exposures);
   }
  }
 }
 return Object.fromEntries([...lineage].map(([id,exposures])=>[id,[...exposures]]));
}
