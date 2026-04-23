import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  getSunnyMode,
  isDiagMapMode,
  isSunnyAsChildMode,
  isSunnyDiagMode,
  shouldPersistSessionData,
  sunnyPreviewBlocksPersistence,
} from "../utils/runtimeMode";

describe("getSunnyMode", () => {
  it('returns "diag" when SUNNY_MODE is diag', () => {
    expect(getSunnyMode({ SUNNY_MODE: "diag" })).toBe("diag");
  });

  it('returns "as-child" when SUNNY_MODE is as-child', () => {
    expect(getSunnyMode({ SUNNY_MODE: "as-child" })).toBe("as-child");
  });

  it('returns "real" when SUNNY_MODE is unset', () => {
    expect(getSunnyMode({})).toBe("real");
  });

  it('returns "real" for unrecognized SUNNY_MODE', () => {
    expect(getSunnyMode({ SUNNY_MODE: "garbage" })).toBe("real");
  });
});

describe("isSunnyDiagMode", () => {
  it("is true when SUNNY_MODE is diag", () => {
    expect(isSunnyDiagMode({ SUNNY_MODE: "diag" })).toBe(true);
  });

  it("is false when SUNNY_MODE is real", () => {
    expect(isSunnyDiagMode({ SUNNY_MODE: "real" })).toBe(false);
  });
});

describe("isDiagMapMode", () => {
  it("is true when SUNNY_MODE is diag even if SUNNY_SUBJECT is homework", () => {
    expect(
      isDiagMapMode({ SUNNY_MODE: "diag", SUNNY_SUBJECT: "homework" }),
    ).toBe(true);
  });

  it("is true when SUNNY_SUBJECT is diag", () => {
    expect(isDiagMapMode({ SUNNY_MODE: "real", SUNNY_SUBJECT: "diag" })).toBe(
      true,
    );
  });

  it("is false in real mode with non-diag subject", () => {
    expect(isDiagMapMode({ SUNNY_MODE: "real", SUNNY_SUBJECT: "reading" })).toBe(
      false,
    );
  });
});

describe("isSunnyAsChildMode", () => {
  it("is true when SUNNY_MODE is as-child", () => {
    expect(isSunnyAsChildMode({ SUNNY_MODE: "as-child" })).toBe(true);
  });

  it("is false when SUNNY_MODE is diag", () => {
    expect(isSunnyAsChildMode({ SUNNY_MODE: "diag" })).toBe(false);
  });
});

describe("shouldPersistSessionData", () => {
  it("is false when SUNNY_MODE is diag", () => {
    expect(shouldPersistSessionData({ SUNNY_MODE: "diag" })).toBe(false);
  });

  it("is false when SUNNY_MODE is as-child", () => {
    expect(shouldPersistSessionData({ SUNNY_MODE: "as-child" })).toBe(false);
  });

  it('is true when SUNNY_MODE is real', () => {
    expect(shouldPersistSessionData({ SUNNY_MODE: "real" })).toBe(true);
  });

  it("defaults to true when SUNNY_MODE is unset (real mode)", () => {
    expect(shouldPersistSessionData({})).toBe(true);
  });
});

describe("package.json diag scripts", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8"),
  ) as { scripts: Record<string, string> };

  it('contains script "sunny:mode:diag:homework"', () => {
    expect(pkg.scripts["sunny:mode:diag:homework"]).toBeDefined();
  });

  it('contains script "sunny:mode:diag:pronunciation:as-ila"', () => {
    expect(pkg.scripts["sunny:mode:diag:pronunciation:as-ila"]).toBeDefined();
  });

  it("sunny:mode:diag:homework includes SUNNY_CHILD=ila and VITE_PREVIEW_MODE=free", () => {
    const s = pkg.scripts["sunny:mode:diag:homework"] ?? "";
    expect(s).toContain("SUNNY_CHILD=ila");
    expect(s).toContain("VITE_PREVIEW_MODE=free");
  });

  it("every :as-ila script sets SUNNY_CHILD=ila", () => {
    const asIlaKeys = Object.keys(pkg.scripts).filter((k) => k.includes(":as-ila"));
    expect(asIlaKeys.length).toBeGreaterThan(0);
    for (const k of asIlaKeys) {
      expect(pkg.scripts[k]).toContain("SUNNY_CHILD=ila");
    }
  });
});

describe("sunnyPreviewBlocksPersistence (unchanged)", () => {
  it("still distinguishes preview modes", () => {
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "go-live" })).toBe(
      true,
    );
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "free" })).toBe(true);
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "false" })).toBe(
      false,
    );
  });
});
