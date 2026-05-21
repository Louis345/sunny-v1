import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOWROOM_THEME,
  SHOWROOM_THEMES,
  getNextShowroomThemeState,
  resolveAvailableShowroomThemes,
  resolveShowroomTheme,
  shouldShowShowroomCompanionDots,
} from "../components/CompanionShowroom";
import {
  StorybookFootlights,
  StorybookNameplate,
  StorybookPrimaryButton,
  StorybookSignatureButton,
  StorybookSparkles,
} from "../components/StorybookShowroomChrome";
import {
  CrystalDotNav,
  CrystalIdentityBlock,
  CrystalPedestal,
  CrystalPrimaryButton,
  CrystalSignatureButton,
  CrystalSpotlight,
} from "../components/CrystalAtelierChrome";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CompanionShowroom themes", () => {
  it("registers the three v1 rooms from one source of truth", () => {
    expect(DEFAULT_SHOWROOM_THEME).toBe("aurora");
    expect(SHOWROOM_THEMES.map((theme) => theme.id)).toEqual([
      "aurora",
      "storybook",
      "crystal",
    ]);
    expect(new Set(SHOWROOM_THEMES.map((theme) => theme.id)).size).toBe(3);
    expect(SHOWROOM_THEMES.map((theme) => theme.displayName)).toEqual([
      "Aurora Hall",
      "Storybook Proscenium",
      "Crystal Atelier",
    ]);
    expect(SHOWROOM_THEMES.map((theme) => theme.shortDisplayName)).toEqual([
      "Aurora",
      "Storybook",
      "Crystal",
    ]);
    expect(SHOWROOM_THEMES.map((theme) => theme.qaMarker)).toEqual([
      "showroom-theme-aurora",
      "showroom-theme-storybook",
      "showroom-theme-crystal",
    ]);
    expect(SHOWROOM_THEMES.every((theme) => theme.v1Available)).toBe(true);
    expect(SHOWROOM_THEMES.find((theme) => theme.id === "storybook")).toMatchObject({
      sceneLabel: "ACT ONE",
      scenePrompt: "Three friends step into the light. Pick one to begin.",
    });
  });

  it("falls back to Aurora Hall for invalid theme ids", () => {
    expect(resolveShowroomTheme("storybook")).toBe("storybook");
    expect(resolveShowroomTheme("crystal")).toBe("crystal");
    expect(resolveShowroomTheme("unknown-room")).toBe("aurora");
    expect(resolveShowroomTheme(null)).toBe("aurora");
    expect(resolveShowroomTheme(undefined)).toBe("aurora");
  });

  it("normalizes available rooms for future economy gating", () => {
    expect(resolveAvailableShowroomThemes()).toEqual([
      "aurora",
      "storybook",
      "crystal",
    ]);
    expect(resolveAvailableShowroomThemes(["crystal", "bogus", "crystal"])).toEqual([
      "aurora",
      "crystal",
    ]);
  });

  it("cycles room themes without changing the selected companion", () => {
    expect(
      getNextShowroomThemeState(
        { theme: "aurora", currentIndex: 2 },
        1,
        ["aurora", "storybook", "crystal"],
      ),
    ).toEqual({ theme: "storybook", currentIndex: 2 });
    expect(
      getNextShowroomThemeState(
        { theme: "aurora", currentIndex: 2 },
        -1,
        ["aurora", "storybook", "crystal"],
      ),
    ).toEqual({ theme: "crystal", currentIndex: 2 });
  });

  it("exposes authored Storybook chrome pieces", () => {
    expect(typeof StorybookNameplate).toBe("function");
    expect(typeof StorybookSparkles).toBe("function");
    expect(typeof StorybookFootlights).toBe("function");
    expect(typeof StorybookPrimaryButton).toBe("function");
    expect(typeof StorybookSignatureButton).toBe("function");
  });

  it("exposes authored Crystal Atelier chrome pieces", () => {
    expect(typeof CrystalSpotlight).toBe("function");
    expect(typeof CrystalPedestal).toBe("function");
    expect(typeof CrystalIdentityBlock).toBe("function");
    expect(typeof CrystalDotNav).toBe("function");
    expect(typeof CrystalPrimaryButton).toBe("function");
    expect(typeof CrystalSignatureButton).toBe("function");
  });

  it("keeps the Crystal spotlight bright enough after the darker depth overlay", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CrystalAtelierChrome.tsx"),
      "utf8",
    );

    expect(source).toContain("width: 440");
    expect(source).toContain('height: "84%"');
    expect(source).toContain("rgba(255,247,237,0.95)");
    expect(source).toContain("rgba(253,230,138,0.44)");
  });

  it("wires Crystal Atelier chrome into the live showroom stage", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("<CrystalSpotlight");
    expect(source).toContain("<CrystalPedestal");
    expect(source).toContain("<CrystalIdentityBlock");
    expect(source).toContain("<CrystalDotNav");
    expect(source).toContain("<CrystalPrimaryButton");
    expect(source).toContain("<CrystalSignatureButton");
  });

  it("adds a subtle dark Crystal overlay without changing room artwork", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("sunny-crystal-depth-overlay");
    expect(source).toContain("radial-gradient(ellipse at 50% 80%");
    expect(source).toContain("linear-gradient(90deg");
    expect(source).toContain("pointerEvents: \"none\"");
  });

  it("anchors Crystal pedestals to the same slot frame as the companion canvas", () => {
    const showroomSource = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const crystalSource = readFileSync(
      resolve(__dirname, "../components/CrystalAtelierChrome.tsx"),
      "utf8",
    );

    expect(showroomSource).toContain("slotFrameStyle={slotFrameStyle(slot.slot");
    expect(crystalSource).toContain("slotFrameStyle?: CSSProperties");
    expect(crystalSource).not.toContain('bottom: active ? "16%" : "26%"');
  });

  it("keeps room shortcuts vertically aligned inside the room cycler", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("data-showroom-room-shortcuts");
    expect(source).not.toContain("bottom: -13");
  });

  it("does not duplicate companion identity with Storybook browse nameplates", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain("<StorybookNameplate");
  });

  it("uses theme-specific nav instead of duplicate companion pagination dots", () => {
    expect(shouldShowShowroomCompanionDots("storybook", 8, false)).toBe(false);
    expect(shouldShowShowroomCompanionDots("aurora", 8, false)).toBe(true);
    expect(shouldShowShowroomCompanionDots("crystal", 8, false)).toBe(false);
    expect(shouldShowShowroomCompanionDots("aurora", 1, false)).toBe(false);
    expect(shouldShowShowroomCompanionDots("aurora", 8, true)).toBe(false);
  });

  it("keeps Storybook scene copy off the live companion stage", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).not.toContain("<ShowroomSceneTitle");
    expect(source).not.toContain("sunny-showroom-scene-prompt");
  });
});
