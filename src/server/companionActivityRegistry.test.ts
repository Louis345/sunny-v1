import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPANION_ACTIVITY_DESCRIPTORS,
  COMPANION_ACTIVITY_IDS,
  describeCompanionActivityChoices,
  getCompanionActivityIntentWords,
  isCompanionActivityId,
} from "../shared/companionActivities/registry";
import { getShowroomCompanionActivityTools } from "./companionShowroomTalk";

/**
 * Guard that makes adding a game mechanical: every registered activity must
 * have a descriptor, a client component, and a slot in the Claude tool enum.
 * If this passes, a new game needs no edits to the generic layers.
 */
describe("companion activity registry", () => {
  it("derives the id list from the descriptors instead of a parallel list", () => {
    expect(COMPANION_ACTIVITY_IDS.length).toBeGreaterThan(0);
    for (const id of COMPANION_ACTIVITY_IDS) {
      expect(COMPANION_ACTIVITY_DESCRIPTORS[id].id).toBe(id);
      expect(isCompanionActivityId(id)).toBe(true);
    }
    expect(isCompanionActivityId("not_a_game")).toBe(false);
  });

  it("gives every activity the fields the generic prompt interpolates", () => {
    for (const id of COMPANION_ACTIVITY_IDS) {
      const descriptor = COMPANION_ACTIVITY_DESCRIPTORS[id];
      expect(descriptor.displayName.trim()).not.toBe("");
      expect(descriptor.moveNoun.trim()).not.toBe("");
      expect(descriptor.aliases.length).toBeGreaterThan(0);
      expect(descriptor.vocabulary.length).toBeGreaterThan(0);
      expect(describeCompanionActivityChoices()).toContain(descriptor.displayName);
    }
  });

  it("exposes every activity to Claude through the openCompanionActivity tool", () => {
    const [tool] = getShowroomCompanionActivityTools();
    const activityIdSchema = tool.input_schema.properties.activityId as {
      enum: string[];
    };
    expect([...activityIdSchema.enum].sort()).toEqual([...COMPANION_ACTIVITY_IDS].sort());
  });

  it("registers a client component for every activity", () => {
    const registrySource = readFileSync(
      resolve(__dirname, "../../web/src/components/companionActivities/registry.tsx"),
      "utf8",
    );
    for (const id of COMPANION_ACTIVITY_IDS) {
      expect(registrySource).toContain(`${id}:`);
    }
  });

  it("contributes each activity's vocabulary to game-intent detection", () => {
    const words = getCompanionActivityIntentWords();
    for (const id of COMPANION_ACTIVITY_IDS) {
      for (const word of COMPANION_ACTIVITY_DESCRIPTORS[id].vocabulary) {
        expect(words).toContain(word);
      }
    }
  });
});
