import { useCallback, useEffect, useRef, useState } from "react";
import { createActor, type SnapshotFrom } from "xstate";
import {
  adventurePreparationMachine,
  type PreparationEvent,
  type PreparationMode,
  type PreparationStop,
  type PreparationSubject,
} from "./adventurePreparationMachine";

type Snapshot = SnapshotFrom<typeof adventurePreparationMachine>;

/**
 * Runs the preparation machine while `active`; a new `scopeKey` (another assignment
 * or mode) starts a fresh machine. `say` is called once per spoken line, never on
 * re-render.
 */
export function useAdventurePreparation(input: {
  subject: PreparationSubject;
  say: (line: string) => void;
  active?: boolean;
  scopeKey?: string;
  mode?: PreparationMode;
  initialStops?: PreparationStop[];
  initialReady?: number;
}) {
  const sayRef = useRef(input.say);
  sayRef.current = input.say;
  const initialRef = useRef({ stops: input.initialStops, ready: input.initialReady });
  initialRef.current = { stops: input.initialStops, ready: input.initialReady };
  const actorRef = useRef<ReturnType<typeof createActor<typeof adventurePreparationMachine>> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const active = input.active ?? true;

  useEffect(() => {
    if (!active) { setSnapshot(null); return; }
    const actor = createActor(
      adventurePreparationMachine.provide({ actions: { speak: ({ context }) => sayRef.current(context.line) } }),
      { input: { subject: input.subject, mode: input.mode ?? "live", stops: initialRef.current.stops, ready: initialRef.current.ready } },
    );
    const subscription = actor.subscribe(setSnapshot);
    actorRef.current = actor;
    actor.start();
    console.log(` 🎮 [adventure-preparation] [machine] [started] mode=${input.mode ?? "live"} scope=${input.scopeKey ?? "story"}`);
    return () => { subscription.unsubscribe(); actor.stop(); actorRef.current = null; };
  }, [active, input.subject, input.mode, input.scopeKey]);

  const send = useCallback((event: PreparationEvent) => actorRef.current?.send(event), []);
  return { snapshot, send };
}
