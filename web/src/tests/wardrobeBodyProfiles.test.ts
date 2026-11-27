import { describe, expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  WARDROBE_BODY_PROFILES,
  WARDROBE_COMPANION_BODY_ASSIGNMENTS,
  WARDROBE_COMPATIBILITY_CASES,
  resolvePreparedWardrobePresentation,
  resolveWardrobeBodyProfileId,
  wardrobeBodyOwnerId,
} from "../lib/wardrobeBodyProfiles";

// A companion sharing another's model (Hikari is the angel first ingested as Matilda) is classified by that body.
const BODY_OWNER_IDS = [...new Set(COMPANION_MANIFEST.map((entry) => wardrobeBodyOwnerId(entry.id)))].sort();

describe("wardrobe body profiles", () => {
  it("classifies every showroom companion and both of its model contracts", () => {
    expect(Object.keys(WARDROBE_COMPANION_BODY_ASSIGNMENTS).sort()).toEqual(BODY_OWNER_IDS);

    for (const entry of COMPANION_MANIFEST) {
      const assignment = WARDROBE_COMPANION_BODY_ASSIGNMENTS[wardrobeBodyOwnerId(entry.id)];
      expect(assignment?.activeModelUrl).toBe(
        entry.companionConfig?.vrmUrl ?? entry.vrmUrl,
      );
      // Elli and Matilda share the starter model as their active body (owner 2026-11-11).
      expect([assignment?.activeModelUrl, assignment?.sourceModelUrl]).toContain(entry.vrmUrl);
      expect(WARDROBE_BODY_PROFILES[assignment!.activeBodyProfileId]).toBeTruthy();
      expect(WARDROBE_BODY_PROFILES[assignment!.sourceBodyProfileId]).toBeTruthy();
    }
  });

  it("uses each companion complete prepared asset without tint or substituted geometry",()=>{
    for(const entry of COMPANION_MANIFEST){const presentation=resolvePreparedWardrobePresentation(entry.id);expect(presentation?.bodyModelUrl).toContain("/companions/"+wardrobeBodyOwnerId(entry.id)+"-wardrobe-");expect(presentation).not.toHaveProperty("identityModelUrl");expect(presentation).not.toHaveProperty("bodySkinTint");}
    expect(resolvePreparedWardrobePresentation("unknown")).toBeNull();
  });

  it("keeps unknown or unreviewed models outside approved store profiles", () => {
    expect(resolveWardrobeBodyProfileId("/companions/sample.vrm")).toBe(
      "sunny-standard-v1",
    );
    expect(resolveWardrobeBodyProfileId("/companions/Kefla.vrm")).toBe("kefla-v1");
    expect(resolveWardrobeBodyProfileId("/companions/unknown.vrm")).toBeNull();
  });

  it("pairs every prepared candidate with its own original reference",()=>{
    expect(WARDROBE_COMPATIBILITY_CASES).toHaveLength(BODY_OWNER_IDS.length*2);
    for(const id of BODY_OWNER_IDS){
      const prepared=WARDROBE_COMPATIBILITY_CASES.find(c=>c.companionId===id&&c.kind==='prepared');
      const original=WARDROBE_COMPATIBILITY_CASES.find(c=>c.companionId===id&&c.kind==='source');
      expect(prepared?.sourceModelUrl).toBe(original?.modelUrl);expect(prepared?.dressQaStatus).toBe('candidate');
    }
  });
});
it('offers only complete native prepared identities and original references in the compatibility lab',()=>{
 expect(WARDROBE_COMPATIBILITY_CASES.filter(c=>c.kind==='prepared')).toHaveLength(8);
 expect(WARDROBE_COMPATIBILITY_CASES.some(c=>String(c.kind)==='standardized_identity')).toBe(false);
 for(const c of WARDROBE_COMPATIBILITY_CASES)expect(c).not.toHaveProperty("identityModelUrl");
});
