// Stage 3 tests: photometry models, luminaire layout, direct illuminance, false-color scale.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoom, autoStep } from '../js/geometry.js';
import { createPhotometry, photometricAngles, luminaireGrid } from '../js/photometry.js';
import {
  directAtPoint, elementDirectExact, elementDirectQuadrature, elementDirectCenters, elementDirect,
  faceFlux, faceAverages, gaussLegendre01,
} from '../js/direct.js';
import { LEVELS, COLORS, COLORS_HEX, levelIndex } from '../js/colorscale.js';

const roomOf = (L, W, H, h = autoStep(L, W, H)) => createRoom({ L, W, H, h });
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const COS = createPhotometry({ type: 'cosine', flux: 4000 });
const DI = createPhotometry({ type: 'directIndirect', flux: 4000, fUp: 0.3 });

/** Flux of a rotationally symmetric distribution: 2π ∫ I(γ) sin γ dγ, Gauss rule on [0, π/2] and [π/2, π]. */
function fluxOf(phot) {
  const { x, w } = gaussLegendre01(40);
  let s = 0;
  for (const [a, b] of [[0, Math.PI / 2], [Math.PI / 2, Math.PI]]) {
    for (let k = 0; k < x.length; k++) {
      const g = a + (b - a) * x[k];
      s += w[k] * (b - a) * phot.intensity(0, g) * Math.sin(g);
    }
  }
  return 2 * Math.PI * s;
}

// ---------------------------------------------------------------------------------------------
// Photometry

test('photometry: intensity of the cosine and direct-indirect models', () => {
  assert.equal(COS.intensity(0, 0), 4000 / Math.PI);
  assert.ok(Math.abs(COS.intensity(1, Math.PI / 3) - 2000 / Math.PI) < 1e-12);
  assert.equal(COS.intensity(0, 2), 0);           // upper hemisphere is dark
  assert.ok(Math.abs(DI.intensity(0, 0) - 2800 / Math.PI) < 1e-12);
  assert.ok(Math.abs(DI.intensity(0, Math.PI) - 1200 / Math.PI) < 1e-12);
  assert.ok(Math.abs(DI.intensity(0, Math.PI / 2)) < 1e-12);
  assert.throws(() => createPhotometry({ type: 'cosine', flux: 0 }));
  assert.throws(() => createPhotometry({ type: 'directIndirect', flux: 1, fUp: 1.5 }));
  assert.throws(() => createPhotometry({ type: 'ies', flux: 1 }));
});

test('photometry: the distribution integrates to the luminaire flux', () => {
  for (const p of [COS, DI, createPhotometry({ type: 'directIndirect', flux: 1500, fUp: 1 })]) {
    assert.ok(relErr(fluxOf(p), p.flux) < 1e-12, `${p.type}: ${fluxOf(p)} vs ${p.flux}`);
    assert.ok(relErr(p.lobes.reduce((s, l) => s + l.flux, 0), p.flux) < 1e-15);
  }
});

test('photometricAngles: γ from −Z, C counterclockwise from the C0 plane turned by ψ', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.ok(near(photometricAngles([0, 0, -1]).gamma, 0));
  assert.ok(near(photometricAngles([0, 0, 2]).gamma, Math.PI));
  assert.ok(near(photometricAngles([1, 0, 0]).gamma, Math.PI / 2));
  assert.ok(near(photometricAngles([1, 0, -1]).C, 0));
  assert.ok(near(photometricAngles([0, 1, -1]).C, Math.PI / 2));         // +Y is C90 for ψ = 0
  assert.ok(near(photometricAngles([0, -1, -1]).C, 3 * Math.PI / 2));    // C in [0, 2π)
  assert.ok(near(photometricAngles([0, 1, -1], Math.PI / 2).C, 0));      // C0 turned to +Y
  assert.ok(near(photometricAngles([1, 0, -1], Math.PI / 6).C, 2 * Math.PI - Math.PI / 6));
});

test('luminaireGrid: half-pitch margins, height H − h_c, order i fastest', () => {
  const g = luminaireGrid({ L: 6, W: 4, H: 3, nx: 3, ny: 2, hc: 0.5, psi: 0.2 });
  assert.equal(g.length, 6);
  assert.deepEqual(g.map((s) => s.pos), [
    [1, 1, 2.5], [3, 1, 2.5], [5, 1, 2.5],
    [1, 3, 2.5], [3, 3, 2.5], [5, 3, 2.5],
  ]);
  assert.ok(g.every((s) => s.psi === 0.2));
  assert.throws(() => luminaireGrid({ L: 6, W: 4, H: 3, nx: 0, ny: 1 }));
  assert.throws(() => luminaireGrid({ L: 6, W: 4, H: 3, nx: 1.5, ny: 1 }));
  assert.throws(() => luminaireGrid({ L: 6, W: 4, H: 3, nx: 1, ny: 1, hc: 3 }));
});

// ---------------------------------------------------------------------------------------------
// Direct illuminance at points

test('directAtPoint: directly below a luminaire E = I(0)/d² (stage 3 criterion)', () => {
  for (const [hc, phot] of [[0, COS], [0.7, COS], [1.2, DI]]) {
    const one = luminaireGrid({ L: 6, W: 4, H: 3, nx: 1, ny: 1, hc });
    const z = 3 - hc;
    const E = directAtPoint([3, 2, 0], [0, 0, 1], one, phot);
    assert.ok(relErr(E, phot.intensity(0, 0) / (z * z)) < 1e-14);
    const E08 = directAtPoint([3, 2, 0.8], [0, 0, 1], one, phot);
    assert.ok(relErr(E08, phot.intensity(0, 0) / ((z - 0.8) ** 2)) < 1e-14);
  }
  // ceiling above a pendant: I(180°)/h_c²
  const one = luminaireGrid({ L: 6, W: 4, H: 3, nx: 1, ny: 1, hc: 0.5 });
  assert.ok(relErr(directAtPoint([3, 2, 3], [0, 0, -1], one, DI), DI.intensity(0, Math.PI) / 0.25) < 1e-14);
});

test('directAtPoint: cosine³ law on a horizontal plane, zero behind the surface and above a downlight', () => {
  const s = [{ pos: [0, 0, 2], psi: 0 }];
  const x = [1.5, -0.7, 0];
  const d = Math.hypot(1.5, 0.7, 2), cg = 2 / d;
  const want = (4000 / Math.PI) * cg * cg / (d * d);       // I(γ)·cos ξ/d², ξ = γ on the floor
  assert.ok(relErr(directAtPoint(x, [0, 0, 1], s, COS), want) < 1e-14);
  assert.equal(directAtPoint(x, [0, 0, -1], s, COS), 0);   // receiver facing away
  assert.equal(directAtPoint([1, 0, 3], [0, 0, -1], s, COS), 0); // ceiling above a downlight
  assert.equal(directAtPoint([1, 0, 2], [0, 0, -1], s, COS), 0);  // in the source's plane
  // superposition over luminaires
  const two = [{ pos: [0, 0, 2], psi: 0 }, { pos: [3, 1, 2.5], psi: 1 }];
  const sum = directAtPoint(x, [0, 0, 1], [two[0]], COS) + directAtPoint(x, [0, 0, 1], [two[1]], COS);
  assert.ok(relErr(directAtPoint(x, [0, 0, 1], two, COS), sum) < 1e-15);
});

test('directAtPoint: rotation ψ does not change rotationally symmetric models', () => {
  const x = [1.2, 3.3, 0.8];
  const a = luminaireGrid({ L: 6, W: 4, H: 3, nx: 3, ny: 2, hc: 0.4, psi: 0 });
  const b = luminaireGrid({ L: 6, W: 4, H: 3, nx: 3, ny: 2, hc: 0.4, psi: 1.1 });
  assert.ok(relErr(directAtPoint(x, [0, 0, 1], a, DI), directAtPoint(x, [0, 0, 1], b, DI)) < 1e-14);
});

// ---------------------------------------------------------------------------------------------
// Element averages and flux balance

const CONFIGS = [
  ['6×4×3, 3×2, cosine', [6, 4, 3], { nx: 3, ny: 2, hc: 0 }, COS],
  ['6×4×3, 3×2, pendant 0.5 m, f_up 0.3', [6, 4, 3], { nx: 3, ny: 2, hc: 0.5 }, DI],
  ['10×10×3, 4×4, cosine', [10, 10, 3], { nx: 4, ny: 4, hc: 0 }, COS],
  ['3×2×2.5, 1×1, pendant 1.6 m, f_up 1', [3, 2, 2.5], { nx: 1, ny: 1, hc: 1.6 }, createPhotometry({ type: 'directIndirect', flux: 2000, fUp: 1 })],
  ['50×50×20, 5×5, pendant 2 m, f_up 0.5', [50, 50, 20], { nx: 5, ny: 5, hc: 2 }, createPhotometry({ type: 'directIndirect', flux: 30000, fUp: 0.5 })],
];

test('elementDirectExact: flux reaching all faces equals the luminaires\' flux to rounding (any mesh)', () => {
  for (const [name, [L, W, H], lp, phot] of CONFIGS) {
    const lums = luminaireGrid({ L, W, H, ...lp });
    for (const room of [roomOf(L, W, H), roomOf(L, W, H, Math.max(L, W, H) / 3)]) {
      const E = elementDirectExact(room, lums, phot);
      const err = Math.abs(faceFlux(room, E).total / (lums.length * phot.flux) - 1);
      assert.ok(err < 1e-12, `${name}, N=${room.N}: ${err}`);
      assert.ok(E.every((x) => x >= 0 && Number.isFinite(x)));
    }
  }
});

test('element centres: flux balance within 1e-3 on a fine mesh (stage 3 criterion)', () => {
  for (const [name, [L, W, H], lp, phot] of CONFIGS.slice(0, 3)) {
    const lums = luminaireGrid({ L, W, H, ...lp });
    const room = roomOf(L, W, H, autoStep(L, W, H) / 2);
    const err = Math.abs(faceFlux(room, elementDirectCenters(room, lums, phot)).total / (lums.length * phot.flux) - 1);
    assert.ok(err < 1e-3, `${name}, N=${room.N}: ${err}`);
  }
});

test('element centres converge to the exact average as O(h²)', () => {
  const [L, W, H] = [6, 4, 3];
  const lums = luminaireGrid({ L, W, H, nx: 3, ny: 2 });
  const err = [0.4, 0.2, 0.1].map((h) => {
    const room = roomOf(L, W, H, h);
    const flux = faceFlux(room, elementDirectCenters(room, lums, COS)).total;
    return Math.abs(flux / (6 * 4000) - 1);
  });
  assert.ok(err[0] / err[1] > 3 && err[1] / err[2] > 3, `errors ${err}`);
});

test('elementDirectExact agrees with Gauss quadrature of the point formula where the integrand is smooth', () => {
  const [L, W, H] = [6, 4, 3];
  const room = roomOf(L, W, H);
  const lums = luminaireGrid({ L, W, H, nx: 3, ny: 2, hc: 0.5 });
  const Ex = elementDirectExact(room, lums, DI);
  const Eq = elementDirectQuadrature(room, lums, DI, 8);
  // floor and ceiling: smooth integrands (the pendant is 0.5 m below the ceiling, elements are ~0.15 m)
  let worst = 0;
  for (const f of [0, 1]) {
    const fc = room.faces[f];
    for (let k = 0; k < fc.count; k++) worst = Math.max(worst, relErr(Eq[fc.offset + k], Ex[fc.offset + k]));
  }
  assert.ok(worst < 1e-9, `floor/ceiling: ${worst}`);
  // walls: the row cut by the source plane z = H − h_c has a kink, elsewhere smooth
  const zs = H - 0.5;
  worst = 0;
  for (const f of [2, 3, 4, 5]) {
    const fc = room.faces[f];
    for (let j = 0; j < fc.nv; j++) {
      if (Math.abs((j + 0.5) * fc.dv - zs) < 2 * fc.dv) continue;
      for (let i = 0; i < fc.nu; i++) {
        const k = fc.offset + i + j * fc.nu;
        worst = Math.max(worst, relErr(Eq[k], Ex[k]));
      }
    }
  }
  assert.ok(worst < 1e-8, `walls: ${worst}`);
});

test('elementDirect: symmetric layout gives symmetric face values; ceiling is dark for downlights', () => {
  const [L, W, H] = [6, 4, 3];
  const room = roomOf(L, W, H);
  const E = elementDirect(room, luminaireGrid({ L, W, H, nx: 3, ny: 2 }), COS);
  const fl = room.faces[0];
  let asym = 0;
  for (let j = 0; j < fl.nv; j++) for (let i = 0; i < fl.nu; i++) {
    const a = E[fl.offset + i + j * fl.nu], b = E[fl.offset + (fl.nu - 1 - i) + (fl.nv - 1 - j) * fl.nu];
    asym = Math.max(asym, relErr(a, b));
  }
  assert.ok(asym < 1e-12, `floor point symmetry ${asym}`);
  const avg = faceAverages(room, E);
  assert.equal(avg[1], 0);                         // ceiling: luminaires in its plane, γ = 90° there
  assert.ok(relErr(avg[2], avg[3]) < 1e-12 && relErr(avg[4], avg[5]) < 1e-12);
});

test('elementDirect: the floor receives Φ·F(source → floor) from a single downlight', () => {
  // Cosine downlight at height c above the centre of an a × b floor: the floor's share is the
  // factor from a differential area to a coaxial parallel rectangle (Howell B-3 by quadrants).
  const [L, W, H] = [5, 3, 2.7];
  const room = roomOf(L, W, H);
  const E = elementDirect(room, luminaireGrid({ L, W, H, nx: 1, ny: 1 }), COS);
  const quad = (a, b, c) => { const X = a / c, Y = b / c; const A = Math.sqrt(1 + X * X), B = Math.sqrt(1 + Y * Y);
    return (X / A * Math.atan(Y / A) + Y / B * Math.atan(X / B)) / (2 * Math.PI); };
  const Ffloor = 4 * quad(L / 2, W / 2, H);
  assert.ok(relErr(faceFlux(room, E).perFace[0], 4000 * Ffloor) < 1e-12);
});

// ---------------------------------------------------------------------------------------------
// MATLAB reference values (spec: "Эталоны в MATLAB")

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const readRows = (file) => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('%')).map((l) => l.trim().split(/\s+/).map(Number));
const photOf = (flux, fUp) => (fUp === 0 ? createPhotometry({ type: 'cosine', flux }) : createPhotometry({ type: 'directIndirect', flux, fUp }));

const POINT_FILE = fixture('stage3_point_reference.txt');
test('MATLAB: direct illuminance at points', { skip: !existsSync(POINT_FILE) && 'tests/fixtures/stage3_point_reference.txt not found' }, (t) => {
  // id x(3) n(3) s(3) flux fUp psi E
  const rows = readRows(POINT_FILE);
  assert.ok(rows.length >= 100, `${rows.length} rows`);
  let worst = 0;
  for (const r of rows) {
    assert.equal(r.length, 14, `row ${r[0]}`);
    const E = directAtPoint(r.slice(1, 4), r.slice(4, 7), [{ pos: r.slice(7, 10), psi: r[12] }], photOf(r[10], r[11]));
    const err = Math.abs(E - r[13]) / Math.max(Math.abs(r[13]), 1);
    worst = Math.max(worst, err);
    assert.ok(err <= 1e-12, `case ${r[0]}: JS ${E}, MATLAB ${r[13]}`);
  }
  t.diagnostic(`MATLAB stage 3 points: ${rows.length} cases, max relative |ΔE| = ${worst.toExponential(2)}`);
});

const ELEM_FILE = fixture('stage3_element_reference.txt');
test('MATLAB: element-average direct illuminance (integral2 of the point formula)', { skip: !existsSync(ELEM_FILE) && 'tests/fixtures/stage3_element_reference.txt not found' }, async (t) => {
  const { pointToRect } = await import('../js/formfactor.js');
  // id s(3) flux fUp p0(3) a(3) b(3) nA(3) E
  const rows = readRows(ELEM_FILE);
  assert.ok(rows.length >= 100, `${rows.length} rows`);
  let worst = 0;
  for (const r of rows) {
    assert.equal(r.length, 19, `row ${r[0]}`);
    const s = r.slice(1, 4), phot = photOf(r[4], r[5]);
    const p0 = r.slice(6, 9), a = r.slice(9, 12), b = r.slice(12, 15), nA = r.slice(15, 18);
    const area = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    let flux = 0;
    for (const l of phot.lobes) flux += l.flux * pointToRect(s, l.axis, p0, a, b, nA);
    const E = flux / area;
    const err = Math.abs(E - r[18]) / Math.max(Math.abs(r[18]), 1e-3);
    worst = Math.max(worst, err);
    assert.ok(err <= 1e-9, `case ${r[0]}: JS ${E}, MATLAB ${r[18]}, rel ${err}`);
  }
  t.diagnostic(`MATLAB stage 3 elements: ${rows.length} cases, max relative |ΔE| = ${worst.toExponential(2)}`);
});

// ---------------------------------------------------------------------------------------------
// False-color scale

test('colorscale: 26 fixed levels, stepped index, end colors outside 1…2000 lx', () => {
  assert.equal(LEVELS.length, 26);
  assert.deepEqual(LEVELS.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 10]);
  assert.equal(LEVELS[25], 2000);
  assert.equal(COLORS.length, 26);
  assert.equal(COLORS_HEX.length, 26);
  assert.ok(COLORS_HEX.every((c) => /^#[0-9a-f]{6}$/.test(c)));
  assert.equal(new Set(COLORS_HEX).size, 26);
  assert.equal(levelIndex(0), 0);
  assert.equal(levelIndex(-5), 0);
  assert.equal(levelIndex(NaN), 0);
  assert.equal(levelIndex(0.99), 0);
  assert.equal(levelIndex(1), 0);
  assert.equal(levelIndex(1.999), 0);
  assert.equal(levelIndex(2), 1);
  assert.equal(levelIndex(9.99), 6);   // between 7 and 10 → color of 7
  assert.equal(levelIndex(10), 7);
  assert.equal(levelIndex(499.9), 18);
  assert.equal(levelIndex(500), 19);
  assert.equal(levelIndex(1999), 24);
  assert.equal(levelIndex(2000), 25);
  assert.equal(levelIndex(1e6), 25);
  for (let k = 0; k < 26; k++) assert.equal(levelIndex(LEVELS[k]), k);
});
