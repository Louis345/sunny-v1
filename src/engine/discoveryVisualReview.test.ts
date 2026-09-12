import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DISCOVERY_RELEASE_VIEWPORTS, DISCOVERY_VERIFIER_VERSION, renderDiscoveryCandidate, reviewDiscoveryCandidate, withDiscoveryBrowserPage } from "./discoveryVisualReview";

const playwrightLaunch = vi.hoisted(() => vi.fn());

vi.mock("playwright", () => ({
  chromium: { launch: playwrightLaunch },
}));

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-discovery-visual-"));
}

function activeHandles(): unknown[] {
  return (process as NodeJS.Process & { _getActiveHandles: () => unknown[] })._getActiveHandles();
}

describe("Discovery visual review", () => {
  it("invalidates prior unscoped-control verdicts without resetting paid repair receipts", () => {
    expect(DISCOVERY_VERIFIER_VERSION).toBe(11);
  });

  it("keeps paid Fable and Haiku reviewers out of the production visual gate", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/discoveryVisualReview.ts"), "utf8");

    expect(source).not.toContain("claude-fable");
    expect(source).not.toContain("claude-haiku");
    expect(source).not.toContain("createAnthropicDiscoveryReviewer");
  });

  it("reviews both the generation frame and Sunny's real child frame", () => {
    expect(DISCOVERY_RELEASE_VIEWPORTS).toEqual([
      { name: "generation", width: 1365, height: 768 },
      { name: "sunny", width: 1280, height: 720 },
    ]);
  });
  it("closes the temporary HTML server when browser launch fails", async () => {
    const handlesBefore = new Set(activeHandles());
    playwrightLaunch.mockRejectedValueOnce(new Error("browser_launch_failed"));

    await expect(renderDiscoveryCandidate({
      html: "<html>launch failure</html>",
      iteration: 1,
      outputDir: dir(),
    })).rejects.toThrow("browser_launch_failed");

    const openedServers = activeHandles().filter(
      (handle): handle is http.Server => handle instanceof http.Server && !handlesBefore.has(handle),
    );
    try {
      expect(openedServers).toHaveLength(1);
      expect(openedServers[0]?.listening).toBe(false);
    } finally {
      await Promise.all(openedServers
        .filter((server) => server.listening)
        .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    }
  });

  it("rejects browser exceptions raised while the child interaction is exercised", async () => {
    let reportPageError: ((error: Error) => void) | undefined;
    playwrightLaunch.mockResolvedValueOnce({
      newPage: vi.fn(async () => ({
        on: vi.fn((event: string, listener: (error: Error) => void) => {
          if (event === "pageerror") reportPageError = listener;
        }),
        goto: vi.fn(async () => undefined),
        addInitScript: vi.fn(async () => undefined),
      })),
      close: vi.fn(async () => undefined),
    });

    await expect(withDiscoveryBrowserPage("<html></html>", async () => {
      reportPageError?.(new Error("interaction exploded"));
      return "finished";
    })).rejects.toThrow("discovery_browser_exception:interaction exploded");
  });

  it("repairs a failed full journey before it can approve or cache acceptance", async () => {
    const outputDir = dir();
    const render = vi.fn(async () => ["screenshot.png"]);
    const verify = vi.fn(async (html: string) => {
      if (html === "broken") throw new Error("math_control_clipped_or_obscured:pause-overlay");
    });
    const repair = vi.fn(async (_input: unknown) => "corrected");
    const result = await reviewDiscoveryCandidate({ html: "broken", outputDir, render, verify, repair });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0]?.[0]).toMatchObject({issues: [expect.stringContaining("pause-overlay")]});
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.html).toBe("corrected");
    expect(result.audit.iterations[0].issues).toHaveLength(1);
    await reviewDiscoveryCandidate({ html: "broken", outputDir, render, verify, repair });
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("forwards runtime failure-state screenshots to the repair model", async () => {
    const outputDir = dir();
    const opening = path.join(outputDir, "opening.png");
    const journeyGeneration = path.join(outputDir, "journey-generation.png");
    const journeySunny = path.join(outputDir, "journey-sunny.png");
    for (const file of [opening, journeyGeneration, journeySunny]) fs.writeFileSync(file, "png");
    const repair = vi.fn(async () => "corrected");

    await reviewDiscoveryCandidate({
      html: "broken",
      outputDir,
      render: async () => [opening],
      verify: async (html) => {
        if (html === "broken") {
          throw Object.assign(new Error("math_journey_control_not_actionable:item=item-02-which-hand;selector=#hand-long"), {
            screenshotPaths: [journeyGeneration, journeySunny],
          });
        }
      },
      repair,
    });

    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      screenshotPaths: [opening, journeyGeneration, journeySunny],
    }));
  });

  it("routes rendering exceptions through the same bounded repair", async () => {
    const outputDir=dir(); let calls=0;
    const render=async()=>{if(++calls===1)throw new Error("discovery_browser_exception:broken startup");return ["fixed.png"];};
    const repair=vi.fn(async()=>"fixed");
    await expect(reviewDiscoveryCandidate({html:"broken",outputDir,render,repair})).resolves.toMatchObject({html:"fixed"});
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("publishes without an AI review when both browser viewports pass", async () => {
    const outputDir = dir();
    const render = vi.fn(async ({ iteration }: { iteration: number }) => {
      const file = path.join(outputDir, `shot-${iteration}.png`);
      fs.writeFileSync(file, "png");
      return [file, file];
    });
    const repair = vi.fn();

    const result = await reviewDiscoveryCandidate({
      html: "<html>first</html>",
      outputDir,
      render,
      repair,
    });

    expect(result.html).toBe("<html>first</html>");
    expect(result.audit.status).toBe("approved");
    expect(result.audit.iterations).toHaveLength(1);
    expect(repair).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, "visual-review.json"), "utf8"))).toEqual(
      expect.objectContaining({ status: "approved" }),
    );
  });

  it("routes browser-detected clipping through one screenshot-informed repair", async () => {
    const outputDir = dir();
    const render = vi.fn(async ({ iteration }: { iteration: 1 | 2 }) => {
      const file = path.join(outputDir, `shot-${iteration}.png`);
      fs.writeFileSync(file, "png");
      const screenshots = [file, file] as string[] & { issues?: string[] };
      if (iteration === 1) screenshots.issues = ["sunny:required_action_clipped:Plant it"];
      return screenshots;
    });
    const repair = vi.fn(async () => "<html>repaired</html>");

    const result = await reviewDiscoveryCandidate({
      html: "<html>first</html>",
      outputDir,
      render,
      repair,
    });

    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      issues: ["sunny:required_action_clipped:Plant it"],
    }));
    expect(result.html).toBe("<html>repaired</html>");
    expect(result.audit.status).toBe("approved");
  });

  it("stops unpublished when browser checks still fail after one repair", async () => {
    const outputDir = dir();
    const repair = vi.fn(async () => "<html>repaired</html>");

    await expect(reviewDiscoveryCandidate({
      html: "<html>first</html>",
      outputDir,
      render: async ({ iteration }) => {
        const file = path.join(outputDir, `shot-${iteration}.png`);
        fs.writeFileSync(file, "png");
        const screenshots = [file, file] as string[] & { issues?: string[] };
        screenshots.issues = ["sunny:required_action_clipped:Skip"];
        return screenshots;
      },
      repair,
    })).rejects.toThrow("discovery_visual_review_failed_after_bounded_repair");

    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      html: "<html>first</html>",
      issues: ["sunny:required_action_clipped:Skip"],
    }));
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, "visual-review.json"), "utf8"))).toEqual(
      expect.objectContaining({ status: "rejected_after_repair", iterations: expect.any(Array) }),
    );
  });

  it("resumes after an interrupted repair without repeating the completed browser render", async () => {
    const outputDir = dir();
    const render = vi.fn(async ({ iteration }: { iteration: number }) => {
      const file = path.join(outputDir, `shot-${iteration}.png`);
      fs.writeFileSync(file, "png");
      const screenshots = [file, file] as string[] & { issues?: string[] };
      screenshots.issues = iteration === 1 ? ["clipped"] : [];
      return screenshots;
    });
    await expect(reviewDiscoveryCandidate({
      html: "<html>first</html>", outputDir, render,
      repair: async () => { throw new Error("interrupted_after_review"); },
    })).rejects.toThrow("interrupted_after_review");

    const result = await reviewDiscoveryCandidate({
      html: "<html>first</html>", outputDir, render,
      repair: async () => "<html>repaired</html>",
    });

    expect(result.html).toBe("<html>repaired</html>");
    expect(result.audit.iterations).toHaveLength(2);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("ignores legacy AI-review checkpoints when the browser-only gate changes", async () => {
    const outputDir = dir();
    fs.writeFileSync(path.join(outputDir, "visual-review-checkpoint.json"), JSON.stringify({
      initialHtmlHash: createHash("sha256").update("<html>first</html>").digest("hex"),
      html: "<html>first</html>",
      iterations: [{ iteration: 2, fable: { decision: "repair_required" }, haiku: { decision: "approve" } }],
    }));
    const render = vi.fn(async () => {
      const file = path.join(outputDir, "fresh.png");
      fs.writeFileSync(file, "png");
      return [file, file];
    });

    const result = await reviewDiscoveryCandidate({
      html: "<html>first</html>", outputDir, render, repair: vi.fn(),
    });

    expect(result.audit.status).toBe("approved");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("revalidates the prior verifier's paid repair bytes without buying another repair", async () => {
    const outputDir = dir();
    const initialHtml = "<html>initial</html>";
    const repairedHtml = "<html>model-repaired</html>";
    fs.writeFileSync(path.join(outputDir, "visual-review-checkpoint.json"), JSON.stringify({
      version: DISCOVERY_VERIFIER_VERSION - 1,
      verificationKey: `${DISCOVERY_VERIFIER_VERSION - 1}:contract:true`,
      initialHtmlHash: createHash("sha256").update(initialHtml).digest("hex"),
      html: repairedHtml,
      iterations: [
        { iteration: 1, htmlHash: createHash("sha256").update(initialHtml).digest("hex"), screenshotPath: "one.png", issues: ["old defect"] },
        { iteration: 2, htmlHash: createHash("sha256").update(repairedHtml).digest("hex"), screenshotPath: "two.png", issues: ["old verifier false positive"] },
      ],
    }));
    const render = vi.fn(async () => {
      const file = path.join(outputDir, "current.png");
      fs.writeFileSync(file, "png");
      return [file, file];
    });
    const verify = vi.fn(async () => undefined);
    const repair = vi.fn();

    const result = await reviewDiscoveryCandidate({
      html: initialHtml,
      outputDir,
      render,
      verify,
      verificationKey: "contract",
      repair,
    });

    expect(result.html).toBe(repairedHtml);
    expect(result.audit.status).toBe("approved");
    expect(render).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(repairedHtml);
    expect(repair).not.toHaveBeenCalled();
  });

  it.each([true,false])("reuses repaired bytes saved before iteration two when upgrading (accepted=%s)", async (accepted) => {
    const outputDir=dir(), initial='<html>initial</html>', repaired='<html>paid repair</html>';
    const hash=(html:string)=>createHash('sha256').update(html).digest('hex');
    fs.writeFileSync(path.join(outputDir,'visual-review-checkpoint.json'),JSON.stringify({
      version:DISCOVERY_VERIFIER_VERSION-1,initialHtmlHash:hash(initial),html:repaired,
      iterations:[{iteration:1,htmlHash:hash(initial),issues:['hidden control'],screenshotPaths:['before.png']}],
    }));
    const render=vi.fn(async({html}:{html:string})=>Object.assign(['state.png'],{issues:accepted&&html===repaired?[]:['hidden control']}));
    const repair=vi.fn(async()=>repaired);
    const run=()=>reviewDiscoveryCandidate({html:initial,outputDir,render,repair});
    if(accepted){await expect(run()).resolves.toMatchObject({html:repaired});await expect(run()).resolves.toMatchObject({html:repaired});}
    else {await expect(run()).rejects.toThrow('bounded_repair');await expect(run()).rejects.toThrow('bounded_repair');}
    expect(repair).not.toHaveBeenCalled();
    expect(render.mock.calls.every(([input])=>input.html===repaired)).toBe(true);
  });

  it.each([1,2])("does not reset a spent repair allowance after %i verifier upgrades", async (versions) => {
    const outputDir = dir(), initial = "<html>initial</html>", repaired = "<html>repaired</html>";
    const hash = (html: string) => createHash("sha256").update(html).digest("hex");
    fs.writeFileSync(path.join(outputDir,"visual-review-checkpoint.json"),JSON.stringify({
      version:DISCOVERY_VERIFIER_VERSION-versions,initialHtmlHash:hash(initial),html:repaired,
      iterations:[{iteration:1,htmlHash:hash(initial),issues:["first"],screenshotPaths:["one.png"]},{iteration:2,htmlHash:hash(repaired),issues:["remaining"],screenshotPaths:["two.png"]}],
    }));
    const render=vi.fn(async()=>Object.assign(["failure.png"],{issues:["remaining"]}));
    const repair=vi.fn(async()=>repaired);
    const run=()=>reviewDiscoveryCandidate({html:initial,outputDir,render,repair});
    await expect(run()).rejects.toThrow("bounded_repair");
    await expect(run()).rejects.toThrow("bounded_repair");
    expect(repair).not.toHaveBeenCalled();
  });
});
