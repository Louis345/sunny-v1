/**
 * Kiosk screenshot capture for the voice client's screenshot_request flow.
 * Prefers same-origin iframe document bodies, then falls back to the full page.
 */

export type Html2CanvasLike = (
  element: HTMLElement,
  opts?: { useCORS?: boolean; logging?: boolean },
) => Promise<{ toDataURL: (type: string) => string }>;

function isSecurityError(e: unknown): boolean {
  return (
    e instanceof DOMException && e.name === "SecurityError"
  );
}

/** Resolve capture element: adventure iframe inner body, then canvas iframe, then full page. */
export function pickScreenshotTarget(
  adventureIframe: HTMLIFrameElement | null,
  canvasIframe: HTMLIFrameElement | null,
  documentBody: HTMLElement,
): HTMLElement {
  const fromIframe = (iframe: HTMLIFrameElement | null): HTMLElement | null => {
    if (!iframe) return null;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) return doc.body;
    } catch (e) {
      if (isSecurityError(e)) return null;
      throw e;
    }
    return iframe;
  };
  return (
    fromIframe(adventureIframe) ??
    fromIframe(canvasIframe) ??
    documentBody
  );
}

const PNG_PREFIX = /^data:image\/png;base64,/;

/**
 * Try to grab pixels directly from a <canvas> element inside an iframe.
 * This is the only reliable way to capture WebGL / 2D-canvas game output —
 * html2canvas cannot replay draw calls and returns a blank image for those games.
 * Returns null if no canvas is found, the canvas is blank, or it is cross-origin tainted.
 */
function tryDirectCanvasCapture(iframe: HTMLIFrameElement | null): string | null {
  if (!iframe) return null;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return null;
    const canvas = doc.querySelector("canvas");
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL("image/png");
    // A completely blank canvas encodes to a very short string (~100 chars).
    // Anything that small isn't useful; fall through to html2canvas.
    if (dataUrl.length < 300) return null;
    return dataUrl.replace(PNG_PREFIX, "");
  } catch {
    // SecurityError from a tainted canvas or cross-origin doc — fall through.
    return null;
  }
}

/**
 * Renders the target with html2canvas; on SecurityError or other failure on a
 * non-body target, retries with document.body.
 */
export async function captureKioskScreenshotPngBase64(options: {
  adventureIframe: HTMLIFrameElement | null;
  canvasIframe: HTMLIFrameElement | null;
  documentBody: HTMLElement;
  html2canvas: Html2CanvasLike;
}): Promise<string> {
  const { html2canvas, documentBody } = options;

  // Prefer direct canvas pixel capture (preserves WebGL/2D content).
  const direct =
    tryDirectCanvasCapture(options.adventureIframe) ??
    tryDirectCanvasCapture(options.canvasIframe);
  if (direct) return direct;

  // Fall back to html2canvas for DOM-only games (word-builder, spell-check, etc.)
  const target = pickScreenshotTarget(
    options.adventureIframe,
    options.canvasIframe,
    documentBody,
  );

  const render = async (el: HTMLElement): Promise<string> => {
    const canvas = await html2canvas(el, {
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL("image/png").replace(PNG_PREFIX, "");
  };

  try {
    return await render(target);
  } catch (e) {
    if (isSecurityError(e) || target !== documentBody) {
      return await render(documentBody);
    }
    throw e;
  }
}
