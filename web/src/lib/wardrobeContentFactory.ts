export type WardrobeContentQa =
  | { status: "candidate" }
  | { status: "rejected"; reason: string }
  | { status: "approved" };

export type WardrobeSilhouetteTemplate = {
  id: string;
  outfitId: string;
  icon: string;
  compatibility:
    | { kind: "universal" }
    | { kind: "approved_models"; modelUrls: readonly string[] };
  qa:
    | Exclude<WardrobeContentQa, { status: "approved" }>
    | {
        status: "approved";
        approvedAvatarUrls: readonly string[];
      };
};

export type WardrobeMaterialVariant = {
  tint: string;
};

export type WardrobeGarmentVariant = {
  id: string;
  templateId: string;
  name: string;
  price: number;
  styleTags: readonly string[];
  material: WardrobeMaterialVariant;
  qa: WardrobeContentQa;
};

export type WardrobeVariantCatalogItem = {
  id: string;
  templateId: string;
  name: string;
  icon: string;
  price: number;
  styleTags: readonly string[];
  asset: {
    kind: "outfit";
    outfitId: string;
    fit: "skinned_xwear";
    materialVariant: WardrobeMaterialVariant & { id: string };
  };
  compatibility: WardrobeSilhouetteTemplate["compatibility"];
};

export function createWardrobeVariantCatalog(input: {
  templates: readonly WardrobeSilhouetteTemplate[];
  variants: readonly WardrobeGarmentVariant[];
}): WardrobeVariantCatalogItem[] {
  const approvedTemplates = new Map(
    input.templates
      .filter((template) => template.qa.status === "approved")
      .map((template) => [template.id, template] as const),
  );

  return input.variants.flatMap((variant) => {
    if (variant.qa.status !== "approved") return [];

    const template = approvedTemplates.get(variant.templateId);
    if (!template) return [];

    return [
      {
        id: variant.id,
        templateId: template.id,
        name: variant.name,
        icon: template.icon,
        price: variant.price,
        styleTags: variant.styleTags,
        asset: {
          kind: "outfit" as const,
          outfitId: template.outfitId,
          fit: "skinned_xwear" as const,
          materialVariant: {
            id: variant.id,
            ...variant.material,
          },
        },
        compatibility: template.compatibility,
      },
    ];
  });
}
