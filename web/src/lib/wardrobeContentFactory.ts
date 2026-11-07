export type WardrobeContentQa =
  | { status: "candidate" }
  | { status: "rejected"; reason: string }
  | { status: "approved" };

export type WardrobeSilhouetteTemplate<TOutfitId extends string = string> = {
  id: string;
  outfitId: TOutfitId;
  icon: string;
  compatibility:
    | { kind: "universal" }
    | { kind: "approved_body_profiles"; bodyProfileIds: readonly string[] };
  qa:
    | Exclude<WardrobeContentQa, { status: "approved" }>
    | {
        status: "approved";
        approvedBodyProfileIds: readonly string[];
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

export type WardrobeVariantCatalogItem<TOutfitId extends string = string> = {
  id: string;
  templateId: string;
  name: string;
  icon: string;
  price: number;
  styleTags: readonly string[];
  asset: {
    kind: "outfit";
    outfitId: TOutfitId;
    fit: "skinned_xwear";
    materialVariant: WardrobeMaterialVariant & { id: string };
  };
  compatibility: WardrobeSilhouetteTemplate["compatibility"];
};

export function createWardrobeVariantCatalog<const TOutfitId extends string>(input: {
  templates: readonly WardrobeSilhouetteTemplate<TOutfitId>[];
  variants: readonly WardrobeGarmentVariant[];
}): WardrobeVariantCatalogItem<TOutfitId>[] {
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
