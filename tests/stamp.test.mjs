// Module version stamps in index.html (cache busting, scripts/stamp.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildImportMap, withImportMap } from '../scripts/stamp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

test('index.html stamps every module in js/ with its current content hash (run: npm run stamp)', () => {
  assert.equal(withImportMap(html, buildImportMap()), html, 'stamps are out of date: run npm run stamp');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const mods = readdirSync(root + 'js').filter((f) => f.endsWith('.js'));
  for (const f of mods) assert.match(map.imports[`./js/${f}`], new RegExp(`^\\./js/${f.replace('.', '\\.')}\\?v=[0-9a-f]{8}$`));
  assert.equal(map.imports.three, 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
});

test('stamps ignore line endings (Windows checkout with CRLF)', () => {
  const crlf = html.replace(/\r?\n/g, '\r\n');
  const out = withImportMap(crlf, buildImportMap());
  assert.equal(out, crlf);
  assert.ok(!/[^\r]\n/.test(out));
});
