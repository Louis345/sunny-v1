import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../artifacts/wardrobe-certification/', import.meta.url);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const messages = [];
  page.on('console', message => messages.push(message.text()));
  await page.goto(process.env.WARDROBE_LAB_URL ?? 'http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
  await page.getByRole('heading', { name: 'Wardrobe Certification Lab', exact: true }).waitFor();
  const buttons = await page.getByRole('navigation', { name: 'Character model reviews' }).getByRole('button').all();
  assert.equal(buttons.length, 8);
  let captures = 0;
  for (let index = 0; index < buttons.length; index++) {
    const button = buttons[index];
    const label = await button.getAttribute('aria-label');
    const name = label.split(' ')[1].toLowerCase();
    if (process.env.WARDROBE_CASE && process.env.WARDROBE_CASE !== name) continue;
    await button.click();
    await page.waitForFunction(() => {
      const panes = [...document.querySelectorAll('[data-wardrobe-state]')];
      return panes.length === 2 && panes.every(pane => ['ready','failed'].includes(pane.dataset.wardrobeState));
    }, {}, {timeout:25000});
    await page.waitForTimeout(500);
    captures++;
    await page.screenshot({ path: new URL(`${process.env.WARDROBE_STAGE ?? "runtime"}-${name}.png`, root).pathname, fullPage: true });
  }
  await writeFile(new URL('browser-rendering.log', root), messages.join('\n'));
  assert.equal(messages.filter(message => /Material .* is not compatible/.test(message)).length, 0, 'VRM material/render backend mismatch');
  assert.ok(messages.some(message => message.includes('downloaded_outfit applied')), 'No garment rendered');
  console.log(` 🎮 [wardrobe-browser] material compatibility passed; ${captures} companion captures saved (load outcome remains in log)`);
} finally {
  await browser.close();
}
