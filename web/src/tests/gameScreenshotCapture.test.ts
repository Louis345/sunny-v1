import { describe, expect, it, vi } from "vitest";
import {
  captureKioskScreenshotPngBase64,
  pickScreenshotTarget,
} from "../utils/gameScreenshotCapture";

function mockIframeWithBody(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const innerDoc = iframe.contentDocument!;
  innerDoc.open();
  innerDoc.write("<html><body><p>game</p></body></html>");
  innerDoc.close();
  document.body.removeChild(iframe);
  return iframe;
}

describe("pickScreenshotTarget", () => {
  it("uses adventure iframe inner body when same-origin", () => {
    const adv = mockIframeWithBody();
    const canvas = document.createElement("iframe");
    const body = document.body;
    expect(pickScreenshotTarget(adv, canvas, body)).toBe(adv.contentDocument!.body);
  });

  it("falls back to document.body when both iframe refs are null", () => {
    const body = document.body;
    expect(pickScreenshotTarget(null, null, body)).toBe(body);
  });

  it("falls back when adventure iframe is cross-origin (contentDocument throws)", () => {
    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get() {
        throw new DOMException("Blocked a frame", "SecurityError");
      },
    });
    const body = document.body;
    expect(pickScreenshotTarget(iframe, null, body)).toBe(body);
  });
});

describe("captureKioskScreenshotPngBase64", () => {
  it("returns base64 when html2canvas succeeds on iframe body", async () => {
    const adv = mockIframeWithBody();
    const html2canvas = vi.fn().mockResolvedValue({
      toDataURL: () => "data:image/png;base64,AAA",
    });
    const out = await captureKioskScreenshotPngBase64({
      adventureIframe: adv,
      canvasIframe: null,
      documentBody: document.body,
      html2canvas,
    });
    expect(out).toBe("AAA");
    expect(html2canvas).toHaveBeenCalledTimes(1);
  });

  it("uses document.body when both iframes are null and returns base64", async () => {
    const html2canvas = vi.fn().mockResolvedValue({
      toDataURL: () => "data:image/png;base64,BBBB",
    });
    const out = await captureKioskScreenshotPngBase64({
      adventureIframe: null,
      canvasIframe: null,
      documentBody: document.body,
      html2canvas,
    });
    expect(out).toBe("BBBB");
    expect(html2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ useCORS: true }),
    );
  });

  it("retries with document.body when first target throws SecurityError", async () => {
    const adv = mockIframeWithBody();
    const html2canvas = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("cross-origin", "SecurityError"))
      .mockResolvedValueOnce({
        toDataURL: () => "data:image/png;base64,CC",
      });
    const out = await captureKioskScreenshotPngBase64({
      adventureIframe: adv,
      canvasIframe: null,
      documentBody: document.body,
      html2canvas,
    });
    expect(out).toBe("CC");
    expect(html2canvas).toHaveBeenCalledTimes(2);
    expect(html2canvas.mock.calls[1][0]).toBe(document.body);
  });

  it("returns non-empty base64 when page body is visible (fallback path)", async () => {
    const html2canvas = vi.fn().mockResolvedValue({
      toDataURL: () => "data:image/png;base64,Zm9v",
    });
    const out = await captureKioskScreenshotPngBase64({
      adventureIframe: null,
      canvasIframe: null,
      documentBody: document.body,
      html2canvas,
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
