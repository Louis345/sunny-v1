import type { RewardItem, RewardRarity } from "../../../src/shared/rewardCatalog";
import "./TryOnTray.css";

/**
 * The try-on room for the kids (owner 2026-11-15 mock): one row over the live companion, no scrolling, no lists, almost
 * no words. Each thing she owns that fits this companion is a circle in its real colour; tapping it dresses her at
 * once. Locked things show the chest they come from. Things that do not fit this companion are not shown, so every
 * circle she can tap does something.
 */
export type TryOnEntry = { item: RewardItem; owned: boolean; fits: boolean; tint?: string; chest?: RewardRarity; worn: boolean };

export function TryOnTray({ entries, onWear, onLocked, onOriginal, onClose, companionName }: {
  entries: readonly TryOnEntry[];
  onWear: (item: RewardItem) => void;
  onLocked?: (entry: TryOnEntry) => void;
  onOriginal: () => void;
  onClose: () => void;
  companionName: string;
}) {
  const shown = entries.filter(entry => entry.item.kind === "outfit" && !entry.item.season && (!entry.owned || entry.fits));
  // A seasonal set (Christmas 2026) is a second row of its own shapes, greyed until she wins each (no padlocks, no words).
  const season = entries.filter(entry => entry.item.kind === "outfit" && entry.item.season && (!entry.owned || entry.fits));
  return (
    <div className="try-on-tray" role="dialog" aria-label={`${companionName}’s closet`} data-testid="try-on-tray">
      <button type="button" className="try-on-tray__close" aria-label="Close" onClick={onClose}>✕</button>
      <div className="try-on-tray__row">
        <button type="button" className="try-on-tray__item try-on-tray__original" aria-label="Her own clothes" onClick={onOriginal}>↺</button>
        {shown.map(entry => entry.owned ? (
          <button key={entry.item.id} type="button" className="try-on-tray__item" data-testid={`try-on-${entry.item.id}`} data-worn={entry.worn ? "true" : "false"}
            aria-label={`Wear ${entry.item.name}`} style={entry.tint ? { backgroundColor: entry.tint } : undefined} onClick={() => onWear(entry.item)}>
            <span aria-hidden="true">{entry.item.icon}</span>
          </button>
        ) : (
          <button key={entry.item.id} type="button" className="try-on-tray__item try-on-tray__locked" data-testid={`try-on-${entry.item.id}`} data-chest={entry.chest ?? "none"}
            aria-label={`${entry.item.name}, locked`} onClick={() => onLocked?.(entry)}>
            <span aria-hidden="true">🔒</span>
          </button>
        ))}
      </div>
      {season.length ? (
        <div className="try-on-tray__row try-on-tray__season" data-testid="try-on-season-row" data-season={season[0]!.item.season}>
          {season.map(entry => entry.owned ? (
            <button key={entry.item.id} type="button" className="try-on-tray__item" data-testid={`try-on-${entry.item.id}`} data-worn={entry.worn ? "true" : "false"}
              aria-label={`Wear ${entry.item.name}`} style={entry.tint ? { backgroundColor: entry.tint } : undefined} onClick={() => onWear(entry.item)}>
              <span aria-hidden="true">{entry.item.icon}</span>
            </button>
          ) : (
            <button key={entry.item.id} type="button" className="try-on-tray__item try-on-tray__greyed" data-testid={`try-on-${entry.item.id}`} data-shape="greyed"
              data-chest={entry.chest ?? "none"} aria-label={`${entry.item.name}, not found yet`} onClick={() => onLocked?.(entry)}>
              <span aria-hidden="true">{entry.item.icon}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
