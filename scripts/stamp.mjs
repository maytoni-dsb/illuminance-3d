// Cache busting without a bundler: writes a version stamp for every module in js/ into the import
// map of index.html, e.g. "./js/orbit.js": "./js/orbit.js?v=3f9c2a1b". Relative imports between
// modules resolve to the same URLs, so the import map redirects them too, and a browser never
// mixes a new module with a cached old copy of another one. The stamp is a hash of the file's
// content: unchanged files keep their URL and stay cached. Line endings are normalized before
// hashing, so a Windows checkout with CRLF gets the same stamps as the repository.
//
//   node scripts/stamp.mjs          — update index.html (npm run stamp)
//   node scripts/stamp.mjs --check  — exit 1 if index.html is out of date (used by the tests)
//
// Note: import maps do not apply inside Web Workers; a module worker (stage 4) needs its own stamps.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
const BEGIN = '<script type="importmap">';
const END = '</script>';

/** Import map with a content stamp for every js/*.js module. */
export function buildImportMap(dir = root) {
  const imports = { three: THREE_URL };
  for (const f of readdirSync(join(dir, 'js')).filter((n) => n.endsWith('.js')).sort()) {
    const text = readFileSync(join(dir, 'js', f), 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 8);
    imports[`./js/${f}`] = `./js/${f}?v=${hash}`;
  }
  return { imports };
}

/** index.html with the import map replaced by `map` (keeps the file's line endings). */
export function withImportMap(html, map) {
  const crlf = html.includes('\r\n');
  html = html.replace(/\r\n/g, '\n');
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error('index.html: <script type="importmap"> not found');
  const json = JSON.stringify(map, null, 2).split('\n').map((l) => '  ' + l).join('\n');
  const out = html.slice(0, a + BEGIN.length) + '\n' + json + '\n  ' + html.slice(b);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(root, 'index.html');
  const html = readFileSync(file, 'utf8');
  const next = withImportMap(html, buildImportMap());
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error('index.html: module stamps are out of date, run: npm run stamp'); process.exit(1); }
    console.log('index.html: module stamps are up to date');
  } else if (next !== html) {
    writeFileSync(file, next);
    console.log('index.html: module stamps updated');
  } else {
    console.log('index.html: module stamps are up to date');
  }
}
