// Stage 4 tests: form-factor kernel, Gauss–Seidel solver, energy balance, Sumpner's estimate.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoom, autoStep, fromGlobalIndex } from '../js/geometry.js';
import { elementToElement } from '../js/formfactor.js';
import { buildKernel, kernelF, gatherElement, rowSums } from '../js/kernel.js';
import { solve, energyBalance, sumpner, coarseData, solveDense, elementRho, SOLVER_EPS } from '../js/solver.js';
import { createPhotometry, luminaireGrid } from '../js/photometry.js';
import { elementDirect } from '../js/direct.js';

const roomOf = (L, W, H, h = autoStep(L, W, H)) => createRoom({ L, W, H, h });
const RHO = [0.2, 0.7, 0.5, 0.5, 0.5, 0.5]; // floor, ceiling, walls: the defaults
const COS = createPhotometry({ type: 'cosine', flux: 4000 });
const DI = createPhotometry({ type: 'directIndirect', flux: 4000, fUp: 0.3 });

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(L, W, H, { nx = 3, ny = 2, phot = COS, hc = 0, h } = {}) {
  const room = roomOf(L, W, H, h);
  const kernel = buildKernel(room);
  const lums = luminaireGrid({ L, W, H, nx, ny, hc });
  const Edir = elementDirect(room, lums, phot);
  return { room, kernel, lums, Edir, emitted: lums.length * phot.flux };
}

// ---------------------------------------------------------------------------------------------
// Kernel

test('kernel equals the direct element → element factor for every pair of a small room', () => {
  const room = roomOf(3, 2, 2.5, 0.5);
  const k = buildKernel(room);
  let worst = 0;
  for (let a = 0; a < room.N; a++) {
    const x = fromGlobalIndex(room, a);
    for (let b = 0; b < room.N; b++) {
      const y = fromGlobalIndex(room, b);
      const ref = elementToElement(room, x.f, x.i, x.j, y.f, y.i, y.j);
      const v = kernelF(k, a, b);
      if (ref === 0) { assert.equal(v, 0, `pair ${a}, ${b}`); continue; }
      worst = Math.max(worst, Math.abs(v - ref) / ref);
    }
  }
  assert.ok(worst < 1e-10, `max relative difference ${worst}`);
});

test('criterion: kernel equals the direct factor for random pairs (rooms up to 50 × 50 × 20 m)', () => {
  const rand = rng(4);
  for (const [L, W, H] of [[6, 4, 3], [10, 10, 3], [50, 50, 20], [1, 50, 20], [2.3, 1.1, 2]]) {
    const room = roomOf(L, W, H);
    const k = buildKernel(room);
    let worst = 0;
    for (let t = 0; t < 400; t++) {
      const a = Math.floor(rand() * room.N), b = Math.floor(rand() * room.N);
      const x = fromGlobalIndex(room, a), y = fromGlobalIndex(room, b);
      const ref = elementToElement(room, x.f, x.i, x.j, y.f, y.i, y.j);
      const v = kernelF(k, a, b);
      if (ref === 0) { assert.equal(v, 0); continue; }
      worst = Math.max(worst, Math.abs(v - ref) / ref);
    }
    assert.ok(worst < 1e-9, `${L}×${W}×${H}: max relative difference ${worst}`);
  }
});

test('kernel: Σ_j F_ij = 1 and reciprocity A_i F_ij = A_j F_ji', () => {
  for (const [L, W, H] of [[6, 4, 3], [50, 50, 20], [1, 1, 2], [50, 1, 20]]) {
    const room = roomOf(L, W, H);
    const k = buildKernel(room);
    const rs = rowSums(k);
    let worst = 0;
    for (const s of rs) worst = Math.max(worst, Math.abs(s - 1));
    assert.ok(worst < 1e-12, `${L}×${W}×${H}: max |ΣF − 1| = ${worst}`);
    const rand = rng(7);
    for (let t = 0; t < 300; t++) {
      const a = Math.floor(rand() * room.N), b = Math.floor(rand() * room.N);
      const Aa = room.faces[fromGlobalIndex(room, a).f].elementArea, Ab = room.faces[fromGlobalIndex(room, b).f].elementArea;
      const x = Aa * kernelF(k, a, b), y = Ab * kernelF(k, b, a);
      assert.ok(Math.abs(x - y) <= 1e-12 * Math.max(x, y, 1e-300), `${a}, ${b}: ${x} vs ${y}`);
    }
  }
});

test('kernel: gatherElement equals Σ_j F_ij M_j from kernelF', () => {
  const room = roomOf(4, 3, 2.8, 0.4);
  const k = buildKernel(room);
  const rand = rng(11);
  const M = Float64Array.from({ length: room.N }, () => rand() * 100);
  for (let a = 0; a < room.N; a += 7) {
    const { f } = fromGlobalIndex(room, a);
    let ref = 0;
    for (let b = 0; b < room.N; b++) ref += kernelF(k, a, b) * M[b];
    const v = gatherElement(k, f, a - room.offset[f], M);
    assert.ok(Math.abs(v - ref) < 1e-12 * ref, `element ${a}: ${v} vs ${ref}`);
  }
});

test('coarse data: element → face factors sum to 1, face → face factors are reciprocal', () => {
  const room = roomOf(6, 4, 3);
  const { toFace, FF } = coarseData(buildKernel(room));
  for (let g = 0; g < room.N; g++) {
    let s = 0;
    for (let F = 0; F < 6; F++) s += toFace[6 * g + F];
    assert.ok(Math.abs(s - 1) < 1e-12, `element ${g}: ${s}`);
  }
  for (let F = 0; F < 6; F++) for (let G = 0; G < 6; G++) {
    const a = room.faces[F].area * FF[F][G], b = room.faces[G].area * FF[G][F];
    assert.ok(Math.abs(a - b) < 1e-12 * Math.max(a, 1), `${F}, ${G}`);
  }
  assert.deepEqual(solveDense([[2, 1], [1, 3]], [3, 5]).map((x) => +x.toFixed(12)), [0.8, 1.4]);
});

// ---------------------------------------------------------------------------------------------
// Solver

test('solver: the solution satisfies E_ind = F·ρ·(E_dir + E_ind) (tight ε)', () => {
  const { room, kernel, Edir } = setup(6, 4, 3, { h: 0.2 });
  const s = solve(kernel, Edir, RHO, { eps: 1e-13 });
  assert.ok(s.converged);
  const r = elementRho(room, RHO);
  const M = Float64Array.from(Edir, (e, g) => r[g] * (e + s.Eind[g]));
  let worst = 0;
  for (const face of room.faces) {
    for (let k = 0; k < face.count; k++) {
      const g = face.offset + k;
      worst = Math.max(worst, Math.abs(gatherElement(kernel, face.id, k, M) - s.Eind[g]) / s.Eind[g]);
    }
  }
  assert.ok(worst < 1e-12, `max relative residual ${worst}`);
});

test('solver: coarse correction and plain Gauss–Seidel reach the same solution', () => {
  const { kernel, Edir } = setup(5, 3, 2.7, { phot: DI, hc: 0.6, h: 0.25 });
  for (const rho of [RHO, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], [0, 0.85, 0.1, 0.6, 0.3, 0]]) {
    const a = solve(kernel, Edir, rho, { eps: 1e-13 });
    const b = solve(kernel, Edir, rho, { eps: 1e-13, coarse: false });
    let worst = 0;
    for (let g = 0; g < a.Eind.length; g++) if (b.Eind[g] > 0) worst = Math.max(worst, Math.abs(a.Eind[g] - b.Eind[g]) / b.Eind[g]);
    assert.ok(worst < 1e-11, `ρ = ${rho}: ${worst}`);
    assert.ok(a.iterations <= b.iterations, `${a.iterations} vs ${b.iterations}`);
  }
});

test('solver: ε = 1e-4 gives E_ind within 1e-4 of the converged solution, in a few iterations', () => {
  const { kernel, Edir } = setup(10, 10, 3);
  for (const rho of [RHO, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]]) {
    const s = solve(kernel, Edir, rho);
    const t = solve(kernel, Edir, rho, { eps: 1e-13 });
    assert.equal(SOLVER_EPS, 1e-4);
    assert.ok(s.converged && s.iterations <= 10, `${s.iterations} iterations`);
    let worst = 0;
    for (let g = 0; g < t.Eind.length; g++) worst = Math.max(worst, Math.abs(s.Eind[g] - t.Eind[g]) / t.Eind[g]);
    assert.ok(worst < 1e-4, `ρ = ${rho[0]}: max relative error ${worst}`);
  }
});

test('solver: a warm start from the previous solution converges at once', () => {
  const { kernel, Edir } = setup(6, 4, 3);
  const a = solve(kernel, Edir, RHO);
  const b = solve(kernel, Edir, RHO, { Eind: a.Eind });
  assert.ok(b.iterations <= 2, `${b.iterations}`);
});

test('solver: no reflection (ρ = 0) gives E_ind = 0; reflection on one face lights the others only', () => {
  const { room, kernel, Edir } = setup(6, 4, 3, { phot: DI, hc: 0.5 }); // pendant: the up lobe lights the ceiling
  assert.ok(solve(kernel, Edir, [0, 0, 0, 0, 0, 0]).Eind.every((x) => x === 0));
  const s = solve(kernel, Edir, [0, 0.8, 0, 0, 0, 0]);
  const ceil = room.faces[1];
  for (let g = ceil.offset; g < ceil.offset + ceil.count; g++) assert.equal(s.Eind[g], 0);
  for (const f of [0, 2, 3, 4, 5]) {
    const face = room.faces[f];
    for (let g = face.offset; g < face.offset + face.count; g++) assert.ok(s.Eind[g] > 0);
  }
});

test('criterion: energy balance — absorbed flux equals the luminaires\' flux within 0.5 %', () => {
  for (const [L, W, H, rho, phot, hc] of [
    [6, 4, 3, RHO, COS, 0],
    [10, 10, 3, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], DI, 0.5],
    [50, 50, 20, RHO, DI, 2],
    [1, 50, 20, [0.3, 0.8, 0.6, 0.6, 0.6, 0.6], COS, 0],
  ]) {
    const { room, kernel, Edir, emitted } = setup(L, W, H, { phot, hc });
    const s = solve(kernel, Edir, rho);
    const b = energyBalance(room, Edir, s.Eind, rho, emitted);
    assert.ok(Math.abs(b.rel) < 0.005, `${L}×${W}×${H}: ${b.rel}`);
    // with the coarse correction the balance holds to rounding at any ε
    assert.ok(Math.abs(b.rel) < 1e-10, `${L}×${W}×${H}: ${b.rel}`);
  }
});

test('uniform reflectance: mean reflected illuminance equals Φρ / (A(1 − ρ)) exactly', () => {
  const { room, kernel, Edir, emitted } = setup(6, 4, 3, { h: 0.2 });
  for (const r of [0.3, 0.7, 0.9]) {
    const rho = [r, r, r, r, r, r];
    const s = solve(kernel, Edir, rho, { eps: 1e-12 });
    const sp = sumpner(room, Edir, s.Eind, rho);
    const A = room.faces.reduce((a, f) => a + f.area, 0);
    const exact = emitted * r / (A * (1 - r));
    assert.ok(Math.abs(sp.mean / exact - 1) < 1e-10, `ρ = ${r}: ${sp.mean} vs ${exact}`);
    assert.ok(Math.abs(sp.rel) < 1e-10);
  }
});

test('criterion: mean reflected illuminance within 15 % of Sumpner\'s estimate', () => {
  for (const [L, W, H, rho] of [
    [6, 4, 3, RHO], [10, 10, 3, RHO], [20, 8, 4, [0.1, 0.8, 0.5, 0.5, 0.3, 0.3]], [4, 4, 6, [0.3, 0.9, 0.7, 0.7, 0.7, 0.7]],
  ]) {
    const { room, kernel, Edir } = setup(L, W, H, { phot: DI });
    const s = solve(kernel, Edir, rho);
    const sp = sumpner(room, Edir, s.Eind, rho);
    assert.ok(Math.abs(sp.rel) < 0.15, `${L}×${W}×${H}: ${sp.rel}`);
  }
});

// ---------------------------------------------------------------------------------------------
// MATLAB reference (matlab/stage4_reference.m): dense matrix assembled pair by pair, solved directly

const fixture = fileURLToPath(new URL('./fixtures/stage4_reference.txt', import.meta.url));

test('MATLAB reference: element E_dir and E_ind', { skip: !existsSync(fixture) && 'tests/fixtures/stage4_reference.txt is absent' }, () => {
  const rows = readFileSync(fixture, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('%')).map((l) => l.trim().split(/\s+/).map(Number));
  // case L W H h rho(6) nx ny flux fUp hc g Edir Eind  (19 columns)
  const cases = new Map();
  for (const r of rows) {
    assert.equal(r.length, 19);
    if (!cases.has(r[0])) cases.set(r[0], { p: r.slice(1, 17), rows: [] });
    cases.get(r[0]).rows.push(r);
  }
  let wd = 0, wi = 0, count = 0;
  for (const { p, rows: rs } of cases.values()) {
    const [L, W, H, h, r0, r1, r2, r3, r4, r5, nx, ny, flux, fUp, hc] = p;
    const room = createRoom({ L, W, H, h });
    const phot = fUp > 0 ? createPhotometry({ type: 'directIndirect', flux, fUp }) : createPhotometry({ type: 'cosine', flux });
    const lums = luminaireGrid({ L, W, H, nx, ny, hc });
    const Edir = elementDirect(room, lums, phot);
    const s = solve(buildKernel(room), Edir, [r0, r1, r2, r3, r4, r5], { eps: 1e-14 });
    for (const r of rs) {
      const g = r[16];
      wd = Math.max(wd, Math.abs(Edir[g] - r[17]) / r[17]);
      if (r[18] > 0) wi = Math.max(wi, Math.abs(s.Eind[g] - r[18]) / r[18]);
      count++;
    }
  }
  assert.ok(count > 100);
  assert.ok(wd < 1e-9, `E_dir: ${wd}`);
  assert.ok(wi < 1e-9, `E_ind: ${wi}`);
});
