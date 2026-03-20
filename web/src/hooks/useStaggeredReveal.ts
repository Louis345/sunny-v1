import { useEffect, useRef, useState } from "react";

/**
 * Reveals ordered `items` one-by-one after `delayMs` when the list grows.
 * Resets step when `resetKey` changes (e.g. new word or new problem).
 */
export function useStaggeredReveal<T>(
  resetKey: string,
  items: readonly T[],
  delayMs: number
): T[] {
  const [step, setStep] = useState(0);
  const keyRef = useRef(resetKey);

  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      setStep(0);
      return;
    }
    setStep((s) => (items.length < s ? items.length : s));
  }, [resetKey, items.length]);

  useEffect(() => {
    if (step < items.length) {
      const id = setTimeout(() => setStep((s) => s + 1), delayMs);
      return () => clearTimeout(id);
    }
  }, [step, items.length, resetKey, delayMs]);

  return items.slice(0, step) as T[];
}
