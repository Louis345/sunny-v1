import { describe, it, expect } from "vitest";
import {
  formatAuditLine,
  ttsLogLabel,
  fileLogDisabled,
} from "../server/audit-log";

describe("audit-log", () => {
  it("formatAuditLine includes component and stable key=value pairs", () => {
    const line = formatAuditLine("transcript", {
      action: "queued",
      turnState: "PROCESSING",
      tts: "off",
      childName: "Reina",
      round: 3,
    });
    expect(line).toMatch(/^🎮 \[audit\]/);
    expect(line).toContain("component=transcript");
    expect(line).toContain("action=queued");
    expect(line).toContain("turnState=PROCESSING");
    expect(line).toContain("tts=off");
    expect(line).toContain("childName=Reina");
    expect(line).toContain("round=3");
  });

  it("ttsLogLabel is off when TTS_ENABLED=false", () => {
    const prev = process.env.TTS_ENABLED;
    process.env.TTS_ENABLED = "false";
    expect(ttsLogLabel()).toBe("off");
    if (prev === undefined) delete process.env.TTS_ENABLED;
    else process.env.TTS_ENABLED = prev;
  });

  it("fileLogDisabled when SUNNY_LOG_TO_FILE=false", () => {
    const prev = process.env.SUNNY_LOG_TO_FILE;
    process.env.SUNNY_LOG_TO_FILE = "false";
    expect(fileLogDisabled()).toBe(true);
    if (prev === undefined) delete process.env.SUNNY_LOG_TO_FILE;
    else process.env.SUNNY_LOG_TO_FILE = prev;
  });
});
