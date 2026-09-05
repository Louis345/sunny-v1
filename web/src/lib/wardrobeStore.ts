import { createWardrobeVariantCatalog } from "./wardrobeContentFactory";
import {
  resolveWardrobeBodyProfileId,
  resolveWardrobeTemplateCertification,
  isWardrobePairApproved,
} from "./wardrobeBodyProfiles";
import preparedBodies from './wardrobePrepared.generated.json';
import fittedGarments from './wardrobeFitted.generated.json';
import assetVersions from './wardrobeAssetVersions.generated.json';

export type WardrobeAccessoryId = "none" | "crown" | "cat-ears" | "halo";
export type WardrobeOutfitId =
  | "none"
  | "sleeveless-dress"
  | "comet-hoodie"
  | "constellation-blazer";

export type WardrobeSelection = {
  accessoryId: WardrobeAccessoryId;
  outfitId: WardrobeOutfitId;
  outfitMaterialVariant?: {
    id: string;
    tint: string;
  };
};

type WardrobeAsset =
  | {
      kind: "accessory";
      accessoryId: Exclude<WardrobeAccessoryId, "none">;
    }
  | {
      kind: "outfit";
      outfitId: Exclude<WardrobeOutfitId, "none">;
      fit: "skinned_xwear";
      materialVariant: {
        id: string;
        tint: string;
      };
    };

type WardrobeCompatibility =
  | { kind: "universal" }
  | { kind: "approved_body_profiles"; bodyProfileIds: readonly string[] };

export type WardrobeStoreItem = {
  id: string;
  templateId?: string;
  name: string;
  icon: string;
  price: number;
  styleTags: readonly string[];
  asset: WardrobeAsset;
  compatibility: WardrobeCompatibility;
};

const RIBBON_DRESS_VARIANTS = createWardrobeVariantCatalog({
  templates: [
    {
      id: "ribbon-dress",
      outfitId: "sleeveless-dress",
      icon: "👗",
      compatibility: {
        kind: "approved_body_profiles",
        bodyProfileIds: ["sunny-standard-v1", "vroid-slim-v1"],
      },
      qa: {
        status: "approved",
        approvedBodyProfileIds: ["sunny-standard-v1"],
      },
    },
  ],
  variants: [
    {
      id: "sleeveless-dress",
      templateId: "ribbon-dress",
      name: "Navy Ribbon Dress",
      price: 60,
      styleTags: ["elegant", "navy", "classic", "ribbon"],
      material: { tint: "#ffffff" },
      qa: { status: "approved" },
    },
    {
      id: "plum-ribbon-dress",
      templateId: "ribbon-dress",
      name: "Plum Ribbon Dress",
      price: 65,
      styleTags: ["elegant", "purple", "magical", "ribbon"],
      material: { tint: "#c878ff" },
      qa: { status: "approved" },
    },
    {
      id: "teal-ribbon-dress",
      templateId: "ribbon-dress",
      name: "Teal Ribbon Dress",
      price: 60,
      styleTags: ["playful", "teal", "bright", "ribbon"],
      material: { tint: "#64ffd2" },
      qa: { status: "approved" },
    },
    {
      id: "rose-ribbon-dress",
      templateId: "ribbon-dress",
      name: "Rose Ribbon Dress",
      price: 65,
      styleTags: ["cute", "rose", "sparkly", "ribbon"],
      material: { tint: "#ff8fb2" },
      qa: { status: "approved" },
    },
  ],
});

export const WARDROBE_STORE_CATALOG: readonly WardrobeStoreItem[] = [
  {
    id: "royal-crown",
    name: "Royal Crown",
    icon: "👑",
    price: 20,
    styleTags: ["gold", "royal", "sparkly", "bold"],
    asset: { kind: "accessory", accessoryId: "crown" },
    compatibility: { kind: "universal" },
  },
  {
    id: "cat-ears",
    name: "Cat Ears",
    icon: "🐱",
    price: 15,
    styleTags: ["cute", "playful", "purple", "magical"],
    asset: { kind: "accessory", accessoryId: "cat-ears" },
    compatibility: { kind: "universal" },
  },
  {
    id: "star-halo",
    name: "Star Halo",
    icon: "✨",
    price: 25,
    styleTags: ["celestial", "sparkly", "gold", "magical"],
    asset: { kind: "accessory", accessoryId: "halo" },
    compatibility: { kind: "universal" },
  },
  ...RIBBON_DRESS_VARIANTS,
  ...([
    {id: "comet-hoodie", name: "Comet Hoodie", icon: "🧥"},
    {id: "constellation-blazer", name: "Constellation Blazer", icon: "🧥"},
  ] as const).map(candidate => ({
    ...candidate,
    templateId: candidate.id,
    price: 0, // Diagnostic candidate; pricing and store entry require review.
    styleTags: ["candidate"],
    asset: {kind: "outfit" as const, outfitId: candidate.id, fit: "skinned_xwear" as const,
      materialVariant: {id:candidate.id,tint:"#ffffff"}},
    compatibility: {kind: "approved_body_profiles" as const,bodyProfileIds:["sunny-standard-v1","vroid-slim-v1"]},
  })),
] as const;

export type CompanionStoreDesire = {
  id: string;
  label: string;
  styleTags: readonly string[];
  matchingItemIds: readonly string[];
};

type CompanionStoreProfile = {
  favoriteStyleTags: readonly string[];
  desires: readonly CompanionStoreDesire[];
};

const COMPANION_STORE_PROFILES: Readonly<Record<string, CompanionStoreProfile>> = {
  elli: {
    favoriteStyleTags: ["celestial", "sparkly", "magical", "purple"],
    desires: [
      {
        id: "elli-celestial-headpiece",
        label: "a celestial headpiece",
        styleTags: ["celestial", "sparkly"],
        matchingItemIds: ["star-halo"],
      },
      {
        id: "elli-elegant-outfit",
        label: "an elegant new outfit",
        styleTags: ["elegant", "dress"],
        matchingItemIds: ["sleeveless-dress"],
      },
    ],
  },
  matilda: {
    favoriteStyleTags: ["classic", "elegant", "blue", "magical"],
    desires: [
      {
        id: "matilda-elegant-outfit",
        label: "a clever, classic outfit",
        styleTags: ["classic", "elegant"],
        matchingItemIds: ["sleeveless-dress"],
      },
      {
        id: "matilda-magical-accessory",
        label: "one magical finishing touch",
        styleTags: ["magical"],
        matchingItemIds: ["star-halo", "cat-ears"],
      },
    ],
  },
  kefla: {
    favoriteStyleTags: ["bold", "gold", "heroic"],
    desires: [
      {
        id: "kefla-bold-crown",
        label: "something bold and gold",
        styleTags: ["bold", "gold"],
        matchingItemIds: ["royal-crown"],
      },
    ],
  },
  melty: {
    favoriteStyleTags: ["cute", "playful", "sparkly"],
    desires: [
      {
        id: "melty-playful-ears",
        label: "a playful new accessory",
        styleTags: ["cute", "playful"],
        matchingItemIds: ["cat-ears"],
      },
    ],
  },
  princess: {
    favoriteStyleTags: ["royal", "gold", "elegant"],
    desires: [
      {
        id: "princess-royal-crown",
        label: "a royal golden crown",
        styleTags: ["royal", "gold"],
        matchingItemIds: ["royal-crown"],
      },
    ],
  },
  tene: {
    favoriteStyleTags: ["celestial", "bold", "purple"],
    desires: [
      {
        id: "tene-celestial-halo",
        label: "a bright cosmic accessory",
        styleTags: ["celestial", "bold"],
        matchingItemIds: ["star-halo"],
      },
    ],
  },
  towa: {
    favoriteStyleTags: ["playful", "magical", "purple"],
    desires: [
      {
        id: "towa-magical-ears",
        label: "something quietly magical",
        styleTags: ["magical", "purple"],
        matchingItemIds: ["cat-ears"],
      },
    ],
  },
  yukari: {
    favoriteStyleTags: ["cute", "purple", "magical"],
    desires: [
      {
        id: "yukari-cat-ears",
        label: "cat ears with extra personality",
        styleTags: ["cute", "purple"],
        matchingItemIds: ["cat-ears"],
      },
    ],
  },
};

const DEFAULT_STORE_PROFILE: CompanionStoreProfile = {
  favoriteStyleTags: ["magical"],
  desires: [
    {
      id: "default-magical-accessory",
      label: "a magical accessory",
      styleTags: ["magical"],
      matchingItemIds: ["star-halo", "cat-ears"],
    },
  ],
};

export type WardrobeOpinionVerdict = "love" | "like" | "unsure" | "reject";

export type CompanionShoppingMood = {
  id: string;
  label: string;
  favoredStyleTags: readonly string[];
  avoidedStyleTags: readonly string[];
};

export type CompanionItemOpinion = {
  verdict: WardrobeOpinionVerdict;
  reasons: string[];
  companionConsentsToWear: boolean;
};

export type CompanionShoppingVisit = {
  id: string;
  companionId: string;
  mood: CompanionShoppingMood;
  itemOpinions: Record<string, CompanionItemOpinion>;
};

const COMPANION_SHOPPING_MOODS: readonly CompanionShoppingMood[] = [
  {
    id: "dreamy",
    label: "dreamy and cosmic",
    favoredStyleTags: ["celestial", "magical", "sparkly", "purple"],
    avoidedStyleTags: ["classic", "royal"],
  },
  {
    id: "adventurous",
    label: "bold and adventurous",
    favoredStyleTags: ["bold", "heroic", "playful", "gold"],
    avoidedStyleTags: ["classic", "elegant"],
  },
  {
    id: "polished",
    label: "polished and elegant",
    favoredStyleTags: ["elegant", "classic", "royal", "blue"],
    avoidedStyleTags: ["playful", "heroic"],
  },
  {
    id: "whimsical",
    label: "cute and whimsical",
    favoredStyleTags: ["cute", "playful", "magical", "sparkly"],
    avoidedStyleTags: ["bold", "classic"],
  },
] as const;

function stableWardrobeHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function matchingTags(
  item: WardrobeStoreItem,
  candidates: readonly string[],
): string[] {
  const candidateSet = new Set(candidates);
  return item.styleTags.filter((tag) => candidateSet.has(tag));
}

/**
 * Creates code-owned companion opinions for one store visit. The seed makes
 * the mood and verdicts stable during that visit while allowing a later visit
 * to feel different. The lowest-ranked 40% are genuine refusals, with at
 * least one compatible choice always left available.
 */
export function createCompanionShoppingVisit(input: {
  companionId: string;
  items: readonly WardrobeStoreItem[];
  state: WardrobeStoreState;
  visitSeed: string;
}): CompanionShoppingVisit {
  const profile = COMPANION_STORE_PROFILES[input.companionId] ?? DEFAULT_STORE_PROFILE;
  const mood =
    COMPANION_SHOPPING_MOODS[
      stableWardrobeHash(`${input.companionId}:${input.visitSeed}`) %
        COMPANION_SHOPPING_MOODS.length
    ];
  const desire = resolveCompanionStoreDesire(input.companionId, input.state);
  const ranked = input.items
    .map((item) => {
      const favoriteMatches = matchingTags(item, profile.favoriteStyleTags);
      const moodMatches = matchingTags(item, mood.favoredStyleTags);
      const moodConflicts = matchingTags(item, mood.avoidedStyleTags);
      const desireMatch = desire.matchingItemIds.includes(item.id);
      const score =
        (desireMatch ? 4 : 0) +
        favoriteMatches.length * 2 +
        moodMatches.length * 3 -
        moodConflicts.length * 4 +
        (input.state.ownedItemIds.includes(item.id) ? 0.75 : 0) +
        (input.state.savedItemIds.includes(item.id) ? 0.5 : 0) +
        (stableWardrobeHash(`${input.visitSeed}:${item.id}`) % 100) / 100;
      return {
        item,
        score,
        desireMatch,
        favoriteMatches,
        moodMatches,
        moodConflicts,
      };
    })
    .sort((left, right) => left.score - right.score || left.item.id.localeCompare(right.item.id));
  const rejectionCount =
    ranked.length <= 1
      ? 0
      : Math.min(ranked.length - 1, Math.max(1, Math.round(ranked.length * 0.4)));
  const rejectedItemIds = new Set(
    ranked.slice(0, rejectionCount).map(({ item }) => item.id),
  );
  const highestAcceptedScore = ranked
    .filter(({ item }) => !rejectedItemIds.has(item.id))
    .reduce((highest, { score }) => Math.max(highest, score), Number.NEGATIVE_INFINITY);
  const itemOpinions: Record<string, CompanionItemOpinion> = {};

  for (const entry of ranked) {
    const rejected = rejectedItemIds.has(entry.item.id);
    const verdict: WardrobeOpinionVerdict = rejected
      ? "reject"
      : entry.score === highestAcceptedScore
        ? "love"
        : entry.score >= 3
          ? "like"
          : "unsure";
    const reasons = rejected
      ? entry.moodConflicts.length > 0
        ? [`not feeling ${entry.moodConflicts[0]} today`]
        : [`wants something more ${mood.favoredStyleTags[0]} today`]
      : entry.desireMatch
        ? ["matches the current wish"]
        : entry.moodMatches.length > 0
          ? [`in a ${entry.moodMatches[0]} mood`]
          : entry.favoriteMatches.length > 0
            ? [`always likes ${entry.favoriteMatches[0]}`]
            : ["curious about a different style"];
    itemOpinions[entry.item.id] = {
      verdict,
      reasons,
      companionConsentsToWear: !rejected,
    };
  }

  return {
    id: `wardrobe-visit-${stableWardrobeHash(`${input.companionId}:${input.visitSeed}`).toString(36)}`,
    companionId: input.companionId,
    mood,
    itemOpinions,
  };
}

export type WardrobeLedgerEntry = {
  id: string;
  type: "opening_credit" | "purchase";
  amount: number;
  itemId?: string;
  companionId?: string;
  occurredAt: string;
};

export type WardrobePreferenceEvent = {
  id: string;
  companionId: string;
  itemId: string;
  action: "previewed" | "purchased" | "equipped" | "left_try_on";
  evidenceStream: "engagement" | "companion";
  occurredAt: string;
};

export type EquippedWardrobe = {
  accessoryItemId?: string;
  outfitItemId?: string;
};

export type WardrobeStoreState = {
  version: 1;
  ledger: WardrobeLedgerEntry[];
  ownedItemIds: string[];
  savedItemIds: string[];
  equippedByCompanion: Record<string, EquippedWardrobe>;
  preferenceEvents: WardrobePreferenceEvent[];
};

export const WARDROBE_STORE_STORAGE_KEY = "sunny:wardrobe-store-lab:v1";

export function createInitialWardrobeStoreState(
  options: { initialCoins?: number } = {},
): WardrobeStoreState {
  const initialCoins = Math.max(0, Math.floor(options.initialCoins ?? 100));
  return {
    version: 1,
    ledger: [
      {
        id: "store-lab-opening-credit",
        type: "opening_credit",
        amount: initialCoins,
        occurredAt: "2026-08-08T00:00:00.000Z",
      },
    ],
    ownedItemIds: [],
    savedItemIds: [],
    equippedByCompanion: {},
    preferenceEvents: [],
  };
}

export function isWardrobeStoreItemCompatible(
  item: WardrobeStoreItem,
  companionModelUrl: string,
  companionId: string,
) {
  const bodyProfileId = resolveWardrobeBodyProfileId(companionModelUrl);
  const bodyCompatible =
    item.compatibility.kind === "universal" ||
    (bodyProfileId !== null &&
      item.compatibility.bodyProfileIds.includes(bodyProfileId));
  if (!bodyCompatible) return false;
  const templateId = item.templateId ?? (item.asset.kind === "accessory" ? item.id : null);
  if (!templateId) return false;
  return (
    resolveWardrobeTemplateCertification(companionId, templateId, companionModelUrl).status ===
    "approved"
  );
}

export function getCompatibleWardrobeItems(
  catalog: readonly WardrobeStoreItem[],
  companionModelUrl: string,
  companionId: string,
) {
  return catalog.filter((item) =>
    isWardrobeStoreItemCompatible(item, companionModelUrl, companionId),
  );
}

export function getWardrobeBalance(state: WardrobeStoreState) {
  return state.ledger.reduce((total, entry) => total + entry.amount, 0);
}

function getWardrobeStoreItem(itemId: string) {
  return WARDROBE_STORE_CATALOG.find((item) => item.id === itemId);
}

export function getWardrobePairVersion(companionId:string,modelUrl:string,outfitItemId:string,accessoryItemId:string){
 const body=preparedBodies.find(b=>b.companionId===companionId&&b.modelUrl===modelUrl),outfit=getWardrobeStoreItem(outfitItemId),accessory=getWardrobeStoreItem(accessoryItemId);
 if(!body||outfit?.asset.kind!=='outfit'||accessory?.asset.kind!=='accessory')return '';
 const outfitVersion=(assetVersions as Record<string,string>)[outfit.templateId??''],accessoryVersion=(assetVersions as Record<string,string>)[accessory.templateId??accessory.id];
 const outfitId=outfit.asset.outfitId;
 const fit=fittedGarments.find(f=>f.companionId===companionId&&f.outfitId===outfitId&&f.bodySha256===body.preparedSha256&&f.sourceVersion===outfitVersion);
 if(!fit||!accessoryVersion)return '';
 return JSON.stringify({modelUrl,body:body.preparedSha256,recipe:body.recipeVersion,outfitItemId,accessoryItemId,outfitVersion,fit:fit.sha256,variant:outfit.asset.materialVariant,accessoryVersion});
}

function isEquippedPairApproved(companionId:string,modelUrl:string,equipped:EquippedWardrobe){
 if(!equipped.outfitItemId||!equipped.accessoryItemId)return true;
 return isWardrobePairApproved(companionId,equipped.outfitItemId,equipped.accessoryItemId,getWardrobePairVersion(companionId,modelUrl,equipped.outfitItemId,equipped.accessoryItemId));
}

export type WardrobePurchaseStatus =
  | "purchased"
  | "duplicate"
  | "already_owned"
  | "item_not_found"
  | "incompatible"
  | "insufficient_funds";

export function purchaseWardrobeItem(
  state: WardrobeStoreState,
  input: {
    itemId: string;
    companionId: string;
    companionModelUrl: string;
    transactionId: string;
    occurredAt: string;
  },
): { state: WardrobeStoreState; status: WardrobePurchaseStatus } {
  if (state.ledger.some((entry) => entry.id === input.transactionId)) {
    return { state, status: "duplicate" };
  }
  const item = getWardrobeStoreItem(input.itemId);
  if (!item) return { state, status: "item_not_found" };
  if (!isWardrobeStoreItemCompatible(item, input.companionModelUrl, input.companionId)) {
    return { state, status: "incompatible" };
  }
  if (state.ownedItemIds.includes(item.id)) {
    return { state, status: "already_owned" };
  }
  if (getWardrobeBalance(state) < item.price) {
    return { state, status: "insufficient_funds" };
  }
  return {
    status: "purchased",
    state: {
      ...state,
      ledger: [
        ...state.ledger,
        {
          id: input.transactionId,
          type: "purchase",
          amount: -item.price,
          itemId: item.id,
          companionId: input.companionId,
          occurredAt: input.occurredAt,
        },
      ],
      ownedItemIds: [...state.ownedItemIds, item.id],
      savedItemIds: state.savedItemIds.filter((itemId) => itemId !== item.id),
    },
  };
}

export type WardrobeSaveStatus =
  | "saved"
  | "already_saved"
  | "already_owned"
  | "item_not_found"
  | "incompatible";

export function saveWardrobeItemForLater(
  state: WardrobeStoreState,
  itemId: string,
  companionModelUrl: string,
  companionId: string,
): { state: WardrobeStoreState; status: WardrobeSaveStatus } {
  const item = getWardrobeStoreItem(itemId);
  if (!item) return { state, status: "item_not_found" };
  if (!isWardrobeStoreItemCompatible(item, companionModelUrl, companionId)) {
    return { state, status: "incompatible" };
  }
  if (state.ownedItemIds.includes(itemId)) {
    return { state, status: "already_owned" };
  }
  if (state.savedItemIds.includes(itemId)) {
    return { state, status: "already_saved" };
  }
  return {
    status: "saved",
    state: { ...state, savedItemIds: [...state.savedItemIds, itemId] },
  };
}

export type WardrobeEquipStatus =
  | "equipped"
  | "not_owned"
  | "item_not_found"
  | "incompatible";

export function equipWardrobeItem(
  state: WardrobeStoreState,
  companionId: string,
  itemId: string,
  companionModelUrl: string,
): { state: WardrobeStoreState; status: WardrobeEquipStatus } {
  const item = getWardrobeStoreItem(itemId);
  if (!item) return { state, status: "item_not_found" };
  if (!state.ownedItemIds.includes(itemId)) {
    return { state, status: "not_owned" };
  }
  if (!isWardrobeStoreItemCompatible(item, companionModelUrl, companionId)) {
    return { state, status: "incompatible" };
  }

  const previous = state.equippedByCompanion[companionId] ?? {};
  const equipped =
    item.asset.kind === "accessory"
      ? { ...previous, accessoryItemId: item.id }
      : { ...previous, outfitItemId: item.id };
  if(!isEquippedPairApproved(companionId,companionModelUrl,equipped)){
    console.warn(` 🎮 [wardrobe-store] equip rejected companion=${companionId} reason=uncertified_pair`);
    return {state,status:'incompatible'};
  }
  return {
    status: "equipped",
    state: {
      ...state,
      equippedByCompanion: {
        ...state.equippedByCompanion,
        [companionId]: equipped,
      },
    },
  };
}

export function clearEquippedWardrobe(
  state: WardrobeStoreState,
  companionId: string,
): WardrobeStoreState {
  const equippedByCompanion = { ...state.equippedByCompanion };
  delete equippedByCompanion[companionId];
  return { ...state, equippedByCompanion };
}

function selectionFromItem(
  selection: WardrobeSelection,
  item: WardrobeStoreItem | undefined,
): WardrobeSelection {
  if (!item) return selection;
  return item.asset.kind === "accessory"
    ? { ...selection, accessoryId: item.asset.accessoryId }
    : {
        ...selection,
        outfitId: item.asset.outfitId,
        outfitMaterialVariant: item.asset.materialVariant,
      };
}

export function resolveWardrobeItemSelection(
  item: WardrobeStoreItem,
): WardrobeSelection {
  return selectionFromItem(
    { accessoryId: "none", outfitId: "none" },
    item,
  );
}

export function resolveEquippedWardrobeSelection(
  state: WardrobeStoreState,
  companionId: string,
  companionModelUrl: string,
): WardrobeSelection {
  const equipped = state.equippedByCompanion[companionId];
  const empty: WardrobeSelection = { accessoryId: "none", outfitId: "none" };
  if (!equipped) return empty;
  if(!isEquippedPairApproved(companionId,companionModelUrl,equipped))return empty;
  const accessory = getWardrobeStoreItem(equipped.accessoryItemId ?? "");
  const outfit = getWardrobeStoreItem(equipped.outfitItemId ?? "");
  const compatibleAccessory =
    accessory && isWardrobeStoreItemCompatible(accessory, companionModelUrl, companionId)
      ? accessory
      : undefined;
  const compatibleOutfit =
    outfit && isWardrobeStoreItemCompatible(outfit, companionModelUrl, companionId)
      ? outfit
      : undefined;
  return selectionFromItem(
    selectionFromItem(empty, compatibleAccessory),
    compatibleOutfit,
  );
}

export function isWardrobeOutfitCompatible(
  outfitId: WardrobeOutfitId,
  companionModelUrl: string,
  companionId: string,
) {
  if (outfitId === "none") return true;
  const item = WARDROBE_STORE_CATALOG.find(
    (candidate) =>
      candidate.asset.kind === "outfit" &&
      candidate.asset.outfitId === outfitId,
  );
  return Boolean(
    item && isWardrobeStoreItemCompatible(item, companionModelUrl, companionId),
  );
}

export function resolveCompanionStoreDesire(
  companionId: string,
  state: WardrobeStoreState,
): CompanionStoreDesire {
  const profile = COMPANION_STORE_PROFILES[companionId] ?? DEFAULT_STORE_PROFILE;
  const active = profile.desires.find((desire) =>
    desire.matchingItemIds.every(
      (itemId) => !state.ownedItemIds.includes(itemId),
    ),
  );
  return (
    active ?? {
      id: `${companionId}-explore-new-style`,
      label: "something that feels new",
      styleTags: profile.favoriteStyleTags,
      matchingItemIds: [],
    }
  );
}

export function recordWardrobeInteraction(
  state: WardrobeStoreState,
  event: WardrobePreferenceEvent,
): WardrobeStoreState {
  if (state.preferenceEvents.some((candidate) => candidate.id === event.id)) {
    return state;
  }
  return {
    ...state,
    preferenceEvents: [...state.preferenceEvents, event],
  };
}

export function parseWardrobeStoreState(value: unknown): WardrobeStoreState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WardrobeStoreState>;
  const valid =
    candidate.version === 1 &&
    Array.isArray(candidate.ledger) &&
    Array.isArray(candidate.ownedItemIds) &&
    Boolean(candidate.equippedByCompanion) &&
    Array.isArray(candidate.preferenceEvents);
  if (!valid) return null;
  return {
    version: 1,
    ledger: candidate.ledger ?? [],
    ownedItemIds: candidate.ownedItemIds ?? [],
    savedItemIds: Array.isArray(candidate.savedItemIds) ? candidate.savedItemIds : [],
    equippedByCompanion: candidate.equippedByCompanion ?? {},
    preferenceEvents: candidate.preferenceEvents ?? [],
  };
}

export function isWardrobeStoreState(value: unknown): value is WardrobeStoreState {
  return parseWardrobeStoreState(value) !== null;
}
