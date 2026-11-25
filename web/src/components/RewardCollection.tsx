import { CHRISTMAS_2026, collectionView, type CollectionEntry, type RewardItem, type RewardRarity } from "../../../src/shared/rewardCatalog";
import "./RewardCollection.css";

const RARITY_NAME: Record<RewardRarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
/** A seasonal set (Christmas 2026) is its own row, first; everything else is grouped by kind. */
const SECTIONS: Array<{ key: string; kind: RewardItem["kind"] | "season"; title: string; holds: (entry: CollectionEntry) => boolean }> = [
  { key: "christmas", kind: "season", title: "🎄 Christmas", holds: entry => entry.item.season === CHRISTMAS_2026.id },
  { key: "game", kind: "game", title: "8-bit games", holds: entry => !entry.item.season && entry.item.kind === "game" },
  { key: "outfit", kind: "outfit", title: "Outfits", holds: entry => !entry.item.season && entry.item.kind === "outfit" },
];
const percent = (chance: number) => `${(Math.round(chance * 1000) / 10).toString()}%`;

/** Everything she can earn (owner, 2026-11-07): owned in colour with Play or Wear, the rest greyed out with the
 * chest most likely to drop it and the real odds, so she knows what she is playing for. */
/** canUse: whether Play/Wear works for this companion; a button that would do nothing is not shown (2026-11-15).
 * tintOf: an outfit's real colour, painted behind its icon so the dresses are told apart without reading. */
export function RewardCollection({ ownedIds, onUse, kinds, canUse, tintOf, nowIso }: {
  ownedIds: readonly string[]; onUse?: (item: RewardItem) => void; kinds?: ReadonlyArray<RewardItem["kind"]>;
  canUse?: (item: RewardItem) => boolean; tintOf?: (item: RewardItem) => string | undefined; nowIso?: string;
}) {
  const entries = collectionView(ownedIds, nowIso).filter(entry => !kinds || kinds.includes(entry.item.kind));
  const found = entries.filter(entry => entry.owned).length;
  return (
    <div className="reward-collection">
      <header className="reward-collection__header">
        <h2>Your Collection</h2>
        <span className="reward-collection__count">{`${found} of ${entries.length} found`}</span>
        <div className="reward-collection__bar" aria-hidden="true"><span style={{ width: `${entries.length ? (found / entries.length) * 100 : 0}%` }} /></div>
      </header>
      {SECTIONS.filter(section => entries.some(section.holds)).map(section => (
        <section key={section.key} className="reward-collection__section" data-testid={`reward-section-${section.key}`} data-season={section.kind === "season" ? section.key : undefined}>
          <h3>{section.title}</h3>
          <div className="reward-collection__grid">
            {entries.filter(section.holds).map(({ item, owned, bestChest, bestChance }) => (
              <div key={item.id} className="reward-tile" data-testid={`reward-tile-${item.id}`} data-rarity={item.rarity} data-locked={owned ? "false" : "true"}
                data-fits={owned && canUse && !canUse(item) ? "false" : undefined}>
                <span className="reward-tile__icon" aria-hidden="true" style={tintOf?.(item) ? { backgroundColor: tintOf(item) } : undefined}>{item.icon}</span>
                {owned ? null : <span className="reward-tile__lock" aria-hidden="true">🔒</span>}
                <span className="reward-tile__rarity">{RARITY_NAME[item.rarity]}</span>
                <span className="reward-tile__name">{item.name}</span>
                {owned && canUse && !canUse(item) ? null : owned ? (
                  <button type="button" className="reward-tile__use" onClick={() => onUse?.(item)}>{item.kind === "game" ? "Play" : "Wear"}</button>
                ) : (
                  <span className="reward-tile__where">{bestChest && bestChance ? `${RARITY_NAME[bestChest]} chest · ${percent(bestChance)}` : "Not in chests yet"}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
