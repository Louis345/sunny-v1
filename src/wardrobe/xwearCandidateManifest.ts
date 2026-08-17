import { z } from "zod";

export const WARDROBE_CLOTHING_SLOTS = [
  "top",
  "bottom",
  "onepiece",
  "outerwear",
  "shoes",
] as const;

const baseClothingSlotSchema = z.enum(["top", "bottom", "onepiece"]);
const clothingSlotSchema = z.enum(WARDROBE_CLOTHING_SLOTS);

const candidateInputSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(8),
  price: z.number().int().min(0).max(10_000),
  styleTags: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
  occupies: z.array(clothingSlotSchema).min(1),
  replaces: z.array(baseClothingSlotSchema),
  source: z.object({
    creator: z.string().trim().min(1).max(120),
    url: z.string().url(),
    licenseNotes: z.string().trim().min(1).max(1_000),
  }),
});

export type WardrobeCandidateManifest = z.infer<typeof candidateInputSchema> & {
  qa: { status: "candidate" };
  publishable: false;
};

export function parseWardrobeCandidateManifest(
  input: unknown,
): WardrobeCandidateManifest {
  const parsed = candidateInputSchema.parse(input);
  return {
    ...parsed,
    styleTags: [...new Set(parsed.styleTags)],
    occupies: [...new Set(parsed.occupies)],
    replaces: [...new Set(parsed.replaces)],
    qa: { status: "candidate" },
    publishable: false,
  };
}

const REQUIRED_XWEAR_PREFIXES = [
  "Mesh/",
  "Body/XResources/",
  "Body/XItem.json/",
] as const;

export function inspectXwearArchiveEntries(entries: readonly string[]) {
  const normalized = entries.map((entry) => entry.replaceAll("\\", "/"));
  const missing = REQUIRED_XWEAR_PREFIXES.filter(
    (prefix) => !normalized.some((entry) => entry.startsWith(prefix)),
  );
  return { ok: missing.length === 0, missing } as const;
}
