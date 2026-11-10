import { afterEach, expect, it, vi } from "vitest";
import * as certification from "../lib/wardrobeBodyProfiles";
import {
  createInitialWardrobeStoreState,
  equipWardrobeItem,
  resolveEquippedWardrobeSelection,
  wardrobePairEvidence,
} from "../lib/wardrobeStore";
import bodies from "../lib/wardrobePrepared.generated.json";

// Bug 2026-11-10 (Ila's session): she earned the Comet Hoodie and Cat Ears and could not put both on Elli; the ears
// were silently dropped. WARDROBE_PAIR_CERTIFICATIONS was empty and every outfit + accessory pair needed a human
// review record, so every combination was refused.
// Why the human caught it: she tried on what she had earned and saw the ears vanish.
// Why the logs did not: the refusal logged only `equip rejected … reason=uncertified_pair` as a warning, and the
// render path (resolveEquippedWardrobeSelection) emptied the outfit with no log at all.
// Why the lab missed it: the store tests mock isWardrobePairApproved to true, so no test ran the real pair gate.
// Owner: remove the human sign-off. An automated pass is approval; anything she earned she can wear, in any
// combination; a pair with no automated evidence is worn and flagged in the log, never silently refused.

const elliModel = bodies.find(body => body.companionId === "elli")!.modelUrl;
afterEach(() => vi.restoreAllMocks());

it("an automated visual pass is the approval for an outfit and accessory pair", () => {
  expect(wardrobePairEvidence("elli", "comet-hoodie", "cat-ears")).toBe("automated");
  expect(wardrobePairEvidence("elli", "sleeveless-dress", "royal-crown")).toBe("automated");
});

it("Elli wears the Comet Hoodie and Cat Ears together", () => {
  const state = { ...createInitialWardrobeStoreState(), ownedItemIds: ["comet-hoodie", "cat-ears"] };
  const hoodie = equipWardrobeItem(state, "elli", "comet-hoodie", elliModel);
  expect(hoodie.status).toBe("equipped");
  const ears = equipWardrobeItem(hoodie.state, "elli", "cat-ears", elliModel);
  expect(ears.status).toBe("equipped");
  expect(resolveEquippedWardrobeSelection(ears.state, "elli", elliModel)).toMatchObject({ outfitId: "comet-hoodie", accessoryId: "cat-ears" });
});

it("a pair with no automated evidence is still worn, and flagged in the log", () => {
  vi.spyOn(certification, "resolveWardrobeTemplateCertification").mockReturnValue({ companionId: "princess", templateId: "fixture", status: "approved", reason: "TEST ONLY" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const princess = bodies.find(body => body.companionId === "princess");
  const model = princess?.modelUrl ?? elliModel;
  const companionId = princess ? "princess" : "elli";
  expect(wardrobePairEvidence("princess", "comet-hoodie", "cat-ears")).toBe("none");
  const state = { ...createInitialWardrobeStoreState(), ownedItemIds: ["comet-hoodie", "cat-ears"], equippedByCompanion: { [companionId]: { outfitItemId: "comet-hoodie" } } };
  const worn = equipWardrobeItem(state, companionId, "cat-ears", model);
  expect(worn.status).toBe("equipped");
  expect(resolveEquippedWardrobeSelection(worn.state, companionId, model)).toMatchObject({ accessoryId: "cat-ears" });
  if (princess) expect(warn.mock.calls.some(([line]) => String(line).includes("[wardrobe-store] [pair] [unverified]"))).toBe(true);
});
