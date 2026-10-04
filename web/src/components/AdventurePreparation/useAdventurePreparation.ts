import { useCallback, useEffect, useRef, useState } from "react";
import { createActor, type SnapshotFrom } from "xstate";
import { adventurePreparationMachine, type PreparationEvent, type PreparationSubject } from "./adventurePreparationMachine";

type Snapshot = SnapshotFrom<typeof adventurePreparationMachine>;

/** Runs the preparation machine; `say` is called once per spoken line, never on re-render. */
export function useAdventurePreparation(input: { subject: PreparationSubject; say: (line: string) => void }) {
  const sayRef = useRef(input.say);
  sayRef.current = input.say;
  const actorRef = useRef<ReturnType<typeof createActor<typeof adventurePreparationMachine>> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const actor = createActor(
      adventurePreparationMachine.provide({ actions: { speak: ({ context }) => sayRef.current(context.line) } }),
      { input: { subject: input.subject } },
    );
    const subscription = actor.subscribe(setSnapshot);
    actorRef.current = actor;
    actor.start();
    return () => { subscription.unsubscribe(); actor.stop(); actorRef.current = null; };
  }, [input.subject]);

  const send = useCallback((event: PreparationEvent) => actorRef.current?.send(event), []);
  return { snapshot, send };
}
