/** I3: Playwright waits on document.fonts.ready before every screenshot; a slow font (Google Fonts, or a busy renderer
 * under load) stalled the spelling browser run. Browser runs block external requests and screenshot without that wait.
 * Playwright reads this switch on each screenshot in this process. */
export function screenshotsSkipFontWait(): void {
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
  console.log(" 🎮 [browser-run] [screenshot-font-wait] [off]");
}
