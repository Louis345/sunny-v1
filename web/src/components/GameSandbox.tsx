import { useEffect, useMemo, useState } from "react";
import { WordRadar, type WordRadarResult } from "./WordRadar";
import { DIAG_WORD_RADAR_ITEMS } from "../fixtures/wordRadarDiagItems";

const TIMER_SECONDS_MIN = 1;
const TIMER_SECONDS_MAX = 180;

type WordRadarSandboxConfig = {
  inputMode: "whole-word" | "letter-by-letter" | "keyboard";
  speakStyle: "option-a" | "option-b";
  keyboardStyle: "option-b" | "option-c";
  showTimer: boolean;
  /** Response countdown length when showTimer is on. */
  timerSeconds: number;
};

type ProfileResponse = {
  games?: {
    "word-radar"?: Partial<WordRadarSandboxConfig>;
  };
  wordRadar?: {
    personalBests?: Record<string, number>;
    timerSeconds?: number;
  };
};

const DEFAULT_WORD_RADAR: WordRadarSandboxConfig = {
  inputMode: "whole-word",
  speakStyle: "option-a",
  keyboardStyle: "option-c",
  showTimer: true,
  timerSeconds: 10,
};

function clampTimerSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WORD_RADAR.timerSeconds;
  return Math.min(TIMER_SECONDS_MAX, Math.max(TIMER_SECONDS_MIN, Math.round(n)));
}

function normalizeWordRadarConfig(profile: ProfileResponse | null): WordRadarSandboxConfig {
  const config = profile?.games?.["word-radar"] ?? {};
  const rawSec =
    typeof config.timerSeconds === "number" ? config.timerSeconds : DEFAULT_WORD_RADAR.timerSeconds;
  return {
    inputMode: config.inputMode ?? DEFAULT_WORD_RADAR.inputMode,
    speakStyle: config.speakStyle ?? DEFAULT_WORD_RADAR.speakStyle,
    keyboardStyle: config.keyboardStyle ?? DEFAULT_WORD_RADAR.keyboardStyle,
    showTimer: config.showTimer ?? DEFAULT_WORD_RADAR.showTimer,
    timerSeconds: clampTimerSeconds(rawSec),
  };
}

export function GameSandbox({
  interimTranscript,
  sendMessage,
  wordRadar,
  /** When true, Word Radar shows the Ready intro (`autoStart` off). Default false keeps diag sandbox snappy. */
  wordRadarShowIntro = false,
}: {
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  wordRadarShowIntro?: boolean;
  wordRadar?: {
    showTimer: boolean;
    showKeyboard: boolean;
    inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
    speakStyle?: "option-a" | "option-b";
    keyboardStyle?: "option-b" | "option-c";
    personalBests: Record<string, number>;
    timerSeconds?: number;
  };
}) {
  const [game, setGame] = useState("word-radar");
  const [childId, setChildId] = useState("ila");
  const [config, setConfig] = useState<WordRadarSandboxConfig>({
    inputMode: wordRadar?.inputMode ?? DEFAULT_WORD_RADAR.inputMode,
    speakStyle: wordRadar?.speakStyle ?? DEFAULT_WORD_RADAR.speakStyle,
    keyboardStyle: wordRadar?.keyboardStyle ?? DEFAULT_WORD_RADAR.keyboardStyle,
    showTimer: wordRadar?.showTimer ?? DEFAULT_WORD_RADAR.showTimer,
    timerSeconds: clampTimerSeconds(
      typeof wordRadar?.timerSeconds === "number"
        ? wordRadar.timerSeconds
        : DEFAULT_WORD_RADAR.timerSeconds,
    ),
  });
  const [personalBests, setPersonalBests] = useState<Record<string, number>>(
    wordRadar?.personalBests ?? {},
  );
  const [launched, setLaunched] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (childId === "creator" && wordRadar) {
      setConfig({
        inputMode: wordRadar.inputMode ?? DEFAULT_WORD_RADAR.inputMode,
        speakStyle: wordRadar.speakStyle ?? DEFAULT_WORD_RADAR.speakStyle,
        keyboardStyle: wordRadar.keyboardStyle ?? DEFAULT_WORD_RADAR.keyboardStyle,
        showTimer: wordRadar.showTimer,
        timerSeconds: clampTimerSeconds(
          typeof wordRadar.timerSeconds === "number"
            ? wordRadar.timerSeconds
            : DEFAULT_WORD_RADAR.timerSeconds,
        ),
      });
      setPersonalBests(wordRadar.personalBests ?? {});
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/profile/${childId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: ProfileResponse | null) => {
        if (cancelled) return;
        setConfig(normalizeWordRadarConfig(profile));
        setPersonalBests(profile?.wordRadar?.personalBests ?? {});
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(DEFAULT_WORD_RADAR);
          setPersonalBests({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const configControls = useMemo(() => {
    if (game !== "word-radar") return null;
    return (
      <div className="mt-3 border-t border-white/15 pt-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-400">
          word-radar config
        </div>
        <fieldset className="mb-2">
          <legend className="mb-1 text-[11px] font-semibold text-zinc-300">inputMode</legend>
          {(["whole-word", "letter-by-letter", "keyboard"] as const).map((mode) => (
            <label key={mode} className="mr-3 inline-flex items-center gap-1">
              <input
                type="radio"
                aria-label={`inputMode ${mode}`}
                checked={config.inputMode === mode}
                onChange={() => setConfig((prev) => ({ ...prev, inputMode: mode }))}
              />
              {mode}
            </label>
          ))}
        </fieldset>
        <fieldset className="mb-2">
          <legend className="mb-1 text-[11px] font-semibold text-zinc-300">speakStyle</legend>
          {(["option-a", "option-b"] as const).map((style) => (
            <label key={style} className="mr-3 inline-flex items-center gap-1">
              <input
                type="radio"
                aria-label={`speakStyle ${style}`}
                checked={config.speakStyle === style}
                onChange={() => setConfig((prev) => ({ ...prev, speakStyle: style }))}
              />
              {style}
            </label>
          ))}
        </fieldset>
        <fieldset className="mb-2">
          <legend className="mb-1 text-[11px] font-semibold text-zinc-300">keyboard</legend>
          {(["option-b", "option-c"] as const).map((style) => (
            <label key={style} className="mr-3 inline-flex items-center gap-1">
              <input
                type="radio"
                aria-label={`keyboard ${style}`}
                checked={config.keyboardStyle === style}
                onChange={() => setConfig((prev) => ({ ...prev, keyboardStyle: style }))}
              />
              {style}
            </label>
          ))}
        </fieldset>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="showTimer"
            checked={config.showTimer}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, showTimer: event.currentTarget.checked }))
            }
          />
          showTimer
        </label>
        <div className="mt-2 grid grid-cols-[1fr] gap-1">
          <label htmlFor="game-sandbox-timer-seconds" className="text-[11px] text-zinc-400">
            Timer (seconds) {config.showTimer ? "" : "(off)"}
          </label>
          <input
            id="game-sandbox-timer-seconds"
            type="number"
            min={TIMER_SECONDS_MIN}
            max={TIMER_SECONDS_MAX}
            aria-label="Timer seconds"
            disabled={!config.showTimer}
            value={config.timerSeconds}
            onChange={(e) => {
              const v = clampTimerSeconds(Number(e.target.value));
              setConfig((prev) => ({ ...prev, timerSeconds: v }));
            }}
            className="w-full rounded border border-white/20 bg-zinc-800 px-2 py-1 text-white disabled:opacity-40"
          />
          <div className="text-[10px] text-zinc-500" aria-live="polite">
            {config.showTimer
              ? `Ring + countdown appear in the game (${config.timerSeconds}s)`
              : "Enable showTimer to use countdown"}
          </div>
        </div>
      </div>
    );
  }, [config, game]);

  if (launched && game === "word-radar") {
    return (
      <div className="fixed inset-0 z-[100]">
        <WordRadar
          items={DIAG_WORD_RADAR_ITEMS}
          interimTranscript={interimTranscript}
          sendMessage={sendMessage}
          autoStart={!wordRadarShowIntro}
          timerSeconds={config.showTimer ? config.timerSeconds : undefined}
          showKeyboard={config.inputMode === "keyboard"}
          inputMode={config.inputMode}
          speakStyle={config.speakStyle}
          keyboardStyle={config.keyboardStyle}
          personalBests={personalBests}
          childId={childId}
          onComplete={(result: WordRadarResult) => {
            console.log("  🎮 [GameSandbox] word-radar complete", result);
            setAccuracy(result.accuracy);
            setLaunched(false);
          }}
        />
      </div>
    );
  }

  return (
    <section
      className="mt-4 border-t border-white/15 pt-3 text-xs text-zinc-100"
      aria-label="Game Sandbox"
    >
      <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-400">
        Game sandbox
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label htmlFor="game-sandbox-game">Game</label>
        <select
          id="game-sandbox-game"
          aria-label="Game"
          value={game}
          onChange={(event) => setGame(event.currentTarget.value)}
          className="rounded border border-white/20 bg-zinc-800 px-2 py-1 text-white"
        >
          <option value="word-radar">word-radar</option>
        </select>
        <label htmlFor="game-sandbox-child">Child</label>
        <select
          id="game-sandbox-child"
          aria-label="Child"
          value={childId}
          onChange={(event) => setChildId(event.currentTarget.value)}
          className="rounded border border-white/20 bg-zinc-800 px-2 py-1 text-white"
        >
          <option value="ila">ila</option>
          <option value="reina">reina</option>
          <option value="creator">creator</option>
        </select>
      </div>
      {configControls}
      <button
        type="button"
        className="mt-3 w-full rounded-md bg-violet-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
        onClick={() => {
          console.log("  🎮 [GameSandbox] launch word-radar", { childId, config });
          setLaunched(true);
        }}
      >
        Test Word Radar
      </button>
      {accuracy !== null ? (
        <div className="mt-2 text-zinc-300">Accuracy {(accuracy * 100).toFixed(0)}%</div>
      ) : null}
    </section>
  );
}
