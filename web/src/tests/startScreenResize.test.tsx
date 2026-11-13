import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { START_SKIES, StartScreenFrame, StartScreenSky } from "../components/ChildPicker";

// Bug 2026-11-10 (owner observed on the kiosk): expanding the kiosk window left white space around/below the start
// screen instead of the screen filling it.
// Why the human caught it: the owner resized the kiosk window and saw the page's white background.
// Why the logs did not: layout is never logged; the screen rendered and accepted taps normally.
// Why the lab missed it: the canvas checks measure fixed 1280x720 and 768x1024 previews and never resize a window
// after load; the start screen's size came from utility classes and the document flow, which no test measured.
// The start screen now owns the window itself (fixed to the viewport), so this test renders it with no stylesheet
// at all and checks it covers the window at several sizes, after each resize.

it("the start screen fills the window at any size and after a resize", async () => {
  const markup = renderToStaticMarkup(
    <StartScreenFrame>
      <StartScreenSky sky={START_SKIES.day} />
      <p>Who's learning today?</p>
    </StartScreenFrame>,
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    // A stray block after the screen must not push it or expose the white page underneath.
    await page.setContent(`<body style="background:#fff">${markup}<div style="height:300px"></div></body>`);
    for (const size of [{ width: 1024, height: 700 }, { width: 1600, height: 1000 }, { width: 2560, height: 1440 }, { width: 800, height: 600 }]) {
      await page.setViewportSize(size);
      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-testid=start-screen]")!.getBoundingClientRect();
        const sky = document.querySelector<HTMLElement>("[data-testid=start-screen-sky]")!.getBoundingClientRect();
        const corners = [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2], [innerWidth - 2, innerHeight - 2]]
          .map(([x, y]) => Boolean(document.elementFromPoint(x!, y!)?.closest("[data-testid=start-screen]")));
        return { frame: [frame.left, frame.top, frame.width, frame.height], sky: [sky.width, sky.height], corners, window: [innerWidth, innerHeight] };
      });
      expect(result.frame, `frame at ${size.width}x${size.height}`).toEqual([0, 0, size.width, size.height]);
      expect(result.sky).toEqual([size.width, size.height]);
      expect(result.corners).toEqual([true, true, true, true]);
    }
  } finally {
    await browser.close();
  }
}, 20000);
