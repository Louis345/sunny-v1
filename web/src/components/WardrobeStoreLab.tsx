import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  WARDROBE_STORE_CATALOG,
  WARDROBE_STORE_STORAGE_KEY,
  clearEquippedWardrobe,
  createCompanionShoppingVisit,
  createInitialWardrobeStoreState,
  equipWardrobeItem,
  getCompatibleWardrobeItems,
  getWardrobeBalance,
  parseWardrobeStoreState,
  purchaseWardrobeItem,
  recordWardrobeInteraction,
  resolveCompanionStoreDesire,
  resolveEquippedWardrobeSelection,
  resolveWardrobeItemSelection,
  saveWardrobeItemForLater,
  type WardrobeSelection,
  type CompanionItemOpinion,
  type CompanionShoppingVisit,
  type WardrobeStoreItem,
  type WardrobeStoreState,
} from "../lib/wardrobeStore";
import "./WardrobeStoreLab.css";

export type WardrobeStoreCompanion = {
  id: string;
  name: string;
  modelUrl: string;
};

export type WardrobeShoppingContext = {
  mode: "entrance" | "review" | "try_on";
  visitId: string;
  walletBalance: number;
  companionWish: string;
  companionMood: { id: string; label: string };
  selectedItem: {
    id: string;
    name: string;
    price: number;
    category: "accessory" | "outfit";
    styleTags: string[];
    owned: boolean;
    saved: boolean;
    preferenceMatch: boolean;
    opinionVerdict: "love" | "like" | "unsure" | "reject";
    opinionReasons: string[];
    companionConsentsToWear: boolean;
  } | null;
  ownedItemIds: string[];
  savedItemIds: string[];
};

export type WardrobeShoppingEvent = {
  type: "item_reviewed" | "try_on_started";
  itemId: string;
};

export type WardrobeStoreCall = {
  talkPhase: "idle" | "listening" | "thinking" | "speaking";
  responseText: string;
  error: string | null;
  onAskVoice: () => void;
};

export type WardrobeStoreLabProps = {
  companion: WardrobeStoreCompanion;
  companionPreview?:
    | ReactNode
    | ((view: "full_body" | "portrait") => ReactNode);
  call?: WardrobeStoreCall;
  onWardrobeChange: (selection: WardrobeSelection) => void;
  onShoppingContextChange?: (context: WardrobeShoppingContext) => void;
  onCompanionReaction?: (
    event: WardrobeShoppingEvent,
    context: WardrobeShoppingContext,
  ) => void;
  onExit: () => void;
  exitLabel?: string;
  visitSeed?: string;
};

type ShopMode = "entrance" | "review" | "try-on";
type ShopFilter = "all" | "accessories" | "outfits";

type PurchaseConfirmation = {
  item: WardrobeStoreItem;
  balanceBefore: number;
  balanceAfter: number;
};

function renderCompanionPreview(
  preview: WardrobeStoreLabProps["companionPreview"],
  view: "full_body" | "portrait",
) {
  return typeof preview === "function" ? preview(view) : preview;
}

function loadStoreState(): WardrobeStoreState {
  if (typeof window === "undefined") return createInitialWardrobeStoreState();
  try {
    const saved = window.localStorage.getItem(WARDROBE_STORE_STORAGE_KEY);
    if (!saved) return createInitialWardrobeStoreState();
    const parsed = parseWardrobeStoreState(JSON.parse(saved) as unknown);
    if (parsed) return parsed;
    console.error(" 🎮 [wardrobe-store-lab] state_load rejected reason=invalid_schema");
  } catch (error: unknown) {
    console.error(" 🎮 [wardrobe-store-lab] state_load failed", error);
  }
  return createInitialWardrobeStoreState();
}

function saveStoreState(state: WardrobeStoreState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WARDROBE_STORE_STORAGE_KEY, JSON.stringify(state));
  } catch (error: unknown) {
    console.error(" 🎮 [wardrobe-store-lab] state_save failed", error);
  }
}

function createEventId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function previewSelection(
  state: WardrobeStoreState,
  companion: WardrobeStoreCompanion,
  item: WardrobeStoreItem,
): WardrobeSelection {
  const equipped = resolveEquippedWardrobeSelection(
    state,
    companion.id,
    companion.modelUrl,
  );
  const preview = resolveWardrobeItemSelection(item);
  return item.asset.kind === "accessory"
    ? { ...equipped, accessoryId: preview.accessoryId }
    : { ...equipped, outfitId: preview.outfitId };
}

function Wallet({ balance }: { balance: number }) {
  return (
    <div className="wardrobe-store-lab__wallet" aria-live="polite">
      <span aria-hidden>●</span> {balance} demo coins
    </div>
  );
}

function priceLabel(item: WardrobeStoreItem, state: WardrobeStoreState): string {
  if (state.ownedItemIds.includes(item.id)) return "Owned";
  if (state.savedItemIds.includes(item.id)) return "Saved";
  return `${item.price} coins`;
}

function createShoppingContext(input: {
  mode: WardrobeShoppingContext["mode"];
  state: WardrobeStoreState;
  item: WardrobeStoreItem | null;
  companionWish: string;
  preferenceMatch: boolean;
  visit: CompanionShoppingVisit;
  opinion: CompanionItemOpinion | null;
}): WardrobeShoppingContext {
  return {
    mode: input.mode,
    visitId: input.visit.id,
    walletBalance: getWardrobeBalance(input.state),
    companionWish: input.companionWish,
    companionMood: {
      id: input.visit.mood.id,
      label: input.visit.mood.label,
    },
    selectedItem: input.item
      ? {
          id: input.item.id,
          name: input.item.name,
          price: input.item.price,
          category: input.item.asset.kind,
          styleTags: [...input.item.styleTags],
          owned: input.state.ownedItemIds.includes(input.item.id),
          saved: input.state.savedItemIds.includes(input.item.id),
          preferenceMatch: input.preferenceMatch,
          opinionVerdict: input.opinion?.verdict ?? "unsure",
          opinionReasons: [...(input.opinion?.reasons ?? [])],
          companionConsentsToWear:
            input.opinion?.companionConsentsToWear ?? true,
        }
      : null,
    ownedItemIds: [...input.state.ownedItemIds],
    savedItemIds: [...input.state.savedItemIds],
  };
}

export function WardrobeStoreLab({
  companion,
  companionPreview,
  call,
  onWardrobeChange,
  onShoppingContextChange,
  onCompanionReaction,
  onExit,
  exitLabel = "Back to the call",
  visitSeed,
}: WardrobeStoreLabProps) {
  const [storeState, setStoreState] = useState<WardrobeStoreState>(loadStoreState);
  const [mode, setMode] = useState<ShopMode>("entrance");
  const [filter, setFilter] = useState<ShopFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<PurchaseConfirmation | null>(null);
  const [closetOpen, setClosetOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const compatibleItems = useMemo(
    () => getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, companion.modelUrl),
    [companion.modelUrl],
  );
  const [shoppingVisit] = useState(() =>
    createCompanionShoppingVisit({
      companionId: companion.id,
      items: compatibleItems,
      state: storeState,
      visitSeed: visitSeed ?? createEventId("shopping-visit"),
    }),
  );
  const selectedItem =
    compatibleItems.find((item) => item.id === selectedItemId) ?? null;
  const visibleItems = compatibleItems.filter((item) => {
    if (filter === "all") return true;
    return filter === "accessories"
      ? item.asset.kind === "accessory"
      : item.asset.kind === "outfit";
  });
  const activeDesire = resolveCompanionStoreDesire(companion.id, storeState);
  const balance = getWardrobeBalance(storeState);
  const ownedItems = WARDROBE_STORE_CATALOG.filter((item) =>
    storeState.ownedItemIds.includes(item.id),
  );
  const savedItems = WARDROBE_STORE_CATALOG.filter((item) =>
    storeState.savedItemIds.includes(item.id),
  );
  const selectedPreferenceMatch = selectedItem
    ? activeDesire.matchingItemIds.includes(selectedItem.id)
    : false;
  const selectedOpinion = selectedItem
    ? shoppingVisit.itemOpinions[selectedItem.id] ?? null
    : null;
  const shoppingContext = useMemo<WardrobeShoppingContext>(
    () => createShoppingContext({
      mode: mode === "try-on" ? "try_on" : mode,
      state: storeState,
      item: selectedItem,
      companionWish: activeDesire.label,
      preferenceMatch: selectedPreferenceMatch,
      visit: shoppingVisit,
      opinion: selectedOpinion,
    }),
    [
      activeDesire.label,
      mode,
      selectedItem,
      selectedPreferenceMatch,
      selectedOpinion,
      shoppingVisit,
      storeState,
    ],
  );

  const persist = useCallback((nextState: WardrobeStoreState) => {
    setStoreState(nextState);
    saveStoreState(nextState);
  }, []);

  const contextFor = useCallback(
    (
      item: WardrobeStoreItem | null,
      nextMode: WardrobeShoppingContext["mode"],
      state: WardrobeStoreState,
    ) =>
      createShoppingContext({
        mode: nextMode,
        state,
        item,
        companionWish: activeDesire.label,
        preferenceMatch: item
          ? activeDesire.matchingItemIds.includes(item.id)
          : false,
        visit: shoppingVisit,
        opinion: item ? shoppingVisit.itemOpinions[item.id] ?? null : null,
      }),
    [activeDesire.label, activeDesire.matchingItemIds, shoppingVisit],
  );

  const restoreEquippedLook = useCallback(
    (state: WardrobeStoreState) => {
      onWardrobeChange(
        resolveEquippedWardrobeSelection(
          state,
          companion.id,
          companion.modelUrl,
        ),
      );
    },
    [companion.id, companion.modelUrl, onWardrobeChange],
  );

  useEffect(() => {
    setMode("entrance");
    setFilter("all");
    setSelectedItemId(null);
    setConfirmation(null);
    setClosetOpen(false);
    setStatusMessage(null);
    onWardrobeChange(
      resolveEquippedWardrobeSelection(
        storeState,
        companion.id,
        companion.modelUrl,
      ),
    );
    console.log(
      ` 🎮 [wardrobe-store-lab] companion_entered companion=${companion.id} mood=${shoppingVisit.mood.id} compatible_items=${compatibleItems.length}`,
    );
    // Persisted state is intentionally read only when the companion changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id, companion.modelUrl, onWardrobeChange]);

  useEffect(() => {
    onShoppingContextChange?.(shoppingContext);
  }, [onShoppingContextChange, shoppingContext]);

  const recordInteraction = useCallback(
    (
      state: WardrobeStoreState,
      itemId: string,
      action: "previewed" | "purchased" | "equipped" | "left_try_on",
      evidenceStream: "engagement" | "companion",
    ) =>
      recordWardrobeInteraction(state, {
        id: createEventId(`wardrobe-${action}`),
        companionId: companion.id,
        itemId,
        action,
        evidenceStream,
        occurredAt: new Date().toISOString(),
      }),
    [companion.id],
  );

  const selectItem = (item: WardrobeStoreItem) => {
    let nextState = storeState;
    if (mode === "try-on" && selectedItem) {
      nextState = recordInteraction(
        storeState,
        selectedItem.id,
        "left_try_on",
        "engagement",
      );
      persist(nextState);
      restoreEquippedLook(nextState);
    }
    setSelectedItemId(item.id);
    setMode("review");
    setConfirmation(null);
    setStatusMessage(null);
    const context = contextFor(item, "review", nextState);
    onCompanionReaction?.(
      { type: "item_reviewed", itemId: item.id },
      context,
    );
    console.log(
      ` 🎮 [wardrobe-store-lab] item_reviewed companion=${companion.id} item=${item.id} mood=${shoppingVisit.mood.id} verdict=${context.selectedItem?.opinionVerdict ?? "none"}`,
    );
  };

  const enterTryOn = (item: WardrobeStoreItem) => {
    const nextState = recordInteraction(
      storeState,
      item.id,
      "previewed",
      "engagement",
    );
    persist(nextState);
    setSelectedItemId(item.id);
    setMode("try-on");
    setConfirmation(null);
    setStatusMessage(null);
    onWardrobeChange(previewSelection(nextState, companion, item));
    const context = contextFor(item, "try_on", nextState);
    onCompanionReaction?.(
      { type: "try_on_started", itemId: item.id },
      context,
    );
    console.log(
      ` 🎮 [wardrobe-store-lab] try_on opened companion=${companion.id} item=${item.id} mood=${shoppingVisit.mood.id} verdict=${context.selectedItem?.opinionVerdict ?? "none"}`,
    );
  };

  const returnToReview = () => {
    if (!selectedItem) return;
    const nextState = recordInteraction(
      storeState,
      selectedItem.id,
      "left_try_on",
      "engagement",
    );
    persist(nextState);
    restoreEquippedLook(nextState);
    setMode("review");
    setConfirmation(null);
    setStatusMessage(null);
    console.log(
      ` 🎮 [wardrobe-store-lab] try_on left companion=${companion.id} item=${selectedItem.id}`,
    );
  };

  const saveForLater = (item: WardrobeStoreItem) => {
    const saved = saveWardrobeItemForLater(storeState, item.id, companion.modelUrl);
    if (saved.status !== "saved" && saved.status !== "already_saved") {
      setStatusMessage(`Could not save this item (${saved.status}).`);
      console.error(
        ` 🎮 [wardrobe-store-lab] item_save rejected companion=${companion.id} item=${item.id} reason=${saved.status}`,
      );
      return;
    }
    persist(saved.state);
    restoreEquippedLook(saved.state);
    setMode("review");
    setConfirmation(null);
    setStatusMessage(`${item.name} saved for later`);
    console.log(
      ` 🎮 [wardrobe-store-lab] item_saved companion=${companion.id} item=${item.id} balance=${getWardrobeBalance(saved.state)}`,
    );
  };

  const equipOwnedItem = (item: WardrobeStoreItem) => {
    const opinion = shoppingVisit.itemOpinions[item.id];
    if (opinion && !opinion.companionConsentsToWear) {
      setStatusMessage(`${companion.name} does not want to wear ${item.name} today.`);
      console.log(
        ` 🎮 [wardrobe-store-lab] equip blocked companion=${companion.id} item=${item.id} reason=companion_refused mood=${shoppingVisit.mood.id}`,
      );
      return;
    }
    const equipped = equipWardrobeItem(
      storeState,
      companion.id,
      item.id,
      companion.modelUrl,
    );
    if (equipped.status !== "equipped") {
      setStatusMessage(`Could not equip this item (${equipped.status}).`);
      console.error(
        ` 🎮 [wardrobe-store-lab] equip rejected companion=${companion.id} item=${item.id} reason=${equipped.status}`,
      );
      return;
    }
    const nextState = recordInteraction(
      equipped.state,
      item.id,
      "equipped",
      "companion",
    );
    persist(nextState);
    restoreEquippedLook(nextState);
    setSelectedItemId(item.id);
    setMode("try-on");
    setConfirmation(null);
    setStatusMessage(`${item.name} equipped`);
    console.log(
      ` 🎮 [wardrobe-store-lab] item_equipped companion=${companion.id} item=${item.id}`,
    );
  };

  const buyAndWear = () => {
    if (!selectedItem) return;
    if (selectedOpinion && !selectedOpinion.companionConsentsToWear) {
      setStatusMessage(`${companion.name} does not want to wear ${selectedItem.name} today.`);
      console.log(
        ` 🎮 [wardrobe-store-lab] purchase blocked companion=${companion.id} item=${selectedItem.id} reason=companion_refused mood=${shoppingVisit.mood.id}`,
      );
      return;
    }
    const balanceBefore = getWardrobeBalance(storeState);
    const purchase = purchaseWardrobeItem(storeState, {
      itemId: selectedItem.id,
      companionId: companion.id,
      companionModelUrl: companion.modelUrl,
      transactionId: createEventId("wardrobe-purchase"),
      occurredAt: new Date().toISOString(),
    });
    if (purchase.status !== "purchased") {
      setStatusMessage(
        purchase.status === "insufficient_funds"
          ? "Not enough demo coins yet. Saving is always available."
          : `Purchase could not be completed (${purchase.status}).`,
      );
      console.error(
        ` 🎮 [wardrobe-store-lab] purchase rejected companion=${companion.id} item=${selectedItem.id} reason=${purchase.status}`,
      );
      return;
    }
    const equipped = equipWardrobeItem(
      purchase.state,
      companion.id,
      selectedItem.id,
      companion.modelUrl,
    );
    if (equipped.status !== "equipped") {
      setStatusMessage(`Purchase completed, but equip failed (${equipped.status}).`);
      console.error(
        ` 🎮 [wardrobe-store-lab] purchase_equip failed companion=${companion.id} item=${selectedItem.id} reason=${equipped.status}`,
      );
      return;
    }
    const purchasedState = recordInteraction(
      recordInteraction(equipped.state, selectedItem.id, "purchased", "engagement"),
      selectedItem.id,
      "equipped",
      "companion",
    );
    persist(purchasedState);
    restoreEquippedLook(purchasedState);
    setConfirmation({
      item: selectedItem,
      balanceBefore,
      balanceAfter: getWardrobeBalance(purchasedState),
    });
    setStatusMessage(null);
    console.log(
      ` 🎮 [wardrobe-store-lab] purchase completed companion=${companion.id} item=${selectedItem.id} balance=${getWardrobeBalance(purchasedState)}`,
    );
  };

  const wearOriginalLook = () => {
    const nextState = clearEquippedWardrobe(storeState, companion.id);
    persist(nextState);
    onWardrobeChange({ accessoryId: "none", outfitId: "none" });
    setMode("entrance");
    setSelectedItemId(null);
    setConfirmation(null);
    setStatusMessage(`${companion.name}’s original look restored`);
    console.log(
      ` 🎮 [wardrobe-store-lab] original_look restored companion=${companion.id}`,
    );
  };

  const exitStore = () => {
    restoreEquippedLook(storeState);
    console.log(
      ` 🎮 [wardrobe-store-lab] store_exited companion=${companion.id} mode=${mode}`,
    );
    onExit();
  };

  const callStatus =
    call?.talkPhase === "listening"
      ? "listening"
      : call?.talkPhase === "thinking"
        ? "thinking"
        : call?.talkPhase === "speaking"
          ? "speaking"
          : "ready";
  const opinionLabel =
    selectedOpinion?.verdict === "love"
      ? "I love this"
      : selectedOpinion?.verdict === "like"
        ? "I like this"
        : selectedOpinion?.verdict === "reject"
          ? "Not for me today"
          : "I’m not sure yet";

  const content = (
    <section
      aria-label="Companion shopping sandbox"
      className="wardrobe-store-lab"
      data-mode={mode}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <header className="wardrobe-store-lab__header">
        <div className="wardrobe-store-lab__identity">
          <span>Shopping call with</span>
          <h1>Shopping with {companion.name}</h1>
          <i><b aria-hidden /> Connected</i>
        </div>
        <div className="wardrobe-store-lab__header-actions">
          <Wallet balance={balance} />
          <button type="button" onClick={() => setClosetOpen(true)}>
            {companion.name}’s closet
          </button>
          <button type="button" onClick={exitStore}>{exitLabel}</button>
        </div>
      </header>

      <div className="wardrobe-store-lab__body">
        <main className={`wardrobe-store-lab__stage is-${mode}`}>
          {mode === "entrance" && (
            <div
              aria-label={`${companion.name} store entrance`}
              className="wardrobe-store-lab__entrance"
            >
              <div className="wardrobe-store-lab__entrance-preview">
                {renderCompanionPreview(companionPreview, "full_body") ?? (
                  <div className="wardrobe-store-lab__preview-missing">Full-body VRM preview</div>
                )}
              </div>
              <div className="wardrobe-store-lab__entrance-copy">
                <span>Shopping together</span>
                <h2>What should we look at?</h2>
                <p>
                  {companion.name} feels {shoppingVisit.mood.label} today. Pick an
                  item from the shop to hear a first impression.
                </p>
              </div>
            </div>
          )}

          {mode === "review" && selectedItem && (
            <div className="wardrobe-store-lab__product">
              <div className="wardrobe-store-lab__product-kicker">
                {selectedItem.asset.kind === "accessory" ? "Accessory" : "Outfit"}
                {activeDesire.matchingItemIds.includes(selectedItem.id) && (
                  <span>Matches {companion.name}’s wish</span>
                )}
              </div>
              <div className="wardrobe-store-lab__product-art" aria-hidden>
                <span>{selectedItem.icon}</span>
              </div>
              <div className="wardrobe-store-lab__product-copy">
                <div>
                  <h2>{selectedItem.name}</h2>
                  <p>{selectedItem.styleTags.join(" · ")}</p>
                </div>
                <strong>{priceLabel(selectedItem, storeState)}</strong>
              </div>
              <div className="wardrobe-store-lab__product-actions">
                <button
                  type="button"
                  className="is-primary"
                  aria-label={`Try on ${selectedItem.name}`}
                  onClick={() => enterTryOn(selectedItem)}
                >
                  Try it on
                </button>
                <button
                  type="button"
                  aria-label={`Save ${selectedItem.name} for later`}
                  onClick={() => saveForLater(selectedItem)}
                >
                  Save for later
                </button>
              </div>
              <aside
                aria-label={`${companion.name} live`}
                className="wardrobe-store-lab__companion-portrait"
              >
                <div className="wardrobe-store-lab__companion-portrait-preview">
                  {renderCompanionPreview(companionPreview, "portrait") ?? (
                    <div className="wardrobe-store-lab__preview-missing">VRM portrait</div>
                  )}
                </div>
                <div className="wardrobe-store-lab__companion-portrait-status">
                  <strong><i aria-hidden /> {companion.name} Live</strong>
                  <span>{callStatus}</span>
                </div>
                {call?.responseText ? <p aria-live="polite">{call.responseText}</p> : null}
                {call?.error ? (
                  <p role="alert">
                    {companion.name} could not answer out loud, but her opinion is still active.
                  </p>
                ) : null}
                {call ? (
                  <button
                    type="button"
                    aria-label={`Talk to ${companion.name} by voice`}
                    disabled={call.talkPhase === "thinking" || call.talkPhase === "speaking"}
                    onClick={call.onAskVoice}
                  >
                    <span aria-hidden>🎙</span> Talk
                  </button>
                ) : null}
              </aside>
            </div>
          )}

          {mode === "try-on" && selectedItem && (
            <div className="wardrobe-store-lab__try-on-layout">
              <div
                aria-label={`${companion.name} try-on stage`}
                className="wardrobe-store-lab__try-on-preview"
              >
                {renderCompanionPreview(companionPreview, "full_body") ?? (
                  <div className="wardrobe-store-lab__preview-missing">Full-body VRM preview</div>
                )}
              </div>
              <div className="wardrobe-store-lab__try-on-copy">
                <div>
                  <span>Trying on</span>
                  <h2>{selectedItem.name}</h2>
                  <strong
                    className={`wardrobe-store-lab__opinion is-${selectedOpinion?.verdict ?? "unsure"}`}
                  >
                    {opinionLabel}
                  </strong>
                  <p>
                    {selectedOpinion?.reasons[0] ??
                      (activeDesire.matchingItemIds.includes(selectedItem.id)
                        ? "Matches the current wish"
                        : "Trying something different")}
                    {` · ${selectedItem.styleTags.join(" · ")}`}
                  </p>
                </div>
                <div className="wardrobe-store-lab__try-on-actions">
                  {!selectedOpinion?.companionConsentsToWear ? (
                    <div className="wardrobe-store-lab__refusal" role="status">
                      <strong>{companion.name} would rather keep looking.</strong>
                      <span>Saving it does not spend any coins.</span>
                    </div>
                  ) : storeState.ownedItemIds.includes(selectedItem.id) ? (
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => equipOwnedItem(selectedItem)}
                    >
                      Wear from closet
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="is-primary"
                      disabled={balance < selectedItem.price}
                      aria-label={`Buy and wear ${selectedItem.name} for ${selectedItem.price} coins`}
                      onClick={buyAndWear}
                    >
                      Buy &amp; wear · {selectedItem.price}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Save ${selectedItem.name} for later`}
                    onClick={() => saveForLater(selectedItem)}
                  >
                    Save for later
                  </button>
                  <button type="button" onClick={returnToReview}>Keep looking</button>
                </div>
              </div>
            </div>
          )}

          {confirmation && (
            <div role="status" className="wardrobe-store-lab__confirmation">
              <span aria-hidden>✓</span>
              <div>
                <strong>Added to the closet</strong>
                <p>
                  {confirmation.item.name} added to {companion.name}’s closet · {confirmation.balanceBefore} → {confirmation.balanceAfter} coins
                </p>
              </div>
              <button type="button" onClick={() => setConfirmation(null)}>Done</button>
            </div>
          )}

          {statusMessage && (
            <div role="status" className="wardrobe-store-lab__status">
              {statusMessage}
            </div>
          )}
        </main>

        <aside className="wardrobe-store-lab__shop" aria-label="Shop items">
          <div className="wardrobe-store-lab__wish">
            <span>{companion.name}’s current wish</span>
            <strong>{activeDesire.label}</strong>
          </div>

          <div className="wardrobe-store-lab__filters" aria-label="Item categories">
            {(["all", "accessories", "outfits"] as const).map((nextFilter) => (
              <button
                type="button"
                key={nextFilter}
                className={filter === nextFilter ? "is-active" : ""}
                aria-pressed={filter === nextFilter}
                onClick={() => setFilter(nextFilter)}
              >
                {nextFilter === "all"
                  ? "All"
                  : nextFilter === "accessories"
                    ? "Accessories"
                    : "Outfits"}
              </button>
            ))}
          </div>

          <div className="wardrobe-store-lab__items">
            {visibleItems.map((item) => {
              const itemPriceLabel = priceLabel(item, storeState);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={selectedItem?.id === item.id ? "is-selected" : ""}
                  aria-label={`View ${item.name}, ${itemPriceLabel}`}
                  onClick={() => selectItem(item)}
                >
                  <span aria-hidden>{item.icon}</span>
                  <div><strong>{item.name}</strong><small>{item.styleTags.slice(0, 2).join(" · ")}</small></div>
                  <b>{itemPriceLabel}</b>
                </button>
              );
            })}
          </div>

          <p className="wardrobe-store-lab__truth-note">
            Demo currency · purchases do not change learning evidence.
          </p>
        </aside>
      </div>

      {closetOpen && (
        <div className="wardrobe-store-lab__closet-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${companion.name}’s closet`}
            className="wardrobe-store-lab__closet"
          >
            <div className="wardrobe-store-lab__closet-header">
              <div><span>Already yours</span><h2>{companion.name}’s closet</h2></div>
              <button type="button" onClick={() => setClosetOpen(false)}>Close</button>
            </div>
            <h3>Owned</h3>
            <div className="wardrobe-store-lab__closet-grid">
              {ownedItems.length === 0 ? (
                <p>Nothing bought yet.</p>
              ) : (
                ownedItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => equipOwnedItem(item)}>
                    <span aria-hidden>{item.icon}</span>{item.name}
                  </button>
                ))
              )}
            </div>
            <h3>Saved for later</h3>
            <div className="wardrobe-store-lab__closet-grid">
              {savedItems.length === 0 ? (
                <p>Nothing saved yet.</p>
              ) : (
                savedItems.map((item) => <span key={item.id}>{item.icon} {item.name}</span>)
              )}
            </div>
            <button type="button" className="wardrobe-store-lab__original" onClick={wearOriginalLook}>
              Restore original look
            </button>
          </section>
        </div>
      )}
    </section>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
