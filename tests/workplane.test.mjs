// Work planes (results): grid, illuminance at points, indices and the status against the norm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridStep, workGrid, planeStats, planeHeights, levelStatus, ILLUMINANCE_SCALE } from '../js/workplane.js';
import { createCalc } from '../js/calc.js';
import { faceAverages } from '../js/direct.js';
import { createRoom, autoStep } from '../js/geometry.js';

test('grid step p = 0.2 · 5^lg d; points at cell centres over the whole plane', () => {
  assert.ok(Math.abs(gridStep(10) - 1) < 1e-12);
  assert.ok(Math.abs(gridStep(1) - 0.2) < 1e-12);
  const g = workGrid(6, 4, 0.8);
  assert.deepEqual([g.nx, g.ny], [Math.ceil(6 / gridStep(6)), Math.ceil(4 / gridStep(6))]);
  assert.deepEqual([g.nx, g.ny], [9, 6]);
  assert.deepEqual([...g.pts.slice(0, 3)], [6 / 18, 4 / 12, 0.8]);
  const last = g.pts.slice(-3);
  assert.ok(Math.abs(last[0] - (6 - 6 / 18)) < 1e-12 && Math.abs(last[1] - (4 - 4 / 12)) < 1e-12);
  const g10 = workGrid(10, 10, 0); // 10 / 1 = 10 exactly: no extra row from rounding
  assert.deepEqual([g10.nx, g10.ny], [10, 10]);
});

test('planes: 0.0 and 0.8 always, h when different; the normative one', () => {
  assert.deepEqual(planeHeights(0.8), [{ z: 0, normative: false }, { z: 0.8, normative: true }]);
  assert.deepEqual(planeHeights(0), [{ z: 0, normative: true }, { z: 0.8, normative: false }]);
  assert.deepEqual(planeHeights(0.7).map((p) => [p.z, p.normative]), [[0, false], [0.8, false], [0.7, true]]);
});

test('status against the required illuminance and the scale of levels', () => {
  assert.equal(levelStatus(499, 500), 'low');
  assert.equal(levelStatus(500, 500), 'ok');
  assert.equal(levelStatus(550, 500), 'ok');
  assert.equal(levelStatus(600, 500), 'high');
  assert.equal(levelStatus(480, 450), 'ok');   // not on the scale: the next level is 500
  assert.equal(levelStatus(520, 450), 'high');
  assert.ok(ILLUMINANCE_SCALE.includes(300) && ILLUMINANCE_SCALE.includes(750));
  const s = planeStats(Float64Array.of(100, 200, 300));
  assert.deepEqual([s.avg, s.min, s.max, s.u0], [200, 100, 300, 0.5]);
});

const base = { L: 6, W: 4, H: 3, nx: 3, ny: 2, flux: 4000, hc: 0, psi: 0, phot: 'cosine', rho: [0.2, 0.7, 0.5, 0.5, 0.5, 0.5], hwp: 0.8, checks: false };

test('the plane at the floor agrees with the floor elements (grid mean vs area mean)', () => {
  const r = createCalc().run(base);
  const room = createRoom({ L: 6, W: 4, H: 3, h: autoStep(6, 4, 3) });
  const E = r.Edir.map((v, g) => v + r.Eind[g]);
  const floor = faceAverages(room, E)[0];
  const p0 = r.planes.find((p) => p.z === 0);
  assert.ok(Math.abs(p0.stats.avg / floor - 1) < 0.02, `${p0.stats.avg} vs ${floor}`);
});

test('black room: no reflected light at the planes; direct part equals the point formula', () => {
  const r = createCalc().run({ ...base, rho: [0, 0, 0, 0, 0, 0] });
  for (const p of r.planes) {
    assert.ok(Math.max(...p.Eref) < 1e-12);
    assert.deepEqual([...p.E], [...p.Edir]);
  }
  // under the middle of a 1 × 1 grid of luminaires at 3 m: E = I(0) / d² = Φ / (π d²)
  const one = createCalc().run({ ...base, L: 3, W: 3, nx: 1, ny: 1, rho: [0, 0, 0, 0, 0, 0] });
  const p0 = one.planes[0];
  assert.equal(p0.nx % 2, 1); // odd grid: the centre point is under the luminaire
  const c = p0.E[(p0.nx - 1) / 2 + ((p0.ny - 1) / 2) * p0.nx];
  assert.ok(Math.abs(c - 4000 / (Math.PI * 9)) < 1e-9);
});

test('reflected light at a plane grows with the reflectances; the form factors are cached', () => {
  const c = createCalc();
  const a = c.run({ ...base, rho: [0.2, 0.5, 0.3, 0.3, 0.3, 0.3] });
  const b = c.run({ ...base, rho: [0.2, 0.8, 0.7, 0.7, 0.7, 0.7] });
  const ref = (r) => r.planes[1].Eref.reduce((x, y) => x + y, 0);
  assert.ok(ref(b) > 1.5 * ref(a));
  assert.ok(b.ms.planes < 50, `${b.ms.planes} ms`);
});
