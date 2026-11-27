import { describe, expect, it } from "vitest";
import { createWardrobeVariantCatalog } from "../lib/wardrobeContentFactory";

const approvedTemplate = (id: string, outfitId: string) => ({
  id,
  outfitId,
  icon: "👗",
  compatibility: {
    kind: "approved_body_profiles" as const,
    bodyProfileIds: ["sunny-standard-v1"],
  },
  qa: {
    status: "approved" as const,
    approvedBodyProfileIds: ["sunny-standard-v1"],
  },
});

const approvedVariants = (templateId: string) =>
  [
    ["midnight", "Midnight", "#202844"],
    ["starlight", "Starlight", "#eee9ff"],
    ["berry", "Berry", "#8e3f70"],
    ["sunrise", "Sunrise", "#e58d55"],
  ].map(([id, label, tint], index) => ({
    id: `${templateId}-${id}`,
    templateId,
    name: `${label} ${templateId}`,
    price: 40 + index * 5,
    styleTags: [id, templateId],
    material: { tint },
    qa: { status: "approved" as const },
  }));

describe("wardrobe content factory", () => {
  it("expands three independently approved silhouettes into twelve sellable variants", () => {
    const templates = [
      approvedTemplate("dress", "sleeveless-dress"),
      approvedTemplate("hoodie", "comet-hoodie"),
      approvedTemplate("hero-suit", "galaxy-hero-suit"),
    ];

    const items = createWardrobeVariantCatalog({
      templates,
      variants: templates.flatMap((template) => approvedVariants(template.id)),
    });

    expect(items).toHaveLength(12);
    expect(new Set(items.map((item) => item.templateId))).toEqual(
      new Set(["dress", "hoodie", "hero-suit"]),
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(12);
    expect(
      items.every(
        (item) =>
          item.asset.kind === "outfit" &&
          item.asset.fit === "skinned_xwear" &&
          item.asset.materialVariant.tint.length > 0,
      ),
    ).toBe(true);
  });

  it("never publishes a variant unless both its silhouette and variant passed QA", () => {
    const candidateTemplate = {
      ...approvedTemplate("candidate-jacket", "candidate-jacket"),
      qa: { status: "candidate" as const },
    };
    const approvedDress = approvedTemplate("dress", "sleeveless-dress");
    const [approved, candidate, rejected] = approvedVariants("dress");

    const items = createWardrobeVariantCatalog({
      templates: [approvedDress, candidateTemplate],
      variants: [
        approved,
        { ...candidate, qa: { status: "candidate" as const } },
        {
          ...rejected,
          qa: { status: "rejected" as const, reason: "Visual clipping" },
        },
        ...approvedVariants("candidate-jacket"),
      ],
    });

    expect(items.map((item) => item.id)).toEqual([approved.id]);
  });
});
