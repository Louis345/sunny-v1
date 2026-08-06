import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildIngestInvocation,
  buildSessionInvocation,
  listParentChildIds,
  parentPageUrl,
  runSunnyMenu,
} from "./sunnyMenu";

describe("Sunny parent menu", () => {
  it("lists only configured children with real learning profiles", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-parent-children-"));
    fs.writeFileSync(path.join(root, "children.config.json"), JSON.stringify({
      childProfiles: { "demo-pashley": {}, ila: {}, reina: {} },
    }));
    fs.mkdirSync(path.join(root, "src", "context", "ila"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "context", "reina"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "context", "ila", "learning_profile.json"), "{}");
    fs.writeFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "{}");

    expect(listParentChildIds(root)).toEqual(["ila", "reina"]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("routes math only through the direct artifact ingestion path", () => {
    expect(buildIngestInvocation("reina", "math", "/tmp/fractions.pdf")).toEqual({
      command: "npm",
      args: ["run", "sunny:ingest:math", "--", "--child=reina", "--pdf=/tmp/fractions.pdf"],
    });
    expect(buildIngestInvocation("reina", "math", "/tmp/fractions.pdf").args.join(" ")).not.toContain("sunny:ingest:homework");
  });

  it.each(["spelling", "reading", "science"] as const)("delegates %s to its existing domain script", (domain) => {
    expect(buildIngestInvocation("ila", domain, `/tmp/${domain}.pdf`)).toEqual({
      command: "npm",
      args: ["run", `sunny:ingest:${domain}`, "--", "--child=ila", `--pdf=/tmp/${domain}.pdf`],
    });
  });

  it("makes real-child versus parent-preview persistence explicit in the canonical runner", () => {
    expect(buildSessionInvocation("reina", "math", "real")).toEqual({
      command: "npm",
      args: ["run", "sunny:run", "--", "--subject", "homework", "--child", "reina", "--session-mode", "real", "--homework-domain", "math"],
    });
    expect(buildSessionInvocation("reina", "math", "as-child")).toEqual({
      command: "npm",
      args: ["run", "sunny:run", "--", "--subject", "homework", "--child", "reina", "--session-mode", "as-child", "--homework-domain", "math"],
    });
  });

  it("uses stable parent URLs that a future app can replace", () => {
    expect(parentPageUrl("returned-work", "reina")).toBe("http://localhost:3001/parent/returned-work?child=reina");
    expect(parentPageUrl("learning-report", "reina")).toBe("http://localhost:3001/parent/learning-report?child=reina");
  });

  it("returns to the menu after a failed action and closes menu-owned resources on exit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-failed-ingest-"));
    const assignment = path.join(root, "fractions.pdf");
    fs.writeFileSync(assignment, "fixture");
    const answers = ["1", "1", "1", assignment, "5"];
    const close = vi.fn(async () => undefined);
    const log = vi.fn();
    const result = await runSunnyMenu({
      children: ["reina"],
      ask: async () => answers.shift() ?? "5",
      execute: async () => 1,
      openParentPage: async () => undefined,
      close,
      log,
    });

    expect(result).toBe("exit");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed"));
    expect(close).toHaveBeenCalledOnce();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts a Finder drag-and-drop path and reprompts locally without losing child or domain", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-drag-drop-"));
    const assignment = path.join(root, "3_24 math coin.pdf");
    fs.writeFileSync(assignment, "fixture");
    const draggedPath = assignment.replaceAll(" ", "\\ ");
    const answers = ["1", "1", "1", path.join(root, "missing.pdf"), draggedPath, "5"];
    const invocations: Array<ReturnType<typeof buildIngestInvocation>> = [];
    const log = vi.fn();

    await runSunnyMenu({
      children: ["reina"],
      ask: async () => answers.shift() ?? "5",
      execute: async (invocation) => {
        invocations.push(invocation);
        return 0;
      },
      openParentPage: async () => undefined,
      close: async () => undefined,
      log,
    });

    expect(invocations).toEqual([buildIngestInvocation("reina", "math", assignment)]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Assignment file not found"));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
