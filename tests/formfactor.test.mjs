// Stage 2 tests: point-to-rectangle form factor. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoom, autoStep, elementCenter } from '../js/geometry.js';
import {
  pointToPolygon, pointToRect, pointToElement, pointToFace, pointToElements,
  cornerParallel, coaxialRectangles, perpendicularCommonEdge,
} from '../js/formfactor.js';

const UP = [0, 0, 1];
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const roomOf = (L, W, H) => createRoom({ L, W, H, h: autoStep(L, W, H) });
const faceSum = (room, x, n) => sum([0, 1, 2, 3, 4, 5].map((f) => pointToFace(room, f, x, n)));

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomUnit(r) {
  for (;;) {
    const v = [2 * r() - 1, 2 * r() - 1, 2 * r() - 1];
    const l = Math.hypot(...v);
    if (l > 0.1 && l <= 1) return v.map((c) => c / l);
  }
}

/** Gauss–Legendre nodes and weights on [−1, 1]. */
function gaussLegendre(n) {
  const x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      dp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / dp;
      if (Math.abs(z - z1) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}

/** Area-to-area factor A1 → A2 by Gauss quadrature of the point factor over A1 (p0, a, b, normal). */
function areaToRect(recv, emit, n = 40) {
  const { x, w } = gaussLegendre(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const su = (x[i] + 1) / 2, sv = (x[j] + 1) / 2;
      const p = [0, 1, 2].map((c) => recv.p0[c] + su * recv.a[c] + sv * recv.b[c]);
      s += w[i] * w[j] / 4 * pointToRect(p, recv.n, emit.p0, emit.a, emit.b, emit.n);
    }
  }
  return s;
}

// --- acceptance criteria -------------------------------------------------------------------

test('criterion: Σ F = 1 within 1e-6 for points at the centre, near a wall and in a corner', () => {
  for (const [L, W, H] of [[6, 4, 3], [10, 10, 3], [1, 50, 20], [50, 50, 20], [2.3, 1.1, 2]]) {
    const room = roomOf(L, W, H);
    const dL = room.d.L, dW = room.d.W;
    const floorPoints = {
      centre: [L / 2, W / 2, 0],
      wall: [dL / 2, W / 2, 0],          // centre of the first element at the wall x = 0
      corner: [dL / 2, dW / 2, 0],       // centre of the corner element
    };
    for (const [name, x] of Object.entries(floorPoints)) {
      const F = pointToElements(room, x, UP);
      const s = sum(F);
      assert.ok(near(s, 1, 1e-6), `${L}×${W}×${H}, ${name}: Σ F = ${s}`);
      assert.ok(near(s, 1, 1e-12), `${L}×${W}×${H}, ${name}: Σ F = ${s} (round-off level expected)`);
      assert.ok(near(faceSum(room, x, UP), 1, 1e-12));
    }
  }
});

test('Σ F = 1 from element centres of every face (all receivers of a closed room)', () => {
  const room = roomOf(6, 4, 3);
  const x = [0, 0, 0];
  for (const face of room.faces) {
    for (const [i, j] of [[0, 0], [face.nu - 1, 0], [Math.floor(face.nu / 2), Math.floor(face.nv / 2)], [face.nu - 1, face.nv - 1]]) {
      elementCenter(face, i, j, x);
      const s = faceSum(room, x, face.normal);
      assert.ok(near(s, 1, 1e-12), `face ${face.id} (${i}, ${j}): Σ F = ${s}`);
    }
  }
});

test('Σ F = 1 on work planes Г-0,0 and Г-0,8 (walls are clipped at the horizon)', () => {
  for (const [L, W, H] of [[6, 4, 3], [10, 10, 3], [3, 3, 2]]) {
    const room = roomOf(L, W, H);
    for (const z of [0, 0.8]) {
      for (const [x, y] of [[L / 2, W / 2], [0.01, W / 2], [0.01, 0.01], [L - 0.2, 0.3]]) {
        const F = pointToElements(room, [x, y, z], UP);
        assert.ok(near(sum(F), 1, 1e-12), `${L}×${W}×${H}, (${x}, ${y}, ${z}): Σ F = ${sum(F)}`);
      }
    }
  }
});

test('Σ F = 1 for random interior points with random normals', () => {
  const r = rng(20261103);
  const room = roomOf(6, 4, 3);
  for (let t = 0; t < 300; t++) {
    const x = [r() * 6, r() * 4, r() * 3];
    const n = randomUnit(r);
    const s = faceSum(room, x, n);
    assert.ok(near(s, 1, 1e-12), `x = ${x}, n = ${n}: Σ F = ${s}`);
  }
});

test('criterion: tabulated values for parallel coaxial squares', () => {
  // Classic table values (Howell C-11; Incropera, fig. 13.4): side/distance → F
  const table = [[0.5, 0.0686], [1, 0.1998], [2, 0.4153], [5, 0.6902]];
  for (const [s, F] of table) {
    assert.ok(near(coaxialRectangles(s, s, 1), F, 5e-5), `closed form, s/c = ${s}`);
    // Integral of the point factor over the receiving square reproduces the closed form
    const recv = { p0: [0, 0, 0], a: [s, 0, 0], b: [0, s, 0], n: UP };
    const emit = { p0: [0, 0, 1], a: [s, 0, 0], b: [0, s, 0], n: [0, 0, -1] };
    const Fq = areaToRect(recv, emit, 40);
    assert.ok(near(Fq, coaxialRectangles(s, s, 1), 1e-10), `quadrature, s/c = ${s}: ${Fq}`);
  }
  // Non-square, scale-invariant
  const Fq = areaToRect(
    { p0: [0, 0, 0], a: [2.4, 0, 0], b: [0, 0.9, 0], n: UP },
    { p0: [0, 0, 1.5], a: [2.4, 0, 0], b: [0, 0.9, 0], n: [0, 0, -1] }, 40);
  assert.ok(near(Fq, coaxialRectangles(2.4, 0.9, 1.5), 1e-10));
});

// --- closed forms and properties -----------------------------------------------------------

test('point on the normal through a corner of a parallel rectangle (Howell B-3)', () => {
  for (const [a, b, c] of [[1, 1, 1], [2, 3, 1], [0.1, 5, 2], [10, 10, 0.3], [0.05, 0.05, 3]]) {
    const F = pointToRect([0, 0, 0], UP, [0, 0, c], [a, 0, 0], [0, b, 0], [0, 0, -1]);
    assert.ok(near(F, cornerParallel(a, b, c), 1e-14), `${a}×${b} at ${c}: ${F} vs ${cornerParallel(a, b, c)}`);
  }
});

test('perpendicular rectangles with a common edge (Howell C-14) by quadrature', () => {
  // The point factor has a weak singularity at the common edge, so Gauss quadrature converges
  // only as n⁻⁴ (error ≈ 1e-7 at n = 40, 5e-9 at n = 80); the tolerance reflects the quadrature.
  for (const [w, h, l] of [[1, 1, 1], [2, 0.5, 1], [0.6, 3, 2]]) {
    const recv = { p0: [0, 0, 0], a: [l, 0, 0], b: [0, w, 0], n: UP };
    const emit = { p0: [0, 0, 0], a: [l, 0, 0], b: [0, 0, h], n: [0, 1, 0] };
    const Fq = areaToRect(recv, emit, 80);
    assert.ok(near(Fq, perpendicularCommonEdge(w, h, l), 2e-8), `${w}, ${h}, ${l}: ${Fq} vs ${perpendicularCommonEdge(w, h, l)}`);
  }
  assert.ok(near(perpendicularCommonEdge(1, 1, 1), 0.2000, 5e-5));
});

test('cube: floor centre sees the ceiling by the closed form and each wall equally', () => {
  const room = createRoom({ L: 2, W: 2, H: 2, h: 0.5 });
  const x = [1, 1, 0];
  const Fc = pointToFace(room, 1, x, UP);
  assert.ok(near(Fc, 4 * cornerParallel(1, 1, 2), 1e-15));
  const walls = [2, 3, 4, 5].map((f) => pointToFace(room, f, x, UP));
  for (const Fw of walls) assert.ok(near(Fw, (1 - Fc) / 4, 1e-15));
});

test('F = 0 for the own face and for elements behind the receiver', () => {
  const room = roomOf(6, 4, 3);
  const x = [1.3, 2.2, 0];
  assert.equal(pointToFace(room, 0, x, UP), 0);
  for (let i = 0; i < room.faces[0].nu; i += 5) assert.equal(pointToElement(room, 0, i, 3, x, UP), 0);
  // The floor is entirely below the work plane Г-0,8
  assert.equal(pointToFace(room, 0, [3, 2, 0.8], UP), 0);
  // Receiver facing away from the ceiling sees nothing of it
  assert.equal(pointToFace(room, 1, [3, 2, 1], [0, 0, -1]), 0);
});

test('emitter side: a rectangle seen from behind gives F = 0', () => {
  const p0 = [0, 0, 1], a = [1, 0, 0], b = [0, 1, 0];
  assert.ok(pointToRect([0.5, 0.5, 0], UP, p0, a, b, [0, 0, -1]) > 0);
  assert.equal(pointToRect([0.5, 0.5, 0], UP, p0, a, b, [0, 0, 1]), 0);
  // Without nA the factor does not depend on which side emits
  assert.ok(pointToRect([0.5, 0.5, 0], UP, p0, a, b) > 0);
});

test('horizon clipping: a wall seen from Г-0,8 equals its part above the plane', () => {
  const room = roomOf(6, 4, 3);
  const x = [2.1, 1.3, 0.8];
  // Wall y = 0 (face 2): u = +X, v = +Z, origin (0, 0, 0)
  const full = pointToFace(room, 2, x, UP);
  const upper = pointToRect(x, UP, [0, 0, 0.8], [6, 0, 0], [0, 0, 2.2], [0, 1, 0]);
  assert.ok(near(full, upper, 1e-15), `${full} vs ${upper}`);
  const lower = pointToRect(x, UP, [0, 0, 0], [6, 0, 0], [0, 0, 0.8], [0, 1, 0]);
  assert.equal(lower, 0);
});

test('additivity: elements of a face sum to the whole face', () => {
  const room = roomOf(6, 4, 3);
  const r = rng(7);
  for (let t = 0; t < 20; t++) {
    const x = [0.2 + 5.6 * r(), 0.2 + 3.6 * r(), 0.2 + 2.6 * r()];
    const n = randomUnit(r);
    const F = pointToElements(room, x, n);
    for (const face of room.faces) {
      const s = sum(Array.from(F.subarray(face.offset, face.offset + face.count)));
      assert.ok(near(s, pointToFace(room, face.id, x, n), 1e-13), `face ${face.id}`);
    }
  }
});

test('polygon: independent of winding, start vertex and of splitting into triangles', () => {
  const x = [0.3, -0.2, 0], n = [0.2, 0.1, 0.97].map((c, _, v) => c / Math.hypot(...v));
  const P = [[0, 0, 1], [1.5, 0, 1.2], [1.5, 1, 1.4], [0, 1, 1.2]];
  const flat = (vs) => vs.flat();
  const F = pointToPolygon(x, n, flat(P));
  assert.ok(F > 0);
  assert.ok(near(pointToPolygon(x, n, flat([...P].reverse())), F, 1e-15));
  assert.ok(near(pointToPolygon(x, n, flat([P[2], P[3], P[0], P[1]])), F, 1e-15));
  const t1 = pointToPolygon(x, n, flat([P[0], P[1], P[2]]));
  const t2 = pointToPolygon(x, n, flat([P[0], P[2], P[3]]));
  assert.ok(near(t1 + t2, F, 1e-15));
  assert.throws(() => pointToPolygon(x, n, [0, 0, 1, 1, 0, 1]), RangeError);
});

test('far field: F → A·cos θ·cos θ′ / (π d²)', () => {
  const s = 1e-3, d = 2;
  const x = [0, 0, 0], n = [Math.sin(0.4), 0, Math.cos(0.4)];
  const F = pointToRect(x, n, [-s / 2, -s / 2, d], [s, 0, 0], [0, s, 0], [0, 0, -1]);
  const approx = s * s * Math.cos(0.4) / (Math.PI * d * d);
  assert.ok(near(F / approx, 1, 1e-6), `${F} vs ${approx}`);
});

// --- MATLAB reference (spec: agreement within 1e-9) ----------------------------------------

const REF = fileURLToPath(new URL('./fixtures/stage2_reference.txt', import.meta.url));

test('criterion: agreement with the MATLAB reference within 1e-9', { skip: !existsSync(REF) && 'tests/fixtures/stage2_reference.txt is not there yet (run matlab/stage2_reference.m)' }, () => {
  const rows = readFileSync(REF, 'utf8').split(/\r?\n/)
    .filter((s) => s.trim() && !s.startsWith('%') && !s.startsWith('#'))
    .map((s) => s.trim().split(/\s+/).map(Number));
  assert.ok(rows.length >= 100, `${rows.length} rows`);
  let worst = 0;
  for (const [k, v] of rows.entries()) {
    assert.equal(v.length, 20, `row ${k + 1}: 20 columns expected`);
    const [, x0, x1, x2, n0, n1, n2, p0, p1, p2, a0, a1, a2, b0, b1, b2, m0, m1, m2, Fm] = v;
    const nA = m0 === 0 && m1 === 0 && m2 === 0 ? undefined : [m0, m1, m2];
    const F = pointToRect([x0, x1, x2], [n0, n1, n2], [p0, p1, p2], [a0, a1, a2], [b0, b1, b2], nA);
    worst = Math.max(worst, Math.abs(F - Fm));
    assert.ok(Math.abs(F - Fm) <= 1e-9, `case ${v[0]}: JS ${F} vs MATLAB ${Fm}`);
  }
  console.log(`MATLAB reference: ${rows.length} cases, max |ΔF| = ${worst.toExponential(2)}`);
});

test('page panel "Критерии этапа 2" passes for default and extreme rooms', async () => {
  const { stage2Checks } = await import('../js/checks2.js');
  for (const [L, W, H] of [[6, 4, 3], [1, 1, 2], [50, 50, 20], [1, 50, 20]]) {
    for (const c of stage2Checks(roomOf(L, W, H))) assert.ok(c.ok, `${L}×${W}×${H}: ${c.name} — ${c.detail}`);
  }
});
