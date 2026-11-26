// Stage 2.1b: the photometric body (js/ldcbody.js) — a wire mesh proportional to I(C, γ), turned
// with the luminaire, two scales (decided 26 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bodyLines, maxIntensity, bodyScales, cleanLdc, LDC_DEFAULTS, C_STEP, G_STEP } from '../js/ldcbody.js';
import { createPhotometry } from '../js/photometry.js';
import { parsePhotometryFile } from '../js/photfile.js';
import { lumMatrix } from '../js/direct.js';

const D = Math.PI / 180;
const fixture = (f) => parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${f}`, import.meta.url), 'latin1'), f);

test('the mesh: 24 meridians, rings every 15° where there is light; every point at r = I·scale', () => {
  const phot = createPhotometry({ type: 'cosine', flux: 1000 });
  const lum = { pos: [2, 1, 2.8], psi: 0 };
  const lines = bodyLines(phot, lum, 0.001);
  // downlight: 24 meridians and the rings 15…75° (90° and up have no light)
  assert.equal(lines.length, 360 / C_STEP + 5);
  const I0 = 1000 / Math.PI;
  for (const l of lines) for (const q of l) {
    const d = [q[0] - 2, q[1] - 1, q[2] - 2.8], r = Math.hypot(...d);
    const g = Math.atan2(Math.hypot(d[0], d[1]), -d[2]);
    assert.ok(Math.abs(r - I0 * Math.max(0, Math.cos(g)) * 0.001) < 1e-12);
    assert.ok(q[2] <= 2.8 + 1e-12);
  }
  // the axis: the meridians meet at γ = 0, I0 · scale below the centre
  assert.ok(lines.slice(0, 24).every((l) => Math.abs(l[0][2] - (2.8 - I0 * 0.001)) < 1e-12));
});

test('the light going up is drawn; the body turns with ψ and the tilt', () => {
  const up = createPhotometry({ type: 'directIndirect', flux: 1000, fUp: 0.4 });
  const lines = bodyLines(up, { pos: [0, 0, 2], psi: 0 }, 0.001);
  assert.ok(lines.some((l) => l.some((q) => q[2] > 2 + 0.05)));
  assert.equal(lines.length, 360 / C_STEP + 180 / G_STEP - 1 - 1); // no ring at 90° (no light there)
  // tilted: the axis of the beam turns with R
  const phot = createPhotometry({ type: 'cosine', flux: 1000 });
  const lum = { pos: [1, 1, 3], psi: 0.5, tx: 0.3, ty: -0.6 };
  const R = lumMatrix(lum), tip = bodyLines(phot, lum, 0.001)[0][0];
  const a = [-R[2], -R[5], -R[8]], I0 = 1000 / Math.PI * 0.001;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(tip[i] - (lum.pos[i] + a[i] * I0)) < 1e-12);
});

test('a file: the largest intensity, and the body inside it', () => {
  const phot = createPhotometry({ type: 'file', table: fixture('ERCO-C1000001.ldt') });
  const m = maxIntensity(phot);
  assert.ok(m > 0);
  const s = 1 / m;
  for (const l of bodyLines(phot, { pos: [0, 0, 0], psi: 0 }, s)) for (const q of l) assert.ok(Math.hypot(...q) <= 1 + 1e-9);
});

test('scales: by the intensity the strongest type has the length; equally large every type has it', () => {
  const imax = new Map([['a', 4000], ['b', 1000], ['c', 0]]);
  const sI = bodyScales(imax, 3, 1, 'I'), sE = bodyScales(imax, 3, 1, 'eq');
  assert.equal(sI.get('a') * 4000, 1);
  assert.equal(sI.get('b') * 1000, 0.25);
  assert.equal(sE.get('b') * 1000, 1);
  assert.equal(sE.get('c'), 0);
  assert.equal(bodyScales(imax, 3, 2, 'I').get('a') * 4000, 2);
});

test('settings: defaults, limits, unknown values', () => {
  assert.deepEqual(cleanLdc(null), { ...LDC_DEFAULTS });
  assert.deepEqual(cleanLdc({ on: true, size: 5, scale: 'eq', who: 'sel' }), { on: true, size: 2, scale: 'eq', who: 'sel' });
  assert.deepEqual(cleanLdc({ on: 'x', size: 'a', scale: 'z', who: 1 }), { ...LDC_DEFAULTS });
});
