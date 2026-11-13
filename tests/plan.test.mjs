// Stage 6: plans of the planes — the field on the auxiliary grid, isolines, label places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolines, isolineSet, labelPlaces } from '../js/isolines.js';
import { auxGrid, vertexTables, vertexReflected, bilinear, AUX } from '../js/workplane.js';
import { stage6Checks, isolineAudit, nodeMean } from '../js/checks6.js';
import { createCalc } from '../js/calc.js';
import { createRoom, autoStep } from '../js/geometry.js';
import { pointToElements } from '../js/formfactor.js';
import { LEVELS } from '../js/colorscale.js';
import { faceAverages } from '../js/direct.js';

/** Node values of f(x, y) on an nx × ny grid of cell size dx × dy. */
function sample(f, nx, ny, dx, dy) {
  const V = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) V[i + j * (nx + 1)] = f(i * dx, j * dy);
  return V;
}

test('isolines of a linear field are straight lines at the exact position', () => {
  const V = sample((x, y) => 100 * x + 50 * y, 20, 10, 0.1, 0.1);
  const lines = isolines(V, 20, 10, 0.1, 0.1, 75);
  assert.equal(lines.length, 1);
  const { pts, closed } = lines[0];
  assert.equal(closed, false);
  for (let k = 0; k < pts.length; k += 2) assert.ok(Math.abs(100 * pts[k] + 50 * pts[k + 1] - 75) < 1e-12);
  // one polyline from boundary to boundary, every cell it crosses contributes one segment
  const ends = [[pts[0], pts[1]], [pts[pts.length - 2], pts[pts.length - 1]]];
  for (const [x, y] of ends) assert.ok(x < 1e-12 || y < 1e-12 || x > 2 - 1e-12 || y > 1 - 1e-12);
});

test('a peak gives one closed loop per level; vertices on the level of the bilinear interpolant', () => {
  const f = (x, y) => 1000 * Math.exp(-((x - 1.03) ** 2 + (y - 0.97) ** 2) / 0.3);
  const nx = 40, ny = 40, d = 0.05;
  const V = sample(f, nx, ny, d, d);
  const sets = isolineSet(V, nx, ny, d, d, LEVELS.slice(1));
  assert.ok(sets.length >= 10);
  for (const { level, lines } of sets) {
    if (level < 50) continue; // lower levels reach the boundary of the square
    assert.equal(lines.length, 1, `level ${level}`);
    assert.equal(lines[0].closed, true);
  }
  const a = isolineAudit({ grid: { ax: nx, ay: ny, dx: d, dy: d }, E: V }, sets);
  assert.equal(a.onLevel, a.vertices);
  assert.equal(a.colorsDiffer, a.vertices);
  assert.ok(a.maxMid < 0.05, `midpoint deviation ${a.maxMid}`);
});

test('saddle cells follow the bilinear interpolant (asymptotic decider)', () => {
  // one cell, corners 00 and 11 high: the saddle value decides whether the high corners connect
  const cell = (v00, v10, v01, v11) => Float64Array.of(v00, v10, v01, v11);
  // saddle value (v00·v11 − v10·v01) / (v00 + v11 − v10 − v01) = (100·100 − 0) / 200 = 50
  const low = isolines(cell(100, 0, 0, 100), 1, 1, 1, 1, 60); // 60 > 50: high corners separate
  const high = isolines(cell(100, 0, 0, 100), 1, 1, 1, 1, 40); // 40 < 50: high corners connect
  const cuts = (lines, corner) => lines.some(({ pts }) => {
    const mx = (pts[0] + pts[2]) / 2, my = (pts[1] + pts[3]) / 2;
    return Math.hypot(mx - corner[0], my - corner[1]) < 0.5;
  });
  assert.equal(low.length, 2); assert.equal(high.length, 2);
  assert.ok(cuts(low, [0, 0]) && cuts(low, [1, 1]));   // segments around the high corners
  assert.ok(cuts(high, [1, 0]) && cuts(high, [0, 1])); // segments around the low corners
});

test('label places: evenly along the line, upright angle, none on short lines', () => {
  const pts = Float64Array.of(0, 0, 100, 0, 100, -100);
  const p = labelPlaces(pts, false, 50);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((q) => [q.x, q.y]), [[25, 0], [75, 0], [100, -25], [100, -75]]);
  assert.ok(Math.abs(Math.abs(p[2].angle) - Math.PI / 2) < 1e-12);
  assert.ok(p.every((q) => q.angle >= -Math.PI / 2 && q.angle <= Math.PI / 2));
  assert.deepEqual(labelPlaces(Float64Array.of(0, 0, 10, 0), false, 50, 30), []);
});

test('auxiliary grid: 0.1 m, at most 400 cells along a side', () => {
  assert.deepEqual([auxGrid(6, 4).ax, auxGrid(6, 4).ay], [60, 40]);
  const big = auxGrid(50, 30);
  assert.equal(big.ax, AUX.maxCells);
  assert.ok(Math.abs(big.dx - 0.125) < 1e-12 && big.ay === 240);
  assert.equal(auxGrid(1.05, 1).ax, 11); // rounded up
});

test('vertex tables give the exact point sums of the reflected light', () => {
  for (const [L, W, H, z] of [[6, 4, 3, 0.8], [3.3, 2.1, 2.7, 0], [5, 5, 4, 1.234]]) {
    const room = createRoom({ L, W, H, h: autoStep(L, W, H) });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const M = new Float64Array(room.N).map(() => 10 + 100 * rnd());
    const R = vertexReflected(room, vertexTables(room, z), M);
    const nL = room.n.L, nW = room.n.W, eps = 1e-9 * Math.max(L, W);
    const F = new Float64Array(room.N);
    for (const [a, b] of [[0, 0], [nL, nW], [0, 5], [7, 0], [nL, 3], [3, nW], [11, 9], [nL - 1, nW - 2]]) {
      const x = [Math.min(Math.max(a * room.d.L, eps), L - eps), Math.min(Math.max(b * room.d.W, eps), W - eps), z];
      pointToElements(room, x, [0, 0, 1], F);
      let s = 0;
      for (let j = 0; j < room.N; j++) s += F[j] * M[j];
      const r = R[a + b * (nL + 1)];
      assert.ok(Math.abs(r / s - 1) < 1e-7, `${L}×${W}×${H} z=${z} vertex (${a}, ${b}): ${r} vs ${s}`);
    }
  }
});

test('bilinear interpolation reproduces bilinear functions and clamps outside', () => {
  const f = (x, y) => 3 + 2 * x - y + 0.5 * x * y;
  const V = sample(f, 4, 3, 0.5, 0.4);
  for (const [x, y] of [[0, 0], [0.3, 0.7], [2, 1.2], [1.11, 0.05]]) assert.ok(Math.abs(bilinear(V, 4, 3, 0.5, 0.4, x, y) - f(x, y)) < 1e-12);
  assert.equal(bilinear(V, 4, 3, 0.5, 0.4, -1, -1), f(0, 0));
  assert.equal(bilinear(V, 4, 3, 0.5, 0.4, 9, 9), f(2, 1.2));
});

const base = { L: 6, W: 4, H: 3, nx: 3, ny: 2, flux: 4000, hc: 0, psi: 0, phot: 'directIndirect', fUp: 0.3, rho: [0.2, 0.7, 0.5, 0.5, 0.5, 0.5], hwp: 0.8, checks: false };

test('plans: stage 6 checks pass; plan of the 0.0 m plane agrees with the floor', () => {
  for (const p of [base, { ...base, L: 10, W: 10, nx: 4, ny: 4, hc: 0.5, psi: 0.3 }, { ...base, L: 3, W: 7, H: 4.5, nx: 1, ny: 3, phot: 'cosine', hwp: 0 }]) {
    const calc = createCalc();
    const r = calc.run(p);
    for (const pl of r.planes) {
      const plan = calc.plan(pl.z);
      for (const mf of [1, 0.75]) {
        const scaled = plan.E.map((v) => mf * v);
        const sets = isolineSet(scaled, plan.grid.ax, plan.grid.ay, plan.grid.dx, plan.grid.dy, LEVELS.slice(1));
        const checks = stage6Checks(plan, sets, mf, pl.stats);
        for (const c of checks) assert.ok(c.ok, `${p.L}×${p.W} z=${pl.z} MF=${mf}: ${c.name}: ${c.detail}`);
      }
      // GOST points: exact sums, direct + reflected
      const g = plan.gost;
      for (let k = 0; k < g.E.length; k++) assert.ok(Math.abs(g.E[k] - g.Edir[k] - g.Eref[k]) < 1e-9 * g.E[k]);
      if (pl.z === 0) {
        const room = createRoom({ L: p.L, W: p.W, H: p.H, h: autoStep(p.L, p.W, p.H) });
        const E = new Float64Array(r.N).map((_, k) => r.Edir[k] + r.Eind[k]);
        const floor = faceAverages(room, E)[0];
        assert.ok(Math.abs(nodeMean(plan) / floor - 1) < 0.005, `floor ${floor} vs plan ${nodeMean(plan)}`);
      }
    }
  }
});
