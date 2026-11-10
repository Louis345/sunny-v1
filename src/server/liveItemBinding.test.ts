import { describe, expect, it } from "vitest";
import { liveItemNode } from "./liveItemBinding";

// 2026-11-10 Ila's math: bindMathDiscoverySupport bound live context only for role "evaluation", so on her teaching
// board's built game no problem was ever bound and Elli's help was never tied to a problem. Human caught Elli guessing;
// logs never printed "[live-context] [bound]" for the teaching game; the lab's math sessions only covered Discovery.
describe("live item binding", () => {
  const item = { id: "p1", prompt: "29, 26, 23, 20, ?", lineage: { measurementRole: "practice" }, response: { mode: "numeric", expected: 17 } };
  const binding = { contractFingerprint: "hash" };
  const cycle = (role: string, domain = "math") => ({ domain, nodes: [{ nodeId: "kappa", role, artifactBinding: binding, evidenceContract: { itemContracts: { p1: item } } }] }) as never;
  it("binds any node whose item contracts hold the open problem, in any role", () => {
    for (const role of ["evaluation", "baseline", "quest", "boss"]) expect(liveItemNode(cycle(role), "kappa", "p1")?.nodeId).toBe("kappa");
  });
  it("binds in any subject that frames items as item contracts", () => {
    expect(liveItemNode(cycle("baseline", "reading"), "kappa", "p1")?.nodeId).toBe("kappa");
  });
  it("does not bind an item the node does not hold, or a node with no built artifact", () => {
    expect(liveItemNode(cycle("baseline"), "kappa", "p9")).toBeUndefined();
    expect(liveItemNode({ domain: "math", nodes: [{ nodeId: "kappa", role: "baseline", artifactBinding: null, evidenceContract: { itemContracts: { p1: item } } }] } as never, "kappa", "p1")).toBeUndefined();
  });
});
