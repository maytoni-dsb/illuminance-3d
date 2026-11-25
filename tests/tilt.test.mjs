// Stage 2.1a: luminaires tilted about their own x (C0) and y (C90) axes. R = Rz(ψ)·Ry(ty)·Rx(tx)
// (Euler XYZ as in 3ds Max, decided 25 Nov 2026). Criteria: the flux to rounding, the MATLAB
// reference within 1e-9 (stage21a_reference.txt), and a tilt of zero changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCalc } from '../js/calc.js';
import { rectOutline, createRoom } from '../js/geometry.js';
import { createPhotometry } from '../js/photometry.js';
import { parsePhotometryFile } from '../js/photfile.js';
import { directAtPoint, elementDirect, faceFlux, lumMatrix, tiltedAngles, downwardFlux, emittedFlux } from '../js/direct.js';

const fixture = (f) => parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${f}`, import.meta.url), 'latin1'), f);
const DEG = Math.PI / 180;
const RHO = [0.2, 0.7, 0.5, 0.5, 0.5, 0.5];
const L = 5, W = 4, H = 3;
const base = { outline: rectOutline(L, W), H, rho: RHO, hwp: 0.8 };

test('the matrix: Euler XYZ, orthonormal, ψ alone as in version 1', () => {
  for (const [tx, ty, psi] of [[0, 0, 0.3], [0.4, 0, 0], [0, -0.7, 0], [0.3, 0.5, 1.2], [-1.2, 1.4, -2]]) {
    const R = lumMatrix({ tx, ty, psi });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const d = R[i] * R[j] + R[3 + i] * R[3 + j] + R[6 + i] * R[6 + j];
      assert.ok(Math.abs(d - (i === j ? 1 : 0)) < 1e-15);
    }
    const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
    assert.ok(Math.abs(det - 1) < 1e-15);
  }
  // tilt about y by +β turns the downward axis (0, 0, −1) towards −x (right-hand rule)
  const R = lumMatrix({ ty: 30 * DEG });
  const ax = [-R[2], -R[5], -R[8]];
  assert.ok(Math.abs(ax[0] + Math.sin(30 * DEG)) < 1e-15 && Math.abs(ax[2] + Math.cos(30 * DEG)) < 1e-15);
  // tilt about x by +α turns it towards +y
  const Q = lumMatrix({ tx: 30 * DEG });
  assert.ok(Math.abs(-Q[5] - Math.sin(30 * DEG)) < 1e-15);
  // the tilts are about the luminaire's own axes: ψ = 90° then ty tilts the beam towards −y
  const P = lumMatrix({ ty: 30 * DEG, psi: 90 * DEG });
  assert.ok(Math.abs(-P[5] + Math.sin(30 * DEG)) < 1e-15 && Math.abs(P[2]) < 1e-15);
});

test('angles: the luminaire axis is γ = 0, the C0 direction is C = 0, γ = 90°', () => {
  const s = { tx: 0.3, ty: -0.5, psi: 0.8 };
  const R = lumMatrix(s);
  const a = tiltedAngles(R, -R[2], -R[5], -R[8]);
  assert.ok(Math.abs(a[1]) < 1e-7);
  const b = tiltedAngles(R, R[0], R[3], R[6]);
  assert.ok(Math.abs(b[0]) < 1e-12 && Math.abs(b[1] - Math.PI / 2) < 1e-12);
  const c = tiltedAngles(R, R[1], R[4], R[7]);
  assert.ok(Math.abs(c[0] - Math.PI / 2) < 1e-12 && Math.abs(c[1] - Math.PI / 2) < 1e-12);
});

test('a tilt of zero takes the version 1 path: identical results', () => {
  const table = fixture('ERCO-C1000001.ldt');
  const types = [{ id: 'f', phot: 'file', flux: 0, table, fileKey: 'erco' }, { id: 'c', phot: 'cosine', flux: 2000 }];
  const lums = [{ type: 'f', pos: [1.3, 1.1, 2.7], psi: 0.4 }, { type: 'c', pos: [3.4, 2.5, 2.9], psi: 0 }];
  const a = createCalc().run({ ...base, types, lums });
  const b = createCalc().run({ ...base, types, lums: lums.map((l) => ({ ...l, tx: 0, ty: 0 })) });
  assert.deepEqual([...a.Edir], [...b.Edir]);
  assert.deepEqual([...a.planes[0].Edir], [...b.planes[0].Edir]);
});

test('cosine lobes tilted: the flux reaches the faces exactly; an upright lobe turned upside down lights the ceiling', () => {
  const lums = [
    { type: 'c', pos: [1.2, 1.0, 2.5], psi: 0.2, tx: 25 * DEG, ty: -40 * DEG },
    { type: 'd', pos: [3.6, 2.8, 2.2], psi: 1.0, tx: -60 * DEG, ty: 15 * DEG },
  ];
  const types = [{ id: 'c', phot: 'cosine', flux: 3000 }, { id: 'd', phot: 'directIndirect', flux: 2000, fUp: 0.3 }];
  const r = createCalc().run({ ...base, types, lums });
  const room = createRoom({ L, W, H, h: r.h });
  assert.ok(Math.abs(faceFlux(room, r.Edir).total / 5000 - 1) < 1e-9);
  assert.equal(r.lost, 0);
  // tilted by 180° about x: all the flux goes up
  const up = createCalc().run({ ...base, types: [types[0]], lums: [{ type: 'c', pos: [2.5, 2, 1.5], psi: 0, tx: Math.PI }] });
  const per = faceFlux(createRoom({ L, W, H, h: up.h }), up.Edir).perFace;
  const ceil = createRoom({ L, W, H, h: up.h }).faces.findIndex((f) => f.normal[2] < 0);
  const floor = createRoom({ L, W, H, h: up.h }).faces.findIndex((f) => f.normal[2] > 0);
  assert.equal(per[floor], 0);
  assert.ok(per[ceil] > 0);
});

test('point formula: a tilted cosine lobe equals I₀·cos(angle to the axis)', () => {
  const phot = createPhotometry({ type: 'cosine', flux: 1000 });
  const s = { pos: [2, 2, 2.5], psi: 0.7, tx: 0.4, ty: -0.3 };
  const R = lumMatrix(s), axis = [-R[2], -R[5], -R[8]];
  for (const x of [[0.3, 0.5, 0], [4.5, 3, 0], [0, 2, 1.5], [4.9, 0.1, 2.9]]) {
    const n = x[2] === 0 ? [0, 0, 1] : (x[0] === 0 ? [1, 0, 0] : [0, 0, -1]);
    const d = [x[0] - s.pos[0], x[1] - s.pos[1], x[2] - s.pos[2]], r = Math.hypot(...d);
    const cosA = (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / r;
    const cosXi = -(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / r;
    const want = cosA > 0 && cosXi > 0 ? 1000 / Math.PI * cosA * cosXi / (r * r) : 0;
    const got = directAtPoint(x, n, [s], phot);
    assert.ok(Math.abs(got - want) <= 1e-13 * Math.max(want, 1), `${got} vs ${want}`);
  }
});

test('files tilted: the flux on the faces within 1e-3 (adaptive cubature), in the ceiling plane only the lower half', () => {
  const table = fixture('ERCO-C1000001.ldt');
  const types = [{ id: 'f', phot: 'file', flux: 0, table, fileKey: 'erco' }];
  const phot = createPhotometry({ type: 'file', flux: 0, table });
  const lums = [
    { type: 'f', pos: [1.5, 1.2, 2.6], psi: 0.3, tx: 20 * DEG, ty: 35 * DEG },
    { type: 'f', pos: [3.8, 2.6, 2.6], psi: -0.6, tx: -45 * DEG, ty: 0 },
  ];
  const r = createCalc().run({ ...base, types, lums });
  const room = createRoom({ L, W, H, h: r.h });
  assert.ok(Math.abs(faceFlux(room, r.Edir).total / (2 * phot.flux) - 1) < 1e-3);
  // in the ceiling plane: the flux below the horizontal of the tilted distribution
  const s = { pos: [2.5, 2, H], psi: 0, tx: 0, ty: 30 * DEG };
  const down = emittedFlux(phot, H, H, s);
  assert.equal(down, downwardFlux(phot, lumMatrix(s)));
  assert.ok(down < phot.flux && down > 0.3 * phot.flux);
  const E = elementDirect(room, [s], phot);
  assert.ok(Math.abs(faceFlux(room, E).total / down - 1) < 1e-3);
  // the quadrature of downwardFlux reproduces the flux of the table when nothing is cut off
  // (a downlight tilted by 0 and the full sphere = lower + upper of the flip)
  const up = downwardFlux(phot, lumMatrix({ tx: Math.PI }));
  const dn = downwardFlux(phot, lumMatrix({}));
  assert.ok(Math.abs((up + dn) / phot.flux - 1) < 1e-5, `${(up + dn) / phot.flux - 1}`);
});

test('a tilted luminaire breaks the mirror symmetry of a grid: the result is the luminaire-by-luminaire sum', () => {
  const table = fixture('ERCO-C1000001.ldt');
  const types = [{ id: 'f', phot: 'file', flux: 0, table, fileKey: 'erco' }];
  const lums = [];
  for (const x of [1.25, 3.75]) for (const y of [1, 3]) lums.push({ type: 'f', pos: [x, y, 2.7], psi: 0, ty: 20 * DEG });
  const all = createCalc().run({ ...base, types, lums });
  const sum = new Float64Array(all.Edir.length);
  for (const l of lums) {
    const one = createCalc().run({ ...base, types, lums: [l] });
    for (let k = 0; k < sum.length; k++) sum[k] += one.Edir[k];
  }
  let m = 0, p = 0;
  for (let k = 0; k < sum.length; k++) { m = Math.max(m, Math.abs(sum[k] - all.Edir[k])); p = Math.max(p, sum[k]); }
  assert.ok(m / p < 1e-12);
});

// --- MATLAB reference (matlab/stage21a_reference.m): agreement within 1e-9 ------------------
const REF = new URL('./fixtures/stage21a_reference.txt', import.meta.url);
test('MATLAB: direct illuminance of tilted luminaires at points and element averages', { skip: !existsSync(REF) && 'tests/fixtures/stage21a_reference.txt is not there yet (run matlab/stage21a_reference.m)' }, async (t) => {
  const { cases } = await import('./tilt-cases.mjs');
  const rows = readFileSync(REF, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('%')).map((l) => l.trim().split(/\s+/).map(Number));
  const phots = cases.map((c) => (c.file ? createPhotometry({ type: 'file', flux: 0, table: fixture(c.file) }) : createPhotometry({ type: c.phot, flux: c.flux, fUp: c.fUp })));
  const lum = (c) => ({ pos: c.pos, psi: c.psi * DEG, tx: c.tx * DEG, ty: c.ty * DEG });
  const elems = new Map();
  let worst = 0, n = 0;
  for (const r of rows) {
    const k = r[1] - 1, c = cases[k], phot = phots[k], want = r[r.length - 1];
    let got, tol = 1e-9;
    if (r[0] === 1) got = directAtPoint([r[2], r[3], r[4]], [r[5], r[6], r[7]], [lum(c)], phot);
    else if (r[0] === 2) {
      if (!elems.has(k)) elems.set(k, elementDirect(createRoom({ L: c.room[0], W: c.room[1], H: c.room[2], h: c.h }), [lum(c)], phot, undefined, false));
      got = elems.get(k)[r[2]];
      if (c.file) tol = 2e-3; // adaptive cubature (eps 1e-3) against integral2
    } else { got = downwardFlux(phot, lumMatrix(lum(c))); tol = 2e-6; } // quadratures: JS 1° Gauss 4 × 4 against MATLAB 0.1° Gauss 3 × 3 (JS off by ≤ 1e-6)
    const err = Math.abs(got - want) / Math.max(Math.abs(want), r[0] === 2 && c.file ? 1 : 1e-6);
    if (tol === 1e-9) { worst = Math.max(worst, err); n++; }
    assert.ok(err <= tol, `case ${r[1]} row ${r.join(' ')}: JS ${got}, MATLAB ${want}`);
  }
  t.diagnostic(`MATLAB stage 2.1a: ${rows.length} rows; points and lobe elements (${n}) max relative |ΔE| = ${worst.toExponential(2)}`);
});

// --- the model: groups, offsets, the file, the placement check ------------------------------
import { groupPoints, housingExtent, housingHalf } from '../js/groups.js';
import { cleanModel, modelFromValues, instances, placementErrors } from '../js/model.js';
import { DEFAULTS } from '../js/ui.js';

test('groups: every luminaire gets the group tilt; offsets add to it; no tilt — no fields', () => {
  const room = { L: 6, W: 4 };
  const g = { kind: 'grid', nx: 2, ny: 1, hm: 3, psi: 0 };
  assert.deepEqual(Object.keys(groupPoints(g, room)[0]), ['x', 'y', 'hm', 'psi']);
  const t = groupPoints({ ...g, tx: 10, ty: -20, offs: { 1: { dty: 5 } } }, room);
  assert.deepEqual([t[0].tx, t[0].ty, t[1].tx, t[1].ty], [10, -20, 10, -15]);
  const l = groupPoints({ kind: 'line', x0: 0, y0: 1, x1: 4, y1: 1, n: 3, hm: 3, hm1: 3, psi: 0, ty: 30 }, room);
  assert.ok(l.every((p) => p.ty === 30 && p.tx === 0));
  const c = groupPoints({ kind: 'circle', cx: 3, cy: 2, r: 1, n: 4, hm: 3, psi: 0, tx: 15 }, room);
  assert.ok(c.every((p) => p.tx === 15));
  const s = groupPoints({ kind: 'single', points: [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2, y: 1, hm: 3, psi: 0, ty: 45 }] }, room);
  assert.equal(s[0].ty, undefined);
  assert.equal(s[1].ty, 45);
});

test('the file keeps the tilt (−90…90, zero not written); reading v2.1 files is unchanged', () => {
  const m = modelFromValues(DEFAULTS);
  const d = JSON.parse(JSON.stringify(m));
  d.groups = [
    { ...d.groups[0], tx: 12.5, ty: -120, offs: { 0: { dtx: 3, dty: 0 } } },
    { id: 'g2', type: d.types[0].id, kind: 'single', points: [{ x: 1, y: 1, hm: 2.5, psi: 0, tx: 0, ty: 30 }, { x: 2, y: 1, hm: 2.5, psi: 0, tx: 'a' }] },
  ];
  const r = cleanModel(d);
  assert.equal(r.groups[0].tx, 12.5);
  assert.equal(r.groups[0].ty, -90);
  assert.deepEqual(r.groups[0].offs, { 0: { dtx: 3 } });
  assert.deepEqual(r.groups[1].points[0], { x: 1, y: 1, hm: 2.5, psi: 0, tx: 0, ty: 30 });
  assert.deepEqual(Object.keys(r.groups[1].points[1]), ['x', 'y', 'hm', 'psi']);
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(r))), r);
  const plain = cleanModel(JSON.parse(JSON.stringify(m)));
  assert.equal(plain.groups[0].tx, undefined);
});

test('instances: the photometric centre turns about the mounting point; untilted as before', () => {
  const m = modelFromValues(DEFAULTS);
  const tilted = { ...m, groups: [{ id: 'g1', type: m.types[0].id, kind: 'single', points: [{ x: 2, y: 2, hm: 3, psi: 0, ty: 90 }] }] };
  const [i] = instances(tilted, () => 0.2);
  // tilt by +90° about y: the downward axis points to −x, the centre 0.2 m along it
  assert.ok(Math.abs(i.pos[0] - 1.8) < 1e-12 && Math.abs(i.pos[1] - 2) < 1e-12 && Math.abs(i.pos[2] - 3) < 1e-12);
  assert.ok(Math.abs(i.ty - Math.PI / 2) < 1e-15 && i.tx === 0);
  const flat = { ...tilted, groups: [{ ...tilted.groups[0], points: [{ x: 2, y: 2, hm: 3, psi: 0 }] }] };
  const [j] = instances(flat, () => 0.2);
  assert.deepEqual(j.pos, [2, 2, 2.8]);
  assert.equal(j.tx, undefined);
});

test('placement: the plan box of the turned housing; a corner above the ceiling is allowed', () => {
  const size = { a: 0.4, b: 0.2, h: 0.3 };
  assert.deepEqual(housingExtent(size, 30), (([hx, hy]) => [-hx, hx, -hy, hy])(housingHalf(size, 30)));
  const e = housingExtent(size, 0, 0, 90);
  // the housing lies along −x after +90° about y: from −0.3 (its bottom) to 0 in x, a/2 above and below in z
  assert.ok(Math.abs(e[0] + 0.3) < 1e-12 && Math.abs(e[1]) < 1e-12 && Math.abs(e[3] - 0.1) < 1e-12);
  const m = modelFromValues(DEFAULTS);
  const at = (x, ty) => ({ ...m, groups: [{ id: 'g1', type: m.types[0].id, kind: 'single', points: [{ x, y: 2, hm: m.room.H, psi: 0, ty }] }] });
  assert.deepEqual(placementErrors(at(0.2, 0), () => size), []);
  assert.deepEqual(placementErrors(at(0.2, 90), () => size).map((e) => e.code), ['outside']);
  assert.deepEqual(placementErrors(at(0.35, 90), () => size), []);
});

test('the fields: X and Y are the tilt; a group keeps it only when not zero; the selection tilts', async () => {
  const { validateGroup, fieldValues } = await import('../js/groupform.js');
  const { tiltSelection } = await import('../js/planedit.js');
  const ctx = { H: 3, L: 6, W: 4, others: 0 };
  const grid = { id: 'g1', type: 't1', kind: 'grid', nx: 2, ny: 2, hm: 3, psi: 0 };
  let r = validateGroup(grid, { ...fieldValues(grid, ctx), tx: '15', ty: '0' }, ctx);
  assert.ok(r.ok);
  assert.equal(r.group.tx, 15);
  assert.equal(r.group.ty, 0);
  r = validateGroup(r.group, { ...fieldValues(r.group, ctx), tx: '0' }, ctx);
  assert.equal('tx' in r.group, false);
  r = validateGroup(grid, { ...fieldValues(grid, ctx), ty: '95' }, ctx);
  assert.ok(!r.ok && r.errors.ty);
  const single = { id: 'g2', type: 't1', kind: 'single', points: [{ x: 1, y: 1, hm: 3, psi: 0 }] };
  r = validateGroup(single, { ...fieldValues(single, { ...ctx, at: 0 }), ty: '-30' }, { ...ctx, at: 0 });
  assert.deepEqual(r.group.points[0], { x: 1, y: 1, hm: 3, psi: 0, tx: 0, ty: -30 });
  // the selection: a whole group, a luminaire within a group (an offset), single luminaires
  const m = { room: { H: 3 }, groups: [grid, single] };
  let s = { groups: new Set(['g1']), points: new Map() };
  assert.equal(tiltSelection(m, s, 'tx', 20).groups[0].tx, 20);
  assert.equal(tiltSelection(m, s, 'tx', 120, true).groups[0].tx, 90);
  s = { groups: new Set(), points: new Map([['g1', new Set([1])]]) };
  const m2 = tiltSelection({ ...m, groups: [{ ...grid, tx: 10 }, single] }, s, 'tx', 25, true);
  assert.deepEqual(m2.groups[0].offs, { 1: { dtx: 15 } });
  assert.deepEqual(tiltSelection(m2, s, 'tx', 10, true).groups[0].offs, undefined);
  s = { groups: new Set(), points: new Map([['g2', new Set([0])]]) };
  assert.equal(tiltSelection(m, s, 'ty', -15).groups[1].points[0].ty, -15);
});

test('calcParams carries the tilt to the calculation; the report shows it', async () => {
  const { calcParams } = await import('../js/model.js');
  const { summaryRows } = await import('../js/reportui.js');
  const m = modelFromValues(DEFAULTS);
  const tm = { ...m, groups: [{ ...m.groups[0], ty: 30 }] };
  const p = calcParams(tm);
  assert.ok(p.lums.every((l) => Math.abs(l.ty - Math.PI / 6) < 1e-15 && l.tx === 0));
  assert.ok(calcParams(m).lums.every((l) => !('ty' in l)));
  const v = { ...DEFAULTS, rhoC: 0.7, rhoW: 0.5, rhoF: 0.2 };
  const rows = summaryRows(v, null, null, 2.8, { tilt: [[0, 30], [0, 15]] }).lumRows;
  assert.ok(rows.some((r) => /X.*0°, Y.*15…30°/.test(r[1])));
  assert.ok(!summaryRows(v, null, null, 2.8, { tilt: [[0, 0]] }).lumRows.some((r) => /Y.*°/.test(r[1]) && /X/.test(r[1])));
});
