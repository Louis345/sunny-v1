import fs from "fs";
import path from "path";
import type { Browser, Page } from "playwright";
import type { SyntheticChildAction, SyntheticPersonaId } from "./syntheticChildLab";

export type SyntheticChildBrowserAvailability = {
  engine: "playwright";
  packageName: "playwright";
  available: boolean;
  reason?: string;
};

export type SyntheticChildBrowserDriverOptions = {
  labDir: string;
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
};

export type SyntheticChildBrowserDriver = {
  engine: "playwright";
  labDir: string;
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
};

export type SyntheticChildPageHandle = {
  browser: Browser;
  page: Page;
};

export type SyntheticChildBrowserEvent = SyntheticChildAction & {
  sessionId: string;
  personaId: SyntheticPersonaId;
  iteration: number;
  deliveredTo: string[];
};

export type BrowserEvidenceEvent = {
  source: "browser";
  eventType: string;
  sessionId: string;
  personaId: SyntheticPersonaId;
  iteration: number;
  activityId?: string;
  nodeId?: string;
  target?: string;
  answerVisibility?: "hidden" | "visible" | "revealed" | "unknown";
  evidenceTier?: string;
  phase?: string;
  transcriptSource?: "synthetic_child" | "fake_audio" | "app";
  text?: string;
  timestamp: string;
};

export type SyntheticChildBrowserRunInput = {
  url: string;
  personaId: SyntheticPersonaId;
  iteration: number;
  sessionId: string;
  browserProfileChildId?: string;
  actions: SyntheticChildAction[];
};

export type SyntheticChildBrowserRunResult = {
  engine: "playwright";
  url: string;
  sessionId: string;
  personaId: SyntheticPersonaId;
  iteration: number;
  screenshots: string[];
  events: SyntheticChildBrowserEvent[];
  browserEvents: BrowserEvidenceEvent[];
  errors: string[];
};

export function createSyntheticChildBrowserDriver(
  opts: SyntheticChildBrowserDriverOptions,
): SyntheticChildBrowserDriver {
  return {
    engine: "playwright",
    labDir: opts.labDir,
    headless: opts.headless ?? true,
    viewport: opts.viewport ?? { width: 1440, height: 900 },
  };
}

export async function resolveSyntheticChildBrowserAvailability(): Promise<SyntheticChildBrowserAvailability> {
  try {
    const playwright = await import("playwright");
    if (!playwright.chromium) {
      return {
        engine: "playwright",
        packageName: "playwright",
        available: false,
        reason: "playwright package loaded but chromium launcher was missing",
      };
    }
    const executablePath = playwright.chromium.executablePath();
    if (!fs.existsSync(executablePath)) {
      return {
        engine: "playwright",
        packageName: "playwright",
        available: false,
        reason:
          "playwright chromium browser is not installed; run `npx playwright install chromium`",
      };
    }
    return {
      engine: "playwright",
      packageName: "playwright",
      available: true,
    };
  } catch (error) {
    return {
      engine: "playwright",
      packageName: "playwright",
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function withSyntheticChildPage<T>(
  driver: SyntheticChildBrowserDriver,
  url: string,
  run: (handle: SyntheticChildPageHandle) => Promise<T>,
): Promise<T> {
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: driver.headless,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: driver.viewport,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return await run({ browser, page });
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function captureSyntheticChildScreenshot(input: {
  page: Page;
  labDir: string;
  name: string;
}): Promise<string> {
  const safeName = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "screenshot";
  const screenshotDir = path.join(input.labDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const file = path.join(screenshotDir, `${safeName}.png`);
  await input.page.screenshot({ path: file, fullPage: true });
  return file;
}

function attr(value: string | number): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function clickFirstMatching(
  page: Page,
  selectors: string[],
  timeoutMs = 8_000,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      if ((await locator.count()) > 0) {
        const first = locator.first();
        if (await first.isVisible().catch(() => false)) {
          await first.click({ force: true, timeout: 1_000 });
          return true;
        }
      }
    }
    await page.waitForTimeout(150);
  }
  return false;
}

async function waitForLoadingOverlayToClear(page: Page, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  const loadingOverlay = page.locator('[data-testid="session-loading-overlay"]');
  while (Date.now() - startedAt < timeoutMs) {
    const count = await loadingOverlay.count().catch(() => 0);
    if (count === 0) return;
    const visible = await loadingOverlay.first().isVisible().catch(() => false);
    if (!visible) return;
    await page.waitForTimeout(150);
  }
}

async function installSyntheticChildBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type SyntheticWindow = {
      __sunnySyntheticChildEvents?: unknown[];
      __sunnyBrowserEvidenceEvents?: unknown[];
      SunnySyntheticChild?: {
        record: (event: unknown) => void;
      };
      SunnyActivity?: Record<string, unknown>;
      CustomEvent: new (type: string, init?: unknown) => unknown;
      dispatchEvent: (event: unknown) => boolean;
      addEventListener?: (type: string, listener: (event: unknown) => void) => void;
      postMessage?: (message: unknown, targetOrigin: string) => void;
      WebSocket?: {
        prototype?: {
          send?: (data: unknown) => unknown;
        };
      };
    };
    type EventLike = {
      data?: unknown;
      detail?: unknown;
    };
    const asRecord = (value: unknown): Record<string, unknown> => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return {};
    };
    const pickString = (
      record: Record<string, unknown>,
      fields: string[],
    ): string | undefined => {
      for (const field of fields) {
        const value = record[field];
        if (typeof value === "string" && value.trim()) return value;
      }
      return undefined;
    };
    const pickVisibility = (value: unknown): "hidden" | "visible" | "revealed" | "unknown" | undefined => {
      if (value === "hidden" || value === "visible" || value === "revealed" || value === "unknown") {
        return value;
      }
      return undefined;
    };
    const win = globalThis as unknown as SyntheticWindow;
    win.__sunnySyntheticChildEvents = [];
    win.__sunnyBrowserEvidenceEvents = [];
    const recordEvidence = (eventType: string, rawPayload: unknown) => {
      const envelope = asRecord(rawPayload);
      const payload = asRecord(envelope.payload ?? envelope.detail ?? rawPayload);
      const text = pickString(payload, ["text", "utterance", "transcript", "lastHeard"]);
      win.__sunnyBrowserEvidenceEvents?.push({
        source: "browser",
        eventType,
        activityId: pickString(payload, ["activityId", "game", "gameId", "nodeType"]),
        nodeId: pickString(payload, ["nodeId", "node"]),
        target: pickString(payload, [
          "currentTarget",
          "currentWord",
          "target",
          "word",
          "lastOutcomeWord",
        ]),
        answerVisibility: pickVisibility(payload.answerVisibility),
        evidenceTier: pickString(payload, ["evidenceTier"]),
        phase: pickString(payload, ["phase", "status"]),
        transcriptSource:
          payload.source === "synthetic_child" ||
          payload.source === "fake_audio" ||
          payload.source === "app"
            ? payload.source
            : undefined,
        text,
        timestamp: new Date().toISOString(),
      });
    };
    const wrapSunnyActivity = (activity: Record<string, unknown>): Record<string, unknown> =>
      new Proxy(activity, {
        get(target, prop, receiver) {
          const original = Reflect.get(target, prop, receiver);
          const eventTypes: Record<string, string> = {
            snapshot: "activity_snapshot",
            attempt: "activity_attempt",
            complete: "activity_complete",
            helpRequest: "activity_help_request",
            productIssue: "activity_product_issue",
          };
          const key = String(prop);
          if (typeof original === "function" && eventTypes[key]) {
            return function syntheticChildActivityWrapper(this: unknown, payload: unknown) {
              recordEvidence(eventTypes[key]!, payload);
              return original.call(this, payload);
            };
          }
          return original;
        },
      });
    let sunnyActivityValue: Record<string, unknown> | undefined;
    Object.defineProperty(win, "SunnyActivity", {
      configurable: true,
      get() {
        return sunnyActivityValue;
      },
      set(value: unknown) {
        sunnyActivityValue =
          value && typeof value === "object" && !Array.isArray(value)
            ? wrapSunnyActivity(value as Record<string, unknown>)
            : undefined;
      },
    });
    win.addEventListener?.("message", (event: unknown) => {
      const data = (event as EventLike).data;
      const message = asRecord(data);
      const eventType = pickString(message, ["type"]) ?? "message";
      recordEvidence(eventType, message);
    });
    const webSocketPrototype = win.WebSocket?.prototype;
    const originalWebSocketSend = webSocketPrototype?.send;
    if (webSocketPrototype && typeof originalWebSocketSend === "function") {
      webSocketPrototype.send = function syntheticChildWebSocketSend(this: unknown, data: unknown) {
        if (typeof data === "string") {
          try {
            const message = JSON.parse(data) as unknown;
            const messageRecord = asRecord(message);
            recordEvidence(pickString(messageRecord, ["type"]) ?? "websocket_send", messageRecord);
          } catch {
            recordEvidence("websocket_send", { payload: { text: data } });
          }
        }
        return originalWebSocketSend.call(this, data);
      };
    }
    const originalPostMessage = typeof win.postMessage === "function" ? win.postMessage.bind(win) : null;
    if (originalPostMessage) {
      win.postMessage = (message: unknown, targetOrigin: string) => {
        const messageRecord = asRecord(message);
        recordEvidence(pickString(messageRecord, ["type"]) ?? "message", messageRecord);
        originalPostMessage(message, targetOrigin);
      };
    }
    const customEvents: Array<[string, string]> = [
      ["sunny:activity:snapshot", "activity_snapshot"],
      ["sunny:activity:attempt", "activity_attempt"],
      ["sunny:activity:complete", "activity_complete"],
      ["sunny:synthetic-child-transcript", "transcript_injected"],
    ];
    for (const [domEvent, eventType] of customEvents) {
      win.addEventListener?.(domEvent, (event: unknown) => {
        recordEvidence(eventType, (event as EventLike).detail);
      });
    }
    win.SunnySyntheticChild = {
      record(event: unknown) {
        win.__sunnySyntheticChildEvents?.push(event);
        win.dispatchEvent(
          new win.CustomEvent("sunny:synthetic-child-event", { detail: event }),
        );
      },
    };
  });
}

async function installSyntheticChildBridgeOnCurrentPage(page: Page): Promise<void> {
  await page.addScriptTag({
    content: `
      (() => {
        const win = globalThis;
        if (win.__sunnyCurrentPageEvidenceBridgeInstalled) return;
        win.__sunnyCurrentPageEvidenceBridgeInstalled = true;
        win.__sunnyBrowserEvidenceEvents = Array.isArray(win.__sunnyBrowserEvidenceEvents)
          ? win.__sunnyBrowserEvidenceEvents
          : [];
        const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const pickString = (record, fields) => {
          for (const field of fields) {
            const value = record[field];
            if (typeof value === "string" && value.trim()) return value;
          }
          return undefined;
        };
        const pickVisibility = (value) =>
          value === "hidden" || value === "visible" || value === "revealed" || value === "unknown"
            ? value
            : undefined;
        const recordEvidence = (eventType, rawPayload) => {
          const envelope = asRecord(rawPayload);
          const payload = asRecord(envelope.payload ?? envelope.detail ?? rawPayload);
          win.__sunnyBrowserEvidenceEvents.push({
            source: "browser",
            eventType,
            activityId: pickString(payload, ["activityId", "game", "gameId", "nodeType"]),
            nodeId: pickString(payload, ["nodeId", "node"]),
            target: pickString(payload, ["currentTarget", "currentWord", "target", "word", "lastOutcomeWord"]),
            answerVisibility: pickVisibility(payload.answerVisibility),
            evidenceTier: pickString(payload, ["evidenceTier"]),
            phase: pickString(payload, ["phase", "status"]),
            transcriptSource:
              payload.source === "synthetic_child" || payload.source === "fake_audio" || payload.source === "app"
                ? payload.source
                : undefined,
            text: pickString(payload, ["text", "utterance", "transcript", "lastHeard"]),
            timestamp: new Date().toISOString(),
          });
        };
        const wrapSunnyActivity = (activity) => new Proxy(activity, {
          get(target, prop, receiver) {
            const original = Reflect.get(target, prop, receiver);
            const eventTypes = {
              snapshot: "activity_snapshot",
              attempt: "activity_attempt",
              complete: "activity_complete",
              helpRequest: "activity_help_request",
              productIssue: "activity_product_issue",
            };
            const key = String(prop);
            if (typeof original === "function" && eventTypes[key]) {
              return function syntheticChildActivityWrapper(payload) {
                recordEvidence(eventTypes[key], payload);
                return original.call(this, payload);
              };
            }
            return original;
          },
        });
        const existingSunnyActivity = win.SunnyActivity;
        let sunnyActivityValue =
          existingSunnyActivity && typeof existingSunnyActivity === "object" && !Array.isArray(existingSunnyActivity)
            ? wrapSunnyActivity(existingSunnyActivity)
            : undefined;
        Object.defineProperty(win, "SunnyActivity", {
          configurable: true,
          get() {
            return sunnyActivityValue;
          },
          set(value) {
            sunnyActivityValue = value && typeof value === "object" && !Array.isArray(value)
              ? wrapSunnyActivity(value)
              : undefined;
          },
        });
        const originalPostMessage = typeof win.postMessage === "function" ? win.postMessage.bind(win) : null;
        if (originalPostMessage) {
          win.postMessage = (message, targetOrigin, transfer) => {
            const messageRecord = asRecord(message);
            recordEvidence(pickString(messageRecord, ["type"]) ?? "message", messageRecord);
            originalPostMessage(message, targetOrigin, transfer);
          };
        }
        const webSocketPrototype = win.WebSocket?.prototype;
        const originalWebSocketSend = webSocketPrototype?.send;
        if (webSocketPrototype && typeof originalWebSocketSend === "function" && !webSocketPrototype.__sunnySyntheticSendWrapped) {
          Object.defineProperty(webSocketPrototype, "__sunnySyntheticSendWrapped", {
            value: true,
            configurable: true,
          });
          webSocketPrototype.send = function syntheticChildWebSocketSend(data) {
            if (typeof data === "string") {
              try {
                const message = JSON.parse(data);
                const messageRecord = asRecord(message);
                recordEvidence(pickString(messageRecord, ["type"]) ?? "websocket_send", messageRecord);
              } catch {
                recordEvidence("websocket_send", { payload: { text: data } });
              }
            }
            return originalWebSocketSend.call(this, data);
          };
        }
        win.addEventListener?.("message", (event) => {
          const message = asRecord(event.data);
          recordEvidence(pickString(message, ["type"]) ?? "message", message);
        });
        [
          ["sunny:activity:snapshot", "activity_snapshot"],
          ["sunny:activity:attempt", "activity_attempt"],
          ["sunny:activity:complete", "activity_complete"],
          ["sunny:synthetic-child-transcript", "transcript_injected"],
        ].forEach(([domEvent, eventType]) => {
          win.addEventListener?.(domEvent, (event) => recordEvidence(eventType, event.detail));
        });
      })();
    `,
  });
}

async function recordSyntheticMicrophonePreflight(page: Page, url: string): Promise<void> {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(url)) return;
  await page.evaluate(async () => {
    type SyntheticWindow = {
      __sunnyMicPreflightRecorded?: boolean;
      postMessage?: (message: unknown, targetOrigin: string) => void;
    };
    type SyntheticMediaStreamTrack = { stop?: () => void };
    type SyntheticMediaStream = { getTracks?: () => SyntheticMediaStreamTrack[] };
    type SyntheticNavigator = {
      mediaDevices?: {
        getUserMedia?: (constraints: { audio: boolean }) => Promise<SyntheticMediaStream>;
      };
    };
    const win = globalThis as unknown as SyntheticWindow;
    if (win.__sunnyMicPreflightRecorded) return;
    win.__sunnyMicPreflightRecorded = true;
    const mediaDevices = (navigator as unknown as SyntheticNavigator).mediaDevices;
    const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);
    if (!getUserMedia) return;
    try {
      const stream = await getUserMedia({ audio: true });
      win.postMessage?.({
        type: "game_state_update",
        payload: { activityId: "mic-preflight", phase: "ready" },
      }, "*");
      stream.getTracks?.().forEach((track) => track.stop?.());
    } catch (error) {
      win.postMessage?.({
        type: "game_state_update",
        payload: {
          activityId: "mic-preflight",
          phase: "mic_error",
          lastHeard: error instanceof Error ? error.name : String(error),
        },
      }, "*");
    }
  });
}

async function readBrowserEvidenceEvents(
  page: Page,
  input: SyntheticChildBrowserRunInput,
): Promise<BrowserEvidenceEvent[]> {
  const events = await page.evaluate(() => {
    type SyntheticWindow = {
      __sunnyBrowserEvidenceEvents?: unknown[];
    };
    const win = globalThis as unknown as SyntheticWindow;
    return Array.isArray(win.__sunnyBrowserEvidenceEvents)
      ? win.__sunnyBrowserEvidenceEvents
      : [];
  });
  return events.map((event) => ({
    ...(event && typeof event === "object" && !Array.isArray(event) ? event : {}),
    source: "browser",
    sessionId: input.sessionId,
    personaId: input.personaId,
    iteration: input.iteration,
    timestamp:
      event &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      typeof (event as Record<string, unknown>).timestamp === "string"
        ? ((event as Record<string, unknown>).timestamp as string)
        : new Date().toISOString(),
  })) as BrowserEvidenceEvent[];
}

async function recordBrowserEvidenceEvent(
  page: Page,
  event: Omit<BrowserEvidenceEvent, "source" | "sessionId" | "personaId" | "iteration">,
): Promise<void> {
  await page.evaluate((browserEvent) => {
    type SyntheticWindow = {
      __sunnyBrowserEvidenceEvents?: unknown[];
    };
    const win = globalThis as unknown as SyntheticWindow;
    win.__sunnyBrowserEvidenceEvents ??= [];
    win.__sunnyBrowserEvidenceEvents.push({
      source: "browser",
      ...browserEvent,
    });
  }, event);
}

async function selectChildProfileIfPresent(
  page: Page,
  childId: string | undefined,
): Promise<boolean> {
  const normalized = childId?.trim().toLowerCase();
  if (!normalized) return false;
  const clicked = await clickFirstMatching(
    page,
    [
      `[data-child-id="${attr(normalized)}"]`,
      `[data-profile-child-id="${attr(normalized)}"]`,
      `[data-testid="child-profile-${attr(normalized)}"]`,
      `[aria-label^="${attr(normalized.charAt(0).toUpperCase() + normalized.slice(1))}"]`,
      `text=${normalized.charAt(0).toUpperCase() + normalized.slice(1)}`,
    ],
    3_000,
  );
  if (!clicked) return false;
  await recordBrowserEvidenceEvent(page, {
    eventType: "profile_select",
    text: normalized,
    timestamp: new Date().toISOString(),
  });
  await page.waitForTimeout(300);
  return true;
}

async function recordSyntheticBrowserEvent(
  page: Page,
  event: SyntheticChildBrowserEvent,
): Promise<void> {
  await page.evaluate((browserEvent) => {
    type SyntheticWindow = {
      __sunnySyntheticChildEvents?: unknown[];
      SunnySyntheticChild?: {
        record: (event: unknown) => void;
      };
      CustomEvent: new (type: string, init?: unknown) => unknown;
      dispatchEvent: (event: unknown) => boolean;
      postMessage?: (message: unknown, targetOrigin: string) => void;
    };
    const win = globalThis as unknown as SyntheticWindow;
    win.__sunnySyntheticChildEvents ??= [];
    win.__sunnySyntheticChildEvents.push(browserEvent);
    win.dispatchEvent(
      new win.CustomEvent("sunny:synthetic-child-event", { detail: browserEvent }),
    );
    if (
      browserEvent.type === "say" ||
      browserEvent.type === "ask" ||
      browserEvent.type === "background"
    ) {
      win.dispatchEvent(
        new win.CustomEvent("sunny:synthetic-child-transcript", {
          detail: {
            text: browserEvent.value,
            source: "synthetic_child",
            syntheticEvent: browserEvent,
          },
        }),
      );
      win.postMessage?.(
        {
          type: "test_transcript",
          text: browserEvent.value,
          source: "synthetic_child",
          syntheticEvent: browserEvent,
        },
        "*",
      );
    }
  }, event);
}

async function performSyntheticAction(
  page: Page,
  action: SyntheticChildAction,
): Promise<string[]> {
  const deliveredTo = ["synthetic-event-bridge"];
  if (action.type === "clickNode") {
    await waitForLoadingOverlayToClear(page);
    const value = attr(action.value);
    const clicked = await clickFirstMatching(page, [
      `[data-node-id="${value}"]`,
      `[data-node-type="${value}"]`,
      `[data-activity-id="${value}"]`,
      `[aria-label="${value}"]`,
      `text=${String(action.value)}`,
    ], 10_000);
    if (clicked) deliveredTo.push("dom-click");
  } else if (action.type === "chooseMystery") {
    await waitForLoadingOverlayToClear(page);
    const value = attr(action.value);
    const clicked = await clickFirstMatching(page, [
      `[data-mystery-option="${value}"]`,
      `[data-activity-id="${value}"]`,
      `[data-node-type="${value}"]`,
      `text=${String(action.value)}`,
    ]);
    if (clicked) deliveredTo.push("dom-click");
  } else if (action.type === "answerGame") {
    const input = page.locator(
      'input[aria-label="answer"], input[name="answer"], textarea[aria-label="answer"], textarea[name="answer"]',
    );
    if ((await input.count()) > 0) {
      await input.first().fill(String(action.value));
      deliveredTo.push("dom-fill");
    }
  } else if (action.type === "wait") {
    await page.waitForTimeout(Number(action.value));
    deliveredTo.push("timer");
  } else {
    deliveredTo.push("synthetic-transcript");
  }
  return deliveredTo;
}

export async function runSyntheticChildBrowserActions(
  driver: SyntheticChildBrowserDriver,
  input: SyntheticChildBrowserRunInput,
): Promise<SyntheticChildBrowserRunResult> {
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }

  const screenshots: string[] = [];
  const events: SyntheticChildBrowserEvent[] = [];
  let browserEvents: BrowserEvidenceEvent[] = [];
  const errors: string[] = [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: driver.headless,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: driver.viewport,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  try {
    await installSyntheticChildBridge(page);
    await page.goto(input.url, { waitUntil: "domcontentloaded" });
    await installSyntheticChildBridgeOnCurrentPage(page);
    await recordSyntheticMicrophonePreflight(page, input.url);
    await selectChildProfileIfPresent(page, input.browserProfileChildId);
    screenshots.push(
      await captureSyntheticChildScreenshot({
        page,
        labDir: driver.labDir,
        name: `${input.sessionId}-start`,
      }),
    );
    for (const action of input.actions) {
      try {
        const deliveredTo = await performSyntheticAction(page, action);
        const event: SyntheticChildBrowserEvent = {
          ...action,
          sessionId: input.sessionId,
          personaId: input.personaId,
          iteration: input.iteration,
          deliveredTo,
        };
        await recordSyntheticBrowserEvent(page, event);
        events.push(event);
        await page.waitForTimeout(100);
      } catch (error) {
        errors.push(
          `${action.type}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    browserEvents = await readBrowserEvidenceEvents(page, input);
    screenshots.push(
      await captureSyntheticChildScreenshot({
        page,
        labDir: driver.labDir,
        name: `${input.sessionId}-end`,
      }),
    );
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    engine: "playwright",
    url: input.url,
    sessionId: input.sessionId,
    personaId: input.personaId,
    iteration: input.iteration,
    screenshots,
    events,
    browserEvents,
    errors,
  };
}
