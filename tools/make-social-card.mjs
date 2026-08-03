#!/usr/bin/env node
/**
 * make-social-card.mjs — renders tools/social-card.html to icons/social-card.png.
 *
 * This is the one asset the project cannot draw with arithmetic alone, because
 * a link-preview card needs real typography. It uses whatever headless Chromium
 * is already on the machine (Playwright or Puppeteer); the rendered PNG is
 * committed, so nobody needs a browser to build or deploy the site.
 *
 *   npm run build:social      (needs playwright or puppeteer installed)
 *
 * ERRERLabs — MIT licensed.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = pathToFileURL(join(root, 'tools/social-card.html')).href;
const out = join(root, 'icons/social-card.png');

async function launch() {
  for (const [name, launcher] of [
    ['playwright', async (m) => m.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })],
    ['puppeteer', async (m) => m.default.launch()]
  ]) {
    try {
      const mod = await import(name);
      return { browser: await launcher(mod), name };
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    }
  }
  return null;
}

const launched = await launch();

if (!launched) {
  console.error(
    'No headless browser found.\n' +
    'Install one first:  npm i -D playwright\n' +
    'The committed icons/social-card.png is still valid — this only regenerates it.'
  );
  process.exit(1);
}

const { browser, name } = launched;
const page = await browser.newPage();
await page.setViewportSize?.({ width: 1200, height: 630 });
await page.setViewport?.({ width: 1200, height: 630 });
await page.goto(source, { waitUntil: 'networkidle' in page ? 'networkidle' : 'load' });
await new Promise(r => setTimeout(r, 250));   // let fonts settle
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();

console.log(`social-card.png rendered at 1200x630 via ${name}`);
