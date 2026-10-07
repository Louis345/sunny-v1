import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PreparationState, PreparationStop } from "./adventurePreparationMachine";
import "./AdventurePreparationScreen.css";

export type PreparationItem = { face: string; spoken: string };

export type AdventurePreparationScreenProps = {
  state: PreparationState;
  items: PreparationItem[];
  /** Indexes of items already looked at during review (look state only). */
  reviewed: number[];
  /** Real stops from the plan; before the plan exists the map shows ghost stops. */
  stops: PreparationStop[];
  ready: number;
  elapsedLabel?: string;
  /** The real companion. Sunny already renders Elli globally; this slot keeps her column clear. */
  elliSlot?: ReactNode;
  onHearItem: (item: PreparationItem) => void;
  onStop: () => void;
  onTryAgain: () => void;
  onBye: () => void;
  onLetsGo: () => void;
};

const STEP_LABELS = ["Looking at what you did", "Planning your map", "Building your activities", "Your map is ready!"];
const GHOST_STOPS = 4;

function stepIndex(state: PreparationState): number {
  if (state === "look") return 0;
  if (state === "plan") return 1;
  if (state === "ready") return 4;
  return 2;
}

/** Stops sit along a gentle wave across the board, as in the design's four-stop map. */
function stopPositions(count: number): Array<{ x: number; y: number }> {
  if (count <= 1) return [{ x: 50, y: 46 }];
  return Array.from({ length: count }, (_, i) => ({ x: 17 + (71 * i) / (count - 1), y: i % 2 === 0 ? 62 : 28 }));
}

function segmentPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mid = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
}

/** Fires once even when tapped twice quickly. */
function useOnce(handler: () => void) {
  const [used, setUsed] = useState(false);
  return [used, () => { if (used) return; setUsed(true); handler(); }] as const;
}

export function AdventurePreparationScreen(props: AdventurePreparationScreenProps) {
  const { state, items, reviewed, stops, ready } = props;
  const current = stepIndex(state);
  const planned = stops.length > 0;
  const total = planned ? stops.length : GHOST_STOPS;
  const positions = stopPositions(total);
  const showMap = state !== "look";
  const paused = state === "help";
  const [stopUsed, stop] = useOnce(props.onStop);
  const [, bye] = useOnce(props.onBye);
  const [, letsGo] = useOnce(props.onLetsGo);
  const [tapped, setTapped] = useState<number | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  const hear = (index: number) => {
    const item = items[index];
    if (!item) return;
    props.onHearItem(item);
    setTapped(index);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapped(null), 700);
  };

  const stopStatus = (i: number): "ready" | "building" | "todo" => {
    if (state === "ready") return "ready";
    if (!planned || state === "plan") return "todo";
    if (i < ready) return "ready";
    if (i === ready) return "building";
    return "todo";
  };
  const segmentClass = (i: number): string => {
    if (state === "plan") return "ap-drawing";
    const to = stopStatus(i + 1), from = stopStatus(i);
    if (from === "ready" && to === "ready") return "ap-done";
    if (from === "ready" && to === "building") return "ap-drawing";
    return "ap-todo";
  };
  const fog = state === "ready" ? "0" : state === "plan" ? "2" : state === "look" ? "1" : "1";
  const currentReview = reviewed.length < items.length ? reviewed.length : -1;
  const reviewing = state === "look" && reviewed.length > 0;

  return (
    <div className="ap-root" data-state={state} data-paused={paused ? "true" : "false"} data-elli={props.elliSlot ? "slot" : "portrait"} aria-label="Getting your next adventure ready">
      <div className="ap-ui">
        <div className="ap-top">
          {state !== "ready" && (
            <button type="button" className={`ap-stopbtn${state === "stop" ? " ap-on" : ""}`} aria-pressed={state === "stop"} disabled={state === "stop" || stopUsed} onClick={stop}>
              <MoonIcon /><span>Stop for now</span>
            </button>
          )}
        </div>

        <div className={`ap-map${state === "stop" ? " ap-dim" : ""}`} data-fog={fog}>
          <Sparkles />
          <div className="ap-fog ap-f1" /><div className="ap-fog ap-f2" />
          {!showMap ? (
            <div className="ap-celebrate">
              <h1>You did it!</h1>
              <div className="ap-cards" data-testid="ap-cards">
                {items.map((item, i) => (
                  <button
                    key={`${item.face}:${i}`} type="button" aria-label={`Hear ${item.face}`}
                    className={`ap-card${reviewing && i === currentReview ? " ap-now" : ""}${reviewing && i > currentReview && currentReview >= 0 ? " ap-wait" : ""}${tapped === i ? " ap-tapped" : ""}`}
                    style={{ animationDelay: `${i * 120}ms` }} onClick={() => hear(i)}
                  >
                    {item.face}<SpeakerIcon />
                    {reviewed.includes(i) && <i className="ap-seen" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <svg className="ap-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {positions.slice(0, -1).map((p, i) => <path key={i} className={segmentClass(i)} d={segmentPath(p, positions[i + 1]!)} />)}
              </svg>
              {positions.map((p, i) => {
                const status = stopStatus(i);
                return (
                  <div key={i} className="ap-stop" data-testid="ap-map-stop" data-stop={status}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, ["--ap-stop-size" as string]: `${Math.min(17, 84 / total)}cqmin` }}>
                    <span className="ap-art"><StopArt activityType={planned ? stops[i]!.activityType : ""} /></span>
                    {status === "ready" && <span className="ap-chk" style={{ animationDelay: state === "ready" ? `${i * 150}ms` : undefined }}><CheckIcon /></span>}
                  </div>
                );
              })}
              {state === "ready" ? (
                <>
                  {[[12, 18], [30, 78], [52, 14], [70, 70], [88, 46], [44, 44]].map(([x, y], i) => (
                    <i key={i} className="ap-burst" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 90}ms` }} />
                  ))}
                  <button type="button" className="ap-bigbtn ap-go ap-letsgo" onClick={letsGo}>Let&apos;s go!</button>
                </>
              ) : (
                <div className="ap-tray">
                  <span className="ap-lead" aria-hidden="true"><SpeakerIcon /></span>
                  {items.map((item, i) => (
                    <button key={`${item.face}:${i}`} type="button" aria-label={`Hear ${item.face}`} className={`ap-card${tapped === i ? " ap-tapped" : ""}`} onClick={() => hear(i)}>
                      {item.face}
                    </button>
                  ))}
                </div>
              )}
              {state === "help" && (
                <div className="ap-pause" role="status">
                  <span><b>Building paused</b><small>Your work is saved{props.elapsedLabel ? ` · ${props.elapsedLabel}` : ""}</small></span>
                  <button type="button" className="ap-btn ap-gold" onClick={props.onTryAgain}>Try again</button>
                </div>
              )}
              {state === "stop" && (
                <div className="ap-over">
                  <div className="ap-oc">
                    <span className="ap-big"><MoonIcon /></span>
                    <h2>Ready next time</h2>
                    <button type="button" className="ap-bigbtn ap-lav" onClick={bye}><MoonIcon />Bye for now</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="ap-steps" aria-label="Progress">
          {STEP_LABELS.map((label, i) => {
            const status = state === "ready" || i < current ? "done" : i === current ? "now" : "todo";
            return (
              <StepWithLink key={label} index={i} label={label} status={status} linkOn={state === "ready" || i <= current}>
                {i === 2 && planned && (state !== "look" && state !== "plan") && (
                  <span className="ap-pips" aria-label={`${ready} of ${total} activities ready`}>
                    {stops.map((_, n) => <i key={n} data-testid="ap-pip" data-on={n < ready ? "true" : "false"} />)}
                  </span>
                )}
              </StepWithLink>
            );
          })}
        </div>

        {props.elliSlot && <div className="ap-elli"><div className="ap-elli-slot">{props.elliSlot}</div></div>}
      </div>
    </div>
  );
}

function StepWithLink(props: { index: number; label: string; status: "done" | "now" | "todo"; linkOn: boolean; children?: ReactNode }) {
  const Icon = [SearchIcon, MapIcon, BlocksIcon, StarIcon][props.index]!;
  return (
    <>
      {props.index > 0 && <span className={`ap-steplink${props.linkOn ? " ap-on" : ""}`} aria-hidden="true" />}
      <div className="ap-step" data-testid="ap-step" data-step={props.status} aria-current={props.status === "now" ? "step" : undefined}>
        <span className="ap-ic"><Icon /></span>
        <span>{props.label}</span>
        {props.children}
      </div>
    </>
  );
}

function Sparkles() {
  const spots = [[7, 12], [22, 9], [48, 10], [70, 12], [90, 9], [9, 40], [31, 52], [57, 38], [79, 46], [94, 70], [14, 84], [46, 88], [68, 82], [86, 90]];
  return <>{spots.map(([x, y], i) => <i key={i} className="ap-spk" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 5) * 0.8}s` }} />)}</>;
}

/** Activity art by type; unknown types get a neutral star rather than a guess. */
function StopArt({ activityType }: { activityType: string }) {
  const type = activityType.toLowerCase();
  if (type.includes("radar")) return (
    <svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="#241b4d" />
      {[38, 27, 16].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#f4c56b" strokeOpacity=".55" strokeWidth="1.6" />)}
      <path d="M50 50 L50 12 A38 38 0 0 1 80 27 Z" fill="#f4c56b" fillOpacity=".45" /><circle cx="64" cy="37" r="5" fill="#fb7185" /><circle cx="38" cy="60" r="3.5" fill="#5ee08a" /></svg>);
  if (type.includes("rush")) return (
    <svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="#f5a524" />
      {[["R", 33, 36, "#fff7e1", "#2a1f4a"], ["U", 58, 30, "#7c5cdb", "#fff"], ["S", 67, 58, "#fff7e1", "#2a1f4a"], ["H", 38, 66, "#fb7185", "#fff"]].map(([ch, x, y, bg, fg]) => (
        <g key={ch as string} transform={`translate(${x as number - 13} ${y as number - 13})`}><rect width="26" height="26" rx="4" fill={bg as string} stroke="#2a1f4a" strokeWidth="1.8" /><text x="13" y="19.5" textAnchor="middle" fontSize="18" fontWeight="800" fill={fg as string} fontFamily="Lexend, sans-serif">{ch}</text></g>))}</svg>);
  if (type.includes("explainer") || type.includes("read") || type.includes("story")) return (
    <svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="#6d4fd1" />
      <path d="M22 34 Q36 28 49 34 V72 Q36 66 22 72 Z" fill="#fff7e1" /><path d="M78 34 Q64 28 51 34 V72 Q64 66 78 72 Z" fill="#fff7e1" />
      {[42, 50, 58].map(y => <g key={y}><line x1="28" y1={y} x2="43" y2={y - 1} stroke="#6d4fd1" strokeOpacity=".5" strokeWidth="2" /><line x1="57" y1={y - 1} x2="72" y2={y} stroke="#6d4fd1" strokeOpacity=".5" strokeWidth="2" /></g>)}
      <path d="M66 18l3 6 6.5.8-4.8 4.6 1.2 6.5L66 33l-5.9 3 1.2-6.5-4.8-4.6 6.5-.8z" fill="#f4c56b" /></svg>);
  if (type.includes("spell") || type.includes("builder") || type.includes("wordle") || type.includes("letter")) return (
    <svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="#f472b6" /><circle cx="30" cy="26" r="5" fill="#fff" fillOpacity=".55" />
      {[["A", 28, 58, "#fcd34d", -8], ["B", 50, 50, "#fff7e1", 4], ["C", 71, 60, "#c4b5fd", 10]].map(([ch, x, y, bg, rot]) => (
        <g key={ch as string} transform={`translate(${x} ${y}) rotate(${rot})`}><rect x="-14" y="-14" width="28" height="28" rx="5" fill={bg as string} stroke="#2a1f4a" strokeWidth="2" /><text y="7" textAnchor="middle" fontSize="19" fontWeight="800" fill="#2a1f4a" fontFamily="Lexend, sans-serif">{ch}</text></g>))}</svg>);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="50" fill="#3d2b6e" />
      <path d="M50 24l7.6 15.4 17 2.5-12.3 12 2.9 16.9L50 62.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#f4c56b" /></svg>);
}

const icon = (path: ReactNode, viewBox = "0 0 24 24") => () => (
  <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
const SpeakerIcon = icon(<><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a8.5 8.5 0 0 1 0 12" /></>);
const MoonIcon = icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor" stroke="none" />);
const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth="3.4" />);
const SearchIcon = icon(<><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>);
const MapIcon = icon(<><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></>);
const BlocksIcon = icon(<><rect x="8.5" y="3" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>);
const StarIcon = icon(<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="none" />);
