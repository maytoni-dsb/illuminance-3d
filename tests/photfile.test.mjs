// Stage 5: IES / LDT parsers, symmetry expansion, interpolation and flux of tabulated photometry,
// and the direct component of such photometry in a room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parsePhotometryFile, parseIes, parseLdt, PhotometryFileError } from '../js/photfile.js';
import { createPhotometry, expandPlanes, tableFlux, luminaireGrid } from '../js/photometry.js';
import { createRoom, autoStep } from '../js/geometry.js';
import { elementDirect, elementDirectAdaptive, faceFlux, emittedFlux, directAtPoint } from '../js/direct.js';
import { stage5Checks } from '../js/checks5.js';
import { stage3Checks } from '../js/checks3.js';

const DEG = Math.PI / 180;
const FIX = new URL('./fixtures/photometry/', import.meta.url);
const read = (name) => readFileSync(new URL(name, FIX), 'latin1');
const load = (name) => parsePhotometryFile(read(name), name);
const photOf = (t) => createPhotometry({ type: 'file', table: t });

// ---- synthetic files ------------------------------------------------------------------------
// Analytic distributions with the symmetry of each case (C, γ in degrees), written into files
// with only the stored planes; the parsed photometry must reproduce them on the whole circle.
const shapeG = (g) => (g <= 90 ? 200 * Math.cos(g * DEG) ** 2 + 20 : 30 * Math.sin((g - 90) * DEG * 2) + 5 * (180 - g) / 90);
const FUNCS = {
  rot: () => 1,
  quad: (C) => 1 + 0.5 * Math.cos(2 * C * DEG),
  half0: (C) => 1 + 0.3 * Math.cos(C * DEG) + 0.2 * Math.cos(2 * C * DEG),
  half90: (C) => 1 + 0.4 * Math.sin(C * DEG),
  none: (C) => 1 + 0.4 * Math.sin(C * DEG) + 0.2 * Math.cos(C * DEG),
};
const I = (sym, C, g) => FUNCS[sym](C) * shapeG(g);
const G = Array.from({ length: 37 }, (_, k) => 5 * k);           // 0…180 by 5°
const STORED_IES = {
  rot: [0], quad: [0, 30, 60, 90], half0: [0, 45, 90, 135, 180], half90: [90, 135, 180, 225, 270],
  none: [0, 60, 120, 180, 240, 300],
};

function iesText(sym, { mult = 1, ballast = 1, units = 2, dims = [0.2, 0.6, 0.05] } = {}) {
  const H = STORED_IES[sym];
  const rows = H.map((c) => G.map((g) => (I(sym, c, g) / mult / ballast).toFixed(10)).join(' ')).join('\n');
  return `IESNA:LM-63-2002\n[MANUFAC] Test\n[LUMINAIRE] Synthetic ${sym}\n[LUMCAT] SYN-${sym}\n[LAMP] LED\nTILT=NONE\n` +
    `1 -1 ${mult} ${G.length} ${H.length} 1 ${units} ${dims.join(' ')}\n${ballast} 1 12\n${G.join(' ')}\n${H.join(', ')}\n${rows}\n`;
}

/** EULUMDAT with Mc planes over the circle (Dc = 360/Mc); the stored ones follow Isym. */
function ldtText(sym, { Mc = 12, flux = 1000, lorl = 100 } = {}) {
  const isym = { none: 0, rot: 1, half0: 2, half90: 3, quad: 4 }[sym];
  const Dc = 360 / Mc;
  const C = Array.from({ length: Mc }, (_, i) => i * Dc);
  let idx;
  if (isym === 0) idx = C.map((_, i) => i);
  else if (isym === 1) idx = [0];
  else if (isym === 2) idx = Array.from({ length: Mc / 2 + 1 }, (_, i) => i);
  else if (isym === 4) idx = Array.from({ length: Mc / 4 + 1 }, (_, i) => i);
  else idx = Array.from({ length: Mc / 2 + 1 }, (_, i) => (3 * Mc / 4 + i) % Mc);
  const scale = flux / 1000;
  const vals = idx.flatMap((i) => G.map((g) => (I(sym, C[i], g) / scale).toFixed(10)));
  const head = ['Test', '1', String(isym), String(Mc), String(Dc), String(G.length), '5', 'report', `Synthetic ${sym}`, `SYN-${sym}`, 'syn.ldt', 'date',
    '600', '200', '50', '560', '180', '0', '0', '0', '0', '50', String(lorl), '1', '0', '1', '-1', 'LED', String(flux), '3000', '80', '12',
    ...Array(10).fill('0.5')];
  return [...head, ...C.map(String), ...G.map(String), ...vals].join('\r\n') + '\r\n';
}

test('IES: every symmetry reproduces the analytic distribution on the whole circle', () => {
  for (const sym of Object.keys(FUNCS)) {
    const t = parseIes(iesText(sym), `syn-${sym}.ies`);
    assert.equal(t.sym, sym, sym);
    const p = photOf(t);
    // at every 5° of C and every tabulated γ: C nodes of the stored planes and their mirror images
    for (const c of STORED_IES[sym].flatMap((x) => [x, 360 - x, 180 - x, 180 + x]).map((x) => ((x % 360) + 360) % 360)) {
      for (const g of G) assert.ok(Math.abs(p.intensity(c * DEG, g * DEG) - I(sym, c, g)) < 1e-9, `${sym} C=${c} γ=${g}`);
    }
  }
});

test('LDT: every Isym (0…4, Isym 3 starting at C270) reproduces the analytic distribution', () => {
  for (const sym of Object.keys(FUNCS)) {
    const t = parseLdt(ldtText(sym), `syn-${sym}.ldt`);
    assert.equal(t.sym, sym, sym);
    const p = photOf(t);
    for (let c = 0; c < 360; c += 30) {
      for (const g of G) assert.ok(Math.abs(p.intensity(c * DEG, g * DEG) - I(sym, c, g)) < 1e-9, `${sym} C=${c} γ=${g}`);
    }
  }
});

test('IES and LDT of the same distribution agree between the nodes too (bilinear interpolant)', () => {
  // the LDT grid (30°) is a subset of nothing in IES (60° for "none"), so compare where both have planes
  for (const sym of ['rot', 'quad', 'half0']) {
    const a = photOf(parseIes(iesText(sym))), b = photOf(parseLdt(ldtText(sym, { Mc: 8 })));
    // planes 0, 45, 90, … exist in both for quad / half0 (IES half0 has 45° steps, quad 30° — skip off-grid C)
    for (const c of sym === 'quad' ? [0, 90, 180, 270] : [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (let g = 0; g <= 180; g += 1.7) {
        assert.ok(Math.abs(a.intensity(c * DEG, g * DEG) - b.intensity(c * DEG, g * DEG)) < 1e-9, `${sym} C=${c} γ=${g}`);
      }
    }
  }
});

test('IES multiplier, ballast factor and feet are applied; luminous opening sizes', () => {
  const t = parseIes(iesText('rot', { mult: 0.25, ballast: 0.8, units: 1, dims: [-0.5, -0.5, 0.1] }));
  const p = photOf(t);
  assert.ok(Math.abs(p.intensity(0, 0) - I('rot', 0, 0)) < 1e-9);
  assert.equal(t.luminous.round, true);
  assert.ok(Math.abs(t.luminous.length - 0.5 * 0.3048) < 1e-12);
  const r = parseIes(iesText('rot', { dims: [0.2, 0.6, 0.05] }));
  assert.equal(r.luminous.round, false);
  assert.deepEqual([r.luminous.width, r.luminous.length], [0.2, 0.6]); // LM-63: width, length
});

test('LDT: cd/klm scaled by the lamp flux; rated flux = Φ_lamps · LORL', () => {
  const t = parseLdt(ldtText('quad', { flux: 2500, lorl: 80 }));
  assert.equal(t.ratedFlux, 2000);
  const p = photOf(t);
  assert.ok(Math.abs(p.intensity(0, 0) - I('quad', 0, 0)) < 1e-9);
  assert.deepEqual([t.luminaire.length, t.luminaire.width, t.luminous.length, t.luminous.width], [0.6, 0.2, 0.56, 0.18]);
});

test('flux of the interpolant: closed form = fine quadrature; hemispheres add up', () => {
  for (const sym of Object.keys(FUNCS)) {
    const p = photOf(parseLdt(ldtText(sym)));
    const { planes, rows } = expandPlanes(parseLdt(ldtText(sym)));
    const f = tableFlux(planes, rows, p.table.gamma);
    assert.ok(Math.abs(f.down + f.up - p.flux) < 1e-9 * p.flux);
    // midpoint rule on a 0.05° grid (the interpolant is linear on every cell, so this converges as h²)
    let s = 0;
    const n = 720, m = 3600;
    for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
      const C = (a + 0.5) * 2 * Math.PI / n, g = (b + 0.5) * Math.PI / m;
      s += p.intensity(C, g) * Math.sin(g);
    }
    s *= (2 * Math.PI / n) * (Math.PI / m);
    assert.ok(Math.abs(s / p.flux - 1) < 1e-5, `${sym}: ${s} vs ${p.flux}`);
  }
});

test('errors are reported in Russian with a reason', () => {
  const bad = [
    ['', /пустой/],
    [iesText('rot').replace('TILT=NONE', 'TILT=NONE').replace(/\n1 -1 1 37 1 1/, '\n1 -1 1 37 1 3'), /типа A/],
    [iesText('quad').split('\n').slice(0, -2).join('\n'), /значений силы света/],
    [iesText('rot').replace('0 5 10', '0 0 10'), /возрастать/],
    [ldtText('rot').split('\r\n').slice(0, 20).join('\r\n'), /меньше 30 строк/],
  ];
  for (const [text, re] of bad) {
    assert.throws(() => parsePhotometryFile(text, 'x'), (e) => e instanceof PhotometryFileError && re.test(e.message), String(re));
  }
});

// ---- real files ---------------------------------------------------------------------------------

test('fixtures: LDT flux by the table within 1 % of the rated flux (the stage 5 criterion)', () => {
  const files = readdirSync(FIX).filter((f) => /\.ldt$/i.test(f) && !f.startsWith('DL058'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const t = load(f);
    const p = photOf(t);
    assert.ok(Math.abs(p.flux / t.ratedFlux - 1) < 0.01, `${f}: ${p.flux} vs ${t.ratedFlux}`);
  }
});

test('fixtures: ERCO IES and LDT pairs agree (C angles map one to one; IES width = LDT length)', () => {
  for (const n of ['32607-000', 'B0000021', 'B5000065', 'C1000001', 'C1000005']) {
    const ti = load(`ERCO-${n}.ies`), tl = load(`ERCO-${n}.ldt`);
    const a = photOf(ti), b = photOf(tl);
    assert.ok(Math.abs(a.flux / tl.ratedFlux - 1) < 0.01, n);
    let w = 0, m = 0, w90 = 0;
    for (let c = 0; c < 360; c += 5) for (let g = 0; g <= 90; g += 2) {
      const x = a.intensity(c * DEG, g * DEG);
      m = Math.max(m, x);
      w = Math.max(w, Math.abs(x - b.intensity(c * DEG, g * DEG)));
      w90 = Math.max(w90, Math.abs(x - b.intensity(((c + 90) % 360) * DEG, g * DEG)));
    }
    assert.ok(w / m < 0.025, `${n}: ${w / m}`);
    if (ti.sym !== 'rot') assert.ok(w90 / m > 0.2, `${n}: a 90° turn must be detectable`);
    assert.ok(Math.abs(ti.luminous.width - tl.luminous.length) < 1e-9 && Math.abs(ti.luminous.length - tl.luminous.width) < 1e-9, n);
  }
});

test('fixtures: library quirks — broken files rejected, one-plane files read as rotational', () => {
  assert.throws(() => load('C071WL-L12B3K.ies'), /хватает только на 2 плоскости/);
  assert.equal(load('C071WL-L12B3K.ldt').sym, 'quad');
  assert.throws(() => load('DL058-12W3K-TRS-W.ies'), /возрастать: 0, 0/);
  assert.throws(() => load('DL058-12W3K-TRS-W.ldt'), /возрастать: 0, 0/);
  const one = load('C065CL-02-L12W3K-B.ldt');
  assert.equal(one.sym, 'rot');
  assert.match(one.warnings.join(' '), /одна плоскость C/);
  const sets = load('DL094-GU10-W-60.ldt');  // 4 lamp sets: the first is used
  assert.equal(sets.lampFlux, 570);
  assert.match(sets.warnings.join(' '), /не применяется/); // conversion factor 0.8 is not applied
  assert.ok(Math.abs(photOf(sets).flux / sets.ratedFlux - 1) < 0.01);
  // the same luminaire, the same shape, but files disagree on the flux (180 vs 10 lm)
  const a = photOf(load('TR186-1-8W4K-B.ies')), b = photOf(load('TR186-1-8W4K-B.ldt'));
  assert.ok(Math.abs(a.flux / b.flux - 18) < 0.01);
});

// ---- direct component ---------------------------------------------------------------------------

test('direct component of file photometry: every luminaire puts its flux on the faces', () => {
  const cases = [
    ['DL124-10W-3K-TRS-W.ldt', 0],      // 8° spot
    ['O570WL-L10B3K.ldt', 0.5],         // 50 % up, 50 % down, narrow
    ['O570WL-L10B3K.ldt', 0],           // the same at the ceiling: the upward half is lost
    ['TR152-1-7W3K-PT.ldt', 0.8],       // all up
    ['ERCO-B0000021.ldt', 0.3],         // wallwasher, symmetric to C0–C180 only
  ];
  const R = { L: 6, W: 4, H: 3 };
  const room = createRoom({ ...R, h: autoStep(R.L, R.W, R.H) });
  for (const [f, hc] of cases) {
    const p = photOf(load(f));
    const lums = luminaireGrid({ ...R, nx: 3, ny: 2, hc, psi: 0.4 });
    const E = elementDirect(room, lums, p);
    const em = lums.length * emittedFlux(p, lums[0].pos[2], R.H);
    assert.ok(Math.abs(faceFlux(room, E).total / em - 1) < 1e-3, `${f} hc=${hc}`);
    for (const x of E.stats.perLum) assert.ok(Math.abs(x) < 1e-3, `${f} hc=${hc}: ${x}`);
    if (hc === 0) assert.ok(em < lums.length * p.flux * (1 - 1e-6) || p.fluxUp < 1e-9 * p.flux);
  }
});

test('direct component of file photometry: element averages against a 100× tighter cubature', () => {
  const R = { L: 5, W: 3, H: 2.8 };
  const room = createRoom({ ...R, h: autoStep(R.L, R.W, R.H) });
  for (const f of ['ERCO-C1000005.ies', 'DL124-10W-3K-TRS-W.ldt']) {
    const p = photOf(load(f));
    const lums = luminaireGrid({ ...R, nx: 2, ny: 1, hc: 0.2, psi: 0.7 });
    const E = elementDirect(room, lums, p);
    const ref = elementDirectAdaptive(room, lums, p, { eps: 1e-5, abs: 1e-9, maxRetries: 0 });
    const max = ref.reduce((a, b) => Math.max(a, b), 0);
    for (let g = 0; g < room.N; g++) if (ref[g] > 0.01 * max) assert.ok(Math.abs(E[g] / ref[g] - 1) < 5e-3, `${f} g=${g}`);
  }
});

test('rotation ψ turns an asymmetric distribution: the wallwasher lights the wall it faces', () => {
  const p = photOf(load('ERCO-B0000021.ldt'));
  // the beam goes towards C = 0 (I at γ = 30°: C0 509, C90 281, C180 2 cd/klm·Φ)
  assert.ok(p.intensity(0, 30 * DEG) > 100 * p.intensity(Math.PI, 30 * DEG));
  // walls 2 m away, points 3.46 m below the luminaire: γ = 30°
  const R = { L: 4, W: 4, H: 5 };
  const z = 5 - 2 / Math.tan(30 * DEG);
  const at = (psi) => {
    const one = luminaireGrid({ ...R, nx: 1, ny: 1, hc: 0, psi });
    const E = (x, n) => directAtPoint(x, n, one, p);
    return { px: E([4, 2, z], [-1, 0, 0]), mx: E([0, 2, z], [1, 0, 0]), py: E([2, 4, z], [0, -1, 0]), my: E([2, 0, z], [0, 1, 0]) };
  };
  const a = at(0), b = at(Math.PI / 2);
  const [xa, ya, xb, yb] = [a.px / a.mx, 1, 1, b.py / b.my];
  assert.ok(xa > 100 * ya && yb > 100 * xb, `${xa} ${yb}`); // ψ = 0: C0 → +X; ψ = 90° (counterclockwise): C0 → +Y
});

test('stage 5 panel checks pass on an asymmetric file', () => {
  const t = load('ERCO-C1000005.ldt');
  const p = photOf(t);
  const R = { L: 6, W: 4, H: 3 };
  const room = createRoom({ ...R, h: autoStep(R.L, R.W, R.H) });
  const lums = luminaireGrid({ ...R, nx: 3, ny: 2, hc: 0, psi: 0.3 });
  const E = elementDirect(room, lums, p);
  for (const c of [...stage5Checks(room, lums, p, E, t), ...stage3Checks(room, lums, p, E, { hc: 0, psi: 0.3 })]) {
    assert.ok(c.ok, `${c.name}: ${c.detail}`);
  }
});

test('polar diagram: normalised curves, γ = 0 down, C0 right; γ lines every 30°', async () => {
  const { lidcCurves } = await import('../js/photui.js');
  const p = photOf(load('ERCO-B0000021.ldt'));
  const { c0, max, rings, spokes } = lidcCurves(p, 70);
  assert.deepEqual(rings.map(Math.round), [23, 47, 70]);
  assert.equal((spokes.match(/M/g) || []).length, 12); // 0°, 180° once; 30…150° on both sides
  const pts = c0.slice(1, -1).split('L').map((t) => t.split(' ').map(Number));
  assert.equal(pts.length, 2 * 181);
  assert.ok(Math.abs(pts[0][0]) < 1e-9 && pts[0][1] > 0);  // γ = 0 straight down
  const r = (q) => Math.hypot(q[0], q[1]);
  assert.ok(r(pts[30]) > 50 * r(pts[2 * 181 - 1 - 30]) && pts[30][0] > 0); // wallwasher: towards C0
  assert.ok(Math.abs(r(pts[30]) / 70 * max - p.intensity(0, 30 * DEG) * 1000 / p.flux) < 0.01 * max);
  assert.ok(Math.max(...pts.map(r)) <= 70 + 1e-9);
});

test('luminaire sizes text and the form values of a lamp set', async () => {
  const { sizeText, setValues } = await import('../js/photui.js');
  assert.equal(sizeText(load('ERCO-C1000001.ldt')), '0,5 × 0,04 × 0,06 м');
  assert.equal(sizeText(load('ERCO-B0000021.ldt')), '⌀0,146 × 0,099 м');
  const t = load('Atom-C016CL-01W-45.ldt');
  assert.deepEqual(setValues(t, 0, 2), { flux: 510, cct: 3000, power: 5.84 });
  const i = load('ERCO-C1000005.ies');
  assert.deepEqual(setValues(i, photOf(i).tableFlux), { flux: 2829, cct: null, power: 20.7 });
});

// ---- MATLAB reference (matlab/stage5_reference.m) ------------------------------------------------
const REF_FILES = [
  'C009CW-L12B.ies', 'C009CW-L12B.ldt', 'C065CL-02-L12W3K-B.ldt', 'C071WL-L12B3K.ldt',
  'DL094-GU10-W-60.ldt', 'DL124-10W-3K-TRS-W.ldt',
  'ERCO-32607-000.ies', 'ERCO-32607-000.ldt', 'ERCO-B0000021.ies', 'ERCO-B0000021.ldt',
  'ERCO-B5000065.ies', 'ERCO-B5000065.ldt', 'ERCO-C1000001.ies', 'ERCO-C1000001.ldt',
  'ERCO-C1000005.ies', 'ERCO-C1000005.ldt', 'O570WL-L10B3K.ies', 'O570WL-L10B3K.ldt',
  'TR152-1-7W3K-PT.ldt', 'TR186-1-8W4K-B.ies', 'TR186-1-8W4K-B.ldt'];
const refUrl = new URL('./fixtures/stage5_reference.txt', import.meta.url);
let refText = null;
try { refText = readFileSync(refUrl, 'utf8'); } catch { /* not yet produced */ }

test('MATLAB reference: flux and intensities of the fixture files (1e-9)', { skip: !refText && 'tests/fixtures/stage5_reference.txt is absent' }, () => {
  const phots = REF_FILES.map((f) => photOf(load(f)));
  let nFlux = 0, nI = 0, worst = 0;
  for (const line of refText.trim().split(/\r?\n/)) {
    const [kind, k, C, g, v] = line.trim().split(/\s+/).map(Number);
    const p = phots[k - 1];
    if (kind === 1) {
      const e = Math.abs(p.flux / v - 1);
      worst = Math.max(worst, e); nFlux++;
      assert.ok(e < 1e-9, `${REF_FILES[k - 1]}: flux ${p.flux} vs ${v}`);
    } else {
      const I = p.intensity(C * DEG, g * DEG);
      const scale = Math.max(1, ...p.table.rows);
      assert.ok(Math.abs(I - v) < 1e-9 * scale, `${REF_FILES[k - 1]} C=${C} γ=${g}: ${I} vs ${v}`);
      nI++;
    }
  }
  assert.equal(nFlux, REF_FILES.length);
  assert.equal(nI, 200 * REF_FILES.length);
});

test('LDT lamp sets are read one after another (6 lines each); another set scales the table', () => {
  const t = load('Atom-C016CL-01W-45.ldt');
  assert.deepEqual(t.lampSets.map((s) => [s.type, s.flux, s.cct, s.power]),
    [['LED / 7061', 640, 4000, 6.51], ['LED / 7060', 520, 3000, 6.51], ['LED / 7108', 510, 3000, 5.84], ['LED / 7109', 620, 4000, 6.18]]);
  const p1 = photOf(t);
  assert.ok(Math.abs(p1.flux / t.ratedFlux - 1) < 0.01);
  const p2 = createPhotometry({ type: 'file', table: t, flux: 520 });
  assert.ok(Math.abs(p2.flux - 520) < 1e-9);
  assert.ok(Math.abs(p2.intensity(0, 0.3) / p1.intensity(0, 0.3) - 520 / p1.flux) < 1e-12);
  const n = load('Nostalgia.ldt'); // three sets, 2.5° steps, conversion factor 0.5 (not applied)
  assert.deepEqual(n.lampSets.map((s) => s.flux), [880, 930, 880]);
  assert.ok(Math.abs(photOf(n).flux / n.ratedFlux - 1) < 0.01);
});
