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

test('the plane at the floor IS the floor: cell averages equal the floor elements', () => {
  for (const extra of [{}, { hc: 0.6, rho: [0.3, 0.8, 0.6, 0.6, 0.4, 0.4], nx: 2, ny: 1 }]) {
    const r = createCalc().run({ ...base, hwp: 0, ...extra });
    const p0 = r.planes.find((p) => p.z === 0);
    let w = 0;
    for (let k = 0; k < p0.E.length; k++) {
      const e = r.Edir[k] + r.Eind[k];
      w = Math.max(w, Math.abs(p0.E[k] / e - 1));
    }
    assert.ok(w < 1e-5, `${w}`); // the solver's tolerance: E_ind is the converged sum, not recomputed
    const room = createRoom({ L: 6, W: 4, H: 3, h: autoStep(6, 4, 3) });
    const fl = room.faces[0];
    const Ef = Array.from({ length: fl.count }, (_, k) => r.Edir[k] + r.Eind[k]);
    assert.ok(Math.abs(p0.stats.avg / faceAverages(room, r.Edir.map((v, g) => v + r.Eind[g]))[0] - 1) < 1e-5);
    // cell extremes are the floor's; E_min / E_max of the results are point extremes (stage 6)
    assert.ok(Math.abs(p0.stats.cellMin / Math.min(...Ef) - 1) < 1e-5);
    assert.ok(Math.abs(p0.stats.cellMax / Math.max(...Ef) - 1) < 1e-5);
    assert.ok(p0.stats.min <= p0.stats.cellMin && p0.stats.max >= p0.stats.cellMax);
    assert.ok(Math.abs(p0.stats.u0 - p0.stats.min / p0.stats.avg) < 1e-15);
    assert.ok(Math.abs(p0.stats.minMax - p0.stats.min / p0.stats.max) < 1e-15);
  }
});

test('black room: no reflected light at the planes; direct cell averages conserve the flux on the floor', () => {
  const r = createCalc().run({ ...base, rho: [0, 0, 0, 0, 0, 0] });
  for (const p of r.planes) {
    assert.ok(Math.max(...p.Eref) < 1e-12);
    assert.deepEqual([...p.E], [...p.Edir]);
  }
});

test('reflected light at a plane: exact tables agree with the point factors at cell centres', async () => {
  const { pointToElements } = await import('../js/formfactor.js');
  const r = createCalc().run(base);
  const room = createRoom({ L: 6, W: 4, H: 3, h: autoStep(6, 4, 3) });
  const p8 = r.planes.find((p) => p.z === 0.8);
  const M = new Float64Array(room.N);
  for (const f of room.faces) for (let k = f.offset; k < f.offset + f.count; k++) M[k] = base.rho[f.id] * (r.Edir[k] + r.Eind[k]);
  const F = new Float64Array(room.N);
  for (const [i, j] of [[0, 0], [5, 3], [18, 12], [36, 24]]) {
    const k = i + j * room.n.L;
    pointToElements(room, [(i + 0.5) * room.d.L, (j + 0.5) * room.d.W, 0.8], [0, 0, 1], F);
    let s = 0;
    for (let g = 0; g < room.N; g++) s += F[g] * M[g];
    assert.ok(Math.abs(p8.Eref[k] / s - 1) < 2e-3, `${i},${j}: ${p8.Eref[k]} vs ${s}`); // cell mean vs centre value
  }
});

test('reflected light at a plane grows with the reflectances; the tables are cached', () => {
  const c = createCalc();
  const a = c.run({ ...base, rho: [0.2, 0.5, 0.3, 0.3, 0.3, 0.3] });
  const b = c.run({ ...base, rho: [0.2, 0.8, 0.7, 0.7, 0.7, 0.7] });
  const ref = (r) => r.planes[1].Eref.reduce((x, y) => x + y, 0);
  assert.ok(ref(b) > 1.5 * ref(a));
  assert.ok(b.ms.planes < 100, `${b.ms.planes} ms`);
});

test('estimate: utilisation factor method of the estimate page; grid with at least N', async () => {
  const { meanCurve, estimate, gridFor, Z } = await import('../js/estimate.js');
  const { createPhotometry } = await import('../js/photometry.js');
  assert.equal(Z, 1.15);
  const cos = meanCurve(createPhotometry({ type: 'cosine', flux: 1000 }));
  const R = { L: 6, W: 4, H: 3, hu: 3, hr: 0.8, rp: 0.7, rc: 0.5, rr: 0.2, E: 300, Ke: 0.75 };
  const e = estimate(cos, R, 4000);
  assert.ok(e.u > 0.4 && e.u < 1, `${e.u}`);
  assert.ok(Math.abs(e.raw - 300 * 24 * 1.15 / (e.u * 0.75 * 4000)) < 1e-12);
  assert.equal(e.N, Math.ceil(e.raw));
  assert.ok(estimate(cos, { ...R, E: 500 }, 4000).raw > e.raw);
  assert.ok(estimate(cos, { ...R, rp: 0.8, rc: 0.7 }, 4000).u > e.u);
  assert.throws(() => estimate(cos, { ...R, hu: 0.8 }, 4000));
  assert.deepEqual(gridFor(6, 6, 4), { nx: 3, ny: 2, n: 6 });
  assert.deepEqual(gridFor(7, 4.2, 4), { nx: 3, ny: 3, n: 9 }); // 4 × 2 would have spacings 1.05 vs 2 m
  assert.deepEqual(gridFor(1, 5, 3), { nx: 1, ny: 1, n: 1 });
  assert.deepEqual(gridFor(13, 10, 3), { nx: 7, ny: 2, n: 14 });
  for (let N = 1; N <= 200; N++) assert.ok(gridFor(N, 7, 5).n >= N);
});
