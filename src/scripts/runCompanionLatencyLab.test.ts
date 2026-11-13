import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildCompanionLatencyLabUrls,
  createMockCompanionLatencyTracePackets,
  inferCompanionLatencyModeFromPacket,
  writeCompanionLatencyLabArtifacts,
} from "./runCompanionLatencyLab";

describe("companion latency lab runner", () => {
  it("builds matching Claude and presence showroom URLs", () => {
    const urls = buildCompanionLatencyLabUrls({
      baseUrl: "http://127.0.0.1:5173",
      childId: "ila",
      theme: "crystal",
    });

    expect(urls).toMatchObject({
      claude:
        "http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal&child=ila&activityReactionMode=claude",
      presence:
        "http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal&child=ila&activityReactionMode=presence",
    });
  });

  it("creates mock packets without provider payloads for dry lab mode", () => {
    const packets = createMockCompanionLatencyTracePackets();

    expect(packets.map((packet) => packet.mode)).toEqual(["claude", "presence"]);
    expect(JSON.stringify(packets)).not.toContain("audioBase64");
    expect(JSON.stringify(packets)).not.toContain("base64");
    expect(JSON.stringify(packets)).not.toContain("providerPayload");
  });

  it("infers presence mode from trace packet reaction counts instead of URL text", () => {
    expect(
      inferCompanionLatencyModeFromPacket(
        {
          traceId: "trace_without_mode_in_name",
          likelyCause: "none",
          eventCount: 3,
          loopSuspected: false,
          activityReactions: {
            aiAuthoredCount: 0,
            presenceCount: 1,
            fallbackCount: 0,
            staleDroppedCount: 0,
            spokenCount: 1,
            missingAudioCount: 0,
          },
          eventOrder: [],
          turns: [],
        },
        "claude",
      ),
    ).toBe("presence");
  });

  it("writes latency spans, trace packets, JSON report, and human review markdown", () => {
    const labDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-latency-lab-"));
    const packets = createMockCompanionLatencyTracePackets();
    const output = writeCompanionLatencyLabArtifacts({
      labDir,
      packets,
      testUrl:
        "http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal&child=ila&activityReactionMode=presence",
      traceUrls: [
        "http://127.0.0.1:5173/api/companions/video-call-traces/trace_presence_mock",
      ],
    });

    expect(output.report.ready_for_human_review).toBe(true);
    expect(fs.existsSync(path.join(labDir, "latency-spans.ndjson"))).toBe(true);
    expect(fs.existsSync(path.join(labDir, "trace-packets", "trace_presence_mock.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(labDir, "lab-report.json"))).toBe(true);
    expect(fs.readFileSync(path.join(labDir, "human-review.md"), "utf8")).toContain(
      "ready_for_human_review: true",
    );
  });
});
