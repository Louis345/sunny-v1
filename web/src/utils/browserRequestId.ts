type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (target: Uint8Array) => Uint8Array;
};

type EntropyFallback = {
  now: () => number;
  random: () => number;
};

let fallbackSequence = 0;

/**
 * Browsers omit crypto.randomUUID on non-secure LAN HTTP pages even though
 * getRandomValues is still available. Sunny's kiosk runs exactly that way.
 */
export function createBrowserRequestId(
  source: BrowserCrypto = globalThis.crypto as BrowserCrypto,
  fallback: EntropyFallback = { now: Date.now, random: Math.random },
): string {
  if (typeof source.randomUUID === "function") {
    return source.randomUUID();
  }

  if (typeof source.getRandomValues === "function") {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  fallbackSequence += 1;
  return `sunny-${fallback.now().toString(16)}-${Math.floor(fallback.random() * 16).toString(16)}-${fallbackSequence.toString(36)}`;
}
