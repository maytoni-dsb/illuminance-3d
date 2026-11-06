// Stage 7: mirror symmetry of a regular grid gives the same element averages as integrating every
// luminaire, and is used only when the photometry turned by ψ allows it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../js/geometry.js';
import { createPhotometry, luminaireGrid } from '../js/photometry.js';
import { parsePhotometryFile } from '../js/photfile.js';
import { elementDirect, elementDirectAdaptive, elementDirectExact, mirrorSymmetry, luminaireOrbits, elementMirrors, directAtPoint } from '../js/direct.js';
import { planeField } from '../js/workplane.js';

const fixture = (f) => parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${f}`, import.meta.url), 'latin1'), f);
const relMax = (a, b) => { let m = 0, p = 0; for (let k = 0; k < a.length; k++) { m = Math.max(m, Math.abs(a[k] - b[k])); p = Math.max(p, Math.abs(b[k])); } return m / p; };

test('element mirror maps are involutions that preserve faces and areas', () => {
  const room = createRoom({ L: 5.3, W: 3.1, H: 2.7, h: 0.4 });
  const P = elementMirrors(room.faces, room.N, room.L, room.W);
  for (const k of ['x', 'y', 'xy']) for (let g = 0; g < room.N; g++) assert.equal(P[k][P[k][g]], g);
});

test('orbits cover every luminaire once', () => {
  for (const [nx, ny] of [[1, 1], [3, 2], [4, 5], [5, 5]]) {
    const lums = luminaireGrid({ L: 6, W: 4, H: 3, nx, ny });
    const o = luminaireOrbits(lums, { x: true, y: true }, 6, 4);
    assert.equal(o.reduce((a, b) => a + b.images.length, 0), nx * ny);
    assert.equal(o.length, Math.ceil(nx / 2) * Math.ceil(ny / 2));
  }
});

test('symmetry is detected from the interpolant and ψ', () => {
  const rot = createPhotometry({ type: 'file', table: fixture('DL124-10W-3K-TRS-W.ldt') });
  assert.deepEqual(mirrorSymmetry(rot, 0.3), { x: true, y: true });
  assert.deepEqual(mirrorSymmetry(createPhotometry({ type: 'cosine', flux: 1000 }), 1), { x: true, y: true });
  for (const f of ['ERCO-C1000001.ldt', 'ERCO-32607-000.ldt', 'Nostalgia.ldt', 'TR186-1-8W4K-B.ldt']) {
    const ph = createPhotometry({ type: 'file', table: fixture(f) });
    const s0 = mirrorSymmetry(ph, 0), s90 = mirrorSymmetry(ph, Math.PI / 2);
    assert.deepEqual(s90, { x: s0.y, y: s0.x }, f); // a quarter turn swaps the two mirrors
    // the claim must hold: compare intensities in mirrored directions directly
    for (const [k, a] of [['x', Math.PI], ['y', 0]]) {
      if (!s0[k]) continue;
      for (let C = 0; C < 2 * Math.PI; C += 0.037) for (let g = 0; g < Math.PI; g += 0.041) {
        const Cm = ((a - C) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        assert.ok(Math.abs(ph.intensity(C, g) - ph.intensity(Cm, g)) <= 1e-9 * (1 + ph.intensity(C, g)), `${f} ${k}`);
      }
    }
  }
});

test('symmetric element averages equal the luminaire-by-luminaire sum', () => {
  const room = createRoom({ L: 6, W: 4, H: 3, h: 0.25 });
  for (const f of ['Focus-LED-TR032-2-12W3K-S-B.ldt', 'ERCO-C1000001.ldt', 'TR186-1-8W4K-B.ldt']) {
    const phot = createPhotometry({ type: 'file', table: fixture(f) });
    for (const psi of [0, Math.PI / 2, 0.4]) {
      const lums = luminaireGrid({ L: 6, W: 4, H: 3, nx: 3, ny: 2, hc: 0.2, psi });
      const full = elementDirectAdaptive(room, lums, phot, { symmetric: false });
      const sym = elementDirect(room, lums, phot);
      // the adaptive tolerance (10⁻³ per element) bounds the difference
      assert.ok(relMax(sym, full) < 3e-3, `${f} ψ=${psi}: ${relMax(sym, full)}`);
      assert.ok(Math.abs(sym.stats.perLum.reduce((a, b) => Math.max(a, Math.abs(b)), 0)) < 1e-3);
    }
  }
  const lobes = createPhotometry({ type: 'directIndirect', flux: 3000, fUp: 0.3 });
  const lums = luminaireGrid({ L: 6, W: 4, H: 3, nx: 3, ny: 4, hc: 0.5 });
  assert.ok(relMax(elementDirectExact(room, lums, lobes, undefined, true), elementDirectExact(room, lums, lobes)) < 1e-13);
});

test('plan nodes: symmetric direct equals the point formula', () => {
  const room = createRoom({ L: 6, W: 4, H: 3, h: 0.3 });
  const phot = createPhotometry({ type: 'file', table: fixture('Focus-LED-TR032-2-12W3K-S-B.ldt') });
  const lums = luminaireGrid({ L: 6, W: 4, H: 3, nx: 4, ny: 2, hc: 0.125 });
  const f = planeField(room, 0.8, lums, phot, new Float64Array(room.N));
  const w = f.grid.ax + 1;
  let m = 0;
  for (let k = 0; k < f.Edir.length; k += 37) {
    const x = [Math.min(Math.max((k % w) * f.grid.dx, 6e-9), 6 - 6e-9), Math.min(Math.max(Math.floor(k / w) * f.grid.dy, 6e-9), 4 - 6e-9), 0.8];
    m = Math.max(m, Math.abs(f.Edir[k] - directAtPoint(x, [0, 0, 1], lums, phot)) / directAtPoint(x, [0, 0, 1], lums, phot));
  }
  assert.ok(m < 1e-12, `${m}`);
});
