import { describe, expect, it } from "vitest";
import {
  childIdFromSessionName,
  isValidWsSessionChild,
  listChildProfileIds,
  sessionChildNameFromId,
} from "../shared/childRegistry";

describe("childRegistry", () => {
  it("lists configured child profile ids", () => {
    const ids = listChildProfileIds();
    expect(ids).toContain("ila");
    expect(ids).toContain("reina");
    expect(ids).toContain("demo-pashley");
  });

  it("maps session names to child ids", () => {
    expect(childIdFromSessionName("Ila")).toBe("ila");
    expect(childIdFromSessionName("Reina")).toBe("reina");
    expect(childIdFromSessionName("Demo-pashley")).toBe("demo-pashley");
    expect(sessionChildNameFromId("demo-pashley")).toBe("Demo-pashley");
  });

  it("accepts configured children for websocket sessions", () => {
    expect(isValidWsSessionChild("Ila")).toBe(true);
    expect(isValidWsSessionChild("Demo-pashley")).toBe(true);
    expect(isValidWsSessionChild("creator", true)).toBe(true);
    expect(isValidWsSessionChild("creator")).toBe(false);
    expect(isValidWsSessionChild("Unknown")).toBe(false);
  });
});
