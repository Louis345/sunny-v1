/**
 * COMPANION-BRIDGE-001
 * Tests for CompanionBridge's readyState retry logic.
 *
 * Red tests (fail before fix, pass after):
 *   - "injects CompanionFace via retry after load event …"
 *   - "removes the retry load listener when overlay.iframe changes …"
 *
 * Regression tests (pass both before and after fix):
 *   - "injects CompanionFace … when readyState is complete on first trigger"
 *   - "does not register a retry load listener when readyState is already complete"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";

// ── module mocks ──────────────────────────────────────────────────────────────

// Stub the heavy VRM/WebGL component — we only care whether it mounts, not how it renders.
vi.mock("../components/CompanionFace", () => ({
  CompanionFace: () => React.createElement("div", { "data-testid": "companion-face" }),
}));

// ── imports that must follow vi.mock() ────────────────────────────────────────
import { CompanionBridge } from "../components/CompanionBridge";
import type { GameIframeOverlayState } from "../components/CompanionBridge";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Anchors appended to document.body — removed in afterEach. */
const anchorsToClean: HTMLElement[] = [];

/**
 * Build a fake iframe whose contentDocument has a controllable readyState
 * and a real #sunny-companion anchor in the test document's body.
 *
 * The anchor is real (in document.body) so React's createRoot can render into it.
 */
function makeIframe(initialReadyState = "complete") {
  const anchor = document.createElement("div");
  anchor.id = "sunny-companion";
  document.body.appendChild(anchor);
  anchorsToClean.push(anchor);

  let readyState = initialReadyState;
  const mockDoc = {
    get readyState() {
      return readyState;
    },
    getElementById: vi.fn((id: string) => (id === "sunny-companion" ? anchor : null)),
  };

  const el = document.createElement("iframe");
  Object.defineProperty(el, "contentDocument", {
    get: () => mockDoc,
    configurable: true,
  });

  return {
    el,
    anchor,
    /** Change the simulated readyState (call before dispatching "load"). */
    setReadyState: (s: string) => {
      readyState = s;
    },
  };
}

function activeOverlay(
  iframe: HTMLIFrameElement,
  url = "/games/spell-check.html",
): GameIframeOverlayState {
  return { active: true, iframe, url };
}

// ── shared state / lifecycle ──────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  anchorsToClean.forEach((a) => a.parentNode?.removeChild(a));
  anchorsToClean.length = 0;
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("CompanionBridge retry logic (COMPANION-BRIDGE-001)", () => {
  let companion: CompanionConfig;

  beforeEach(() => {
    companion = cloneCompanionDefaults();
  });

  // ── regression: happy path ────────────────────────────────────────────────

  it("injects CompanionFace into iframe when readyState is complete on first trigger", async () => {
    const { el, anchor } = makeIframe("complete");

    render(
      <CompanionBridge
        overlay={activeOverlay(el)}
        companion={companion}
        companionMuted={false}
      />,
    );

    await waitFor(() => {
      expect(anchor.querySelector("[data-testid='companion-face']")).not.toBeNull();
    });
  });

  // ── RED: retry when overlay.url changes and readyState is not complete ──────
  // The bump effect only re-runs when overlay.iframe changes.  When only
  // overlay.url changes (same iframe element navigating to a new page), there is
  // no bump load-listener to fall back on.  The heavy effect fires due to the url
  // dep, sees readyState "loading", and without the fix returns early with no
  // retry — leaving CompanionFace permanently absent for that node.

  it("injects CompanionFace via retry after load event when overlay.url changes with readyState not complete", async () => {
    const { el, anchor, setReadyState } = makeIframe("complete");

    const { rerender } = render(
      <CompanionBridge
        overlay={activeOverlay(el, "/games/spell-check.html")}
        companion={companion}
        companionMuted={false}
      />,
    );

    // Wait for initial injection (readyState was "complete").
    await waitFor(() => {
      expect(anchor.querySelector("[data-testid='companion-face']")).not.toBeNull();
    });

    // Simulate: the same iframe starts navigating to a new URL (readyState drops).
    setReadyState("loading");

    // Trigger the heavy effect via url change only — overlay.iframe is unchanged,
    // so the bump effect does NOT re-run and registers no new load listener.
    await act(async () => {
      rerender(
        <CompanionBridge
          overlay={activeOverlay(el, "/games/word-builder.html")}
          companion={companion}
          companionMuted={false}
        />,
      );
    });
    await act(async () => {}); // let cleanup + early-return settle

    // Iframe finishes loading the new page.
    setReadyState("complete");
    await act(async () => {
      el.dispatchEvent(new Event("load"));
    });

    // With the fix: retry fires → iframeDocTick bumps → heavy re-runs → companion
    // reappears.  Without the fix: no retry → companion stays absent.
    await waitFor(() => {
      expect(anchor.querySelector("[data-testid='companion-face']")).not.toBeNull();
    });
  });

  // ── RED: retry listener is cleaned up on overlay change ───────────────────
  // Fails before fix because no retry listener is registered (nothing to clean up).

  it("removes the retry load listener when overlay.iframe changes before load fires", async () => {
    const { el: el1 } = makeIframe("loading");
    const { el: el2 } = makeIframe("loading");

    // Spy on el1's addEventListener / removeEventListener BEFORE rendering.
    const addSpy = vi.spyOn(el1, "addEventListener");
    const removeSpy = vi.spyOn(el1, "removeEventListener");

    const { rerender } = render(
      <CompanionBridge
        overlay={activeOverlay(el1, "/games/spell-check.html")}
        companion={companion}
        companionMuted={false}
      />,
    );

    await act(async () => {});

    // After fix: a {once:true} load listener should be registered by the heavy effect.
    const retryEntry = addSpy.mock.calls.find(
      ([type, , opts]) =>
        type === "load" &&
        typeof opts === "object" &&
        opts !== null &&
        (opts as AddEventListenerOptions).once === true,
    );
    expect(retryEntry).toBeDefined(); // FAILS before fix

    // Swap to a new iframe — should trigger heavy effect cleanup → removeEventListener.
    await act(async () => {
      rerender(
        <CompanionBridge
          overlay={activeOverlay(el2, "/games/word-builder.html")}
          companion={companion}
          companionMuted={false}
        />,
      );
    });

    // The exact retry function that was added must have been removed.
    const retryFn = retryEntry?.[1];
    expect(removeSpy).toHaveBeenCalledWith("load", retryFn);
  });

  // ── regression: no extra listener when already complete ──────────────────

  it("does not register a retry load listener when readyState is already complete", async () => {
    const { el } = makeIframe("complete");
    const addSpy = vi.spyOn(el, "addEventListener");

    render(
      <CompanionBridge
        overlay={activeOverlay(el)}
        companion={companion}
        companionMuted={false}
      />,
    );

    await act(async () => {});

    // The fix's retry path should not run when readyState is already complete.
    const retryEntry = addSpy.mock.calls.find(
      ([type, , opts]) =>
        type === "load" &&
        typeof opts === "object" &&
        opts !== null &&
        (opts as AddEventListenerOptions).once === true,
    );
    expect(retryEntry).toBeUndefined();
  });
});
