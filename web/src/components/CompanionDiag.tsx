import { useCallback, useMemo, useState } from "react";
import type {
  CapabilityDefinition,
  CompanionCapabilityPhase,
  CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../../../src/shared/companions/registry";
import { validateCompanionCommand } from "../../../src/shared/companions/validateCompanionCommand";
import {
  cloneCompanionDefaults,
  mergeCompanionConfigWithDefaults,
  type CompanionConfig,
} from "../../../src/shared/companionTypes";
import { CompanionLayer } from "./CompanionLayer";

const PHASE_LABEL: Record<CompanionCapabilityPhase, string> = {
  0.5: "Phase 0.5",
  1: "Phase 1 (contract)",
  2: "Phase 2 (future)",
  3: "Phase 3 (future)",
};

function groupByPhase(): Map<CompanionCapabilityPhase, CapabilityDefinition[]> {
  const m = new Map<CompanionCapabilityPhase, CapabilityDefinition[]>();
  for (const def of COMPANION_CAPABILITIES.values()) {
    const list = m.get(def.phase) ?? [];
    list.push(def);
    m.set(def.phase, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.type.localeCompare(b.type));
  }
  return m;
}

/**
 * Standalone companion QA (COMPANION-API-008). No voice session.
 */
export function CompanionDiag() {
  const [companion, setCompanion] = useState<CompanionConfig>(() =>
    cloneCompanionDefaults(),
  );
  const [commands, setCommands] = useState<CompanionCommand[]>([]);
  const [controlValues, setControlValues] = useState<Record<string, Record<string, unknown>>>(
    () => {
      const init: Record<string, Record<string, unknown>> = {};
      for (const def of COMPANION_CAPABILITIES.values()) {
        init[def.type] = { ...def.defaultPayload };
        for (const c of def.diagControls) {
          if (c.kind === "slider" && init[def.type]![c.key] === undefined) {
            init[def.type]![c.key] = c.default;
          }
          if (c.kind === "toggle" && init[def.type]![c.key] === undefined) {
            init[def.type]![c.key] = c.default;
          }
        }
      }
      return init;
    },
  );

  const grouped = useMemo(() => groupByPhase(), []);
  const phaseKeys = useMemo(
    () =>
      [...grouped.keys()].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1)),
    [grouped],
  );

  const fire = useCallback((type: string) => {
    const payload = { ...(controlValues[type] ?? {}) };
    if (type === "emote" && payload["duration_ms"] === 0) {
      delete payload["duration_ms"];
    }
    const cmd = validateCompanionCommand(
      { type, payload },
      COMPANION_CAPABILITIES,
      { childId: "diag", source: "diag" },
    );
    if (!cmd) return;
    setCommands((prev) => [...prev, cmd]);
  }, [controlValues]);

  const onVrmFile = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCompanion((c) => mergeCompanionConfigWithDefaults({ ...c, vrmUrl: url }));
  }, []);

  const last = commands[commands.length - 1] ?? null;

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-zinc-800 p-4">
        <h1 className="text-lg font-semibold text-white">Companion diag</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Fire validated commands from the registry. Right: same CompanionLayer as production.
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-zinc-400">Audition VRM (.vrm)</span>
          <input
            type="file"
            accept=".vrm"
            className="mt-1 block w-full text-sm text-zinc-300"
            onChange={(e) => onVrmFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {phaseKeys.map((phase) => {
          const defs = grouped.get(phase) ?? [];
          if (defs.length === 0) return null;
          return (
            <div key={String(phase)} className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                {PHASE_LABEL[phase] ?? `Phase ${phase}`}
              </h2>
              {defs.map((def) => (
                <div
                  key={def.type}
                  className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                >
                  <div className="font-medium text-white">{def.diagLabel}</div>
                  <div className="text-xs text-zinc-500">{def.type}</div>
                  <div className="mt-2 space-y-2">
                    {def.diagControls.map((ctrl) => {
                      if (ctrl.kind === "dropdown") {
                        return (
                          <label key={ctrl.key} className="block text-xs">
                            <span className="text-zinc-400">{ctrl.label}</span>
                            <select
                              className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-sm"
                              value={String(
                                (controlValues[def.type]?.[ctrl.key] as string) ??
                                  ctrl.options[0] ??
                                  "",
                              )}
                              onChange={(e) => {
                                const v = e.target.value;
                                setControlValues((prev) => ({
                                  ...prev,
                                  [def.type]: { ...prev[def.type], [ctrl.key]: v },
                                }));
                              }}
                            >
                              {ctrl.options.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      }
                      if (ctrl.kind === "slider") {
                        const v = Number(
                          controlValues[def.type]?.[ctrl.key] ?? ctrl.default,
                        );
                        return (
                          <label key={ctrl.key} className="block text-xs">
                            <span className="text-zinc-400">
                              {ctrl.label}: {v}
                            </span>
                            <input
                              type="range"
                              min={ctrl.min}
                              max={ctrl.max}
                              step={ctrl.step}
                              value={v}
                              className="mt-1 w-full"
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setControlValues((prev) => ({
                                  ...prev,
                                  [def.type]: { ...prev[def.type], [ctrl.key]: n },
                                }));
                              }}
                            />
                          </label>
                        );
                      }
                      return (
                        <label key={ctrl.key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(controlValues[def.type]?.[ctrl.key] ?? ctrl.default)}
                            onChange={(e) => {
                              setControlValues((prev) => ({
                                ...prev,
                                [def.type]: {
                                  ...prev[def.type],
                                  [ctrl.key]: e.target.checked,
                                },
                              }));
                            }}
                          />
                          {ctrl.label}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
                    onClick={() => fire(def.type)}
                  >
                    Fire {def.type}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </aside>
      <div className="relative min-w-0 flex-1">
        <div className="absolute left-4 top-4 z-20 max-w-xl rounded-lg border border-zinc-800 bg-zinc-900/90 p-3 text-sm text-zinc-200">
          <div className="text-xs font-bold uppercase text-zinc-500">Last command</div>
          {last ? (
            <pre className="mt-2 overflow-x-auto text-xs text-zinc-300">
              {JSON.stringify(last, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-zinc-500">None yet</p>
          )}
        </div>
        <CompanionLayer
          childId="diag"
          companion={companion}
          toggledOff={false}
          companionEvents={[]}
          companionCommands={commands}
        />
      </div>
    </div>
  );
}
