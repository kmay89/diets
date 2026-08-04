/**
 * sync-web.mjs — assemble native/www from the site at the repo root.
 *
 * The web app has no build step and that is worth keeping, so Capacitor is not
 * pointed at the repository root. It would work, and it would also bundle
 * node_modules, the test suite, the tools directory and the git history into
 * every copy of the app on the App Store.
 *
 * Instead this copies exactly what ships: the same set the service worker
 * precaches, plus the directories it derives at runtime. The list is not
 * hand-kept — it is read out of sw.js — because a hand-kept list of files is
 * a list that goes stale the week after somebody adds a module, and the failure
 * is a blank screen on a phone rather than an error anybody sees here.
 *
 * ERRERLabs — MIT licensed.
 */

import { cp, mkdir, rm, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, '..', 'www');

/**
 * Whole directories the app reads at runtime rather than by name. The service
 * worker derives the food icons and recipe parts from the data at install time;
 * on a phone there is no network to derive them from, so they all come along.
 */
const TREES = ['css', 'js', 'data', 'fonts', 'icons'];

/**
 * Left out of the bundle. Both exist so a link to a recipe looks right when it
 * is pasted into a message — they are read by crawlers and preview fetchers,
 * never by the app, and together they are 14 MB of what is otherwise a 6 MB
 * app. The food icons, which the app does render, come along in full.
 */
const SKIP = ['icons/cards', 'icons/social-card.png'];

/** Everything at the root that the service worker names explicitly. */
async function rootFiles() {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const named = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
  const files = new Set(['index.html', 'sw.js', 'manifest.webmanifest', '404.html']);
  for (const path of named) {
    if (!path || path.includes('/')) continue;   // trees are handled above
    files.add(path);
  }
  return [...files];
}

const exists = (path) => access(path).then(() => true, () => false);

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  let copied = 0;
  for (const tree of TREES) {
    const from = join(root, tree);
    if (!(await exists(from))) continue;
    await cp(from, join(out, tree), {
      recursive: true,
      filter: (src) => !SKIP.some(skip => src === join(root, skip) || src.startsWith(join(root, skip) + '/'))
    });
    copied++;
  }

  for (const file of await rootFiles()) {
    const from = join(root, file);
    if (!(await exists(from))) continue;
    await cp(from, join(out, file));
    copied++;
  }

  // The shared /r/ pages are for crawlers and first-time visitors on the web.
  // Inside the app every one of them is a screen you can already reach, so they
  // are left behind rather than shipped as 44 pages of duplicate HTML.
  console.log(`✓ www assembled from ${copied} entries at the repo root`);
}

main().catch(err => {
  console.error('Could not assemble www:', err.message);
  process.exit(1);
});
