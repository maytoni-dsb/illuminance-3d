// Stage 2.1: several luminaire types in one room. The direct component is calculated per type and
// summed; the flux on the faces equals the sum of the fluxes of all luminaires of all types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCalc } from '../js/calc.js';
import { rectOutline, createRoom } from '../js/geometry.js';
import { createPhotometry } from '../js/photometry.js';
import { parsePhotometryFile } from '../js/photfile.js';
import { elementDirect, faceFlux } from '../js/direct.js';
import { planeField } from '../js/workplane.js';

const fixture = (f) => parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${f}`, import.meta.url), 'latin1'), f);
const relMax = (a, b) => { let m = 0, p = 0; for (let k = 0; k < a.length; k++) { m = Math.max(m, Math.abs(a[k] - b[k])); p = Math.max(p, Math.abs(b[k])); } return m / p; };
const RHO = [0.2, 0.7, 0.5, 0.5, 0.5, 0.5];
const L = 6, W = 4, H = 3;
const base = { outline: rectOutline(L, W), H, rho: RHO, hwp: 0.8 };

// two types: a cosine downlight in a line, a direct-indirect luminaire at two heights, turned
const T1 = { id: 'a', phot: 'cosine', flux: 3000 };
const T2 = { id: 'b', phot: 'directIndirect', flux: 2000, fUp: 0.3 };
const L1 = [[1, 1, 3], [2.5, 1, 3], [4, 1, 3]].map((pos) => ({ type: 'a', pos, psi: 0 }));
const L2 = [{ type: 'b', pos: [2, 3, 2.4], psi: 0.4 }, { type: 'b', pos: [5, 2.7, 2.2], psi: 1.1 }];

test('two types: the direct component and the planes are the sums of the types alone', () => {
  const calc = createCalc();
  const both = calc.run({ ...base, types: [T1, T2], lums: [...L1, ...L2] });
  const a = createCalc().run({ ...base, types: [T1], lums: L1 });
  const b = createCalc().run({ ...base, types: [T2], lums: L2 });
  const sum = (x, y) => Float64Array.from(x, (v, k) => v + y[k]);
  assert.ok(relMax(both.Edir, sum(a.Edir, b.Edir)) < 1e-14);
  // the radiosity is linear in E_dir: the reflected part adds up to the solver tolerance
  assert.ok(relMax(both.Eind, sum(a.Eind, b.Eind)) < 1e-6);
  for (let k = 0; k < both.planes.length; k++) {
    assert.ok(relMax(both.planes[k].Edir, sum(a.planes[k].Edir, b.planes[k].Edir)) < 1e-14);
    assert.ok(relMax(both.planes[k].field.Edir, sum(a.planes[k].field.Edir, b.planes[k].field.Edir)) < 1e-14);
    assert.ok(relMax(both.planes[k].field.gost.Edir, sum(a.planes[k].field.gost.Edir, b.planes[k].field.gost.Edir)) < 1e-14);
  }
  assert.equal(both.lums.length, 5);
  assert.deepEqual(both.lums.map((l) => l.type), ['a', 'a', 'a', 'b', 'b']);
});

test('criterion 2.1: the flux on the faces equals the sum of the fluxes of all types', () => {
  const r = createCalc().run({ ...base, types: [T1, T2], lums: [...L1, ...L2] });
  assert.deepEqual(r.types.map((t) => [t.id, t.count]), [['a', 3], ['b', 2]]);
  const emitted = 3 * 3000 + 2 * 2000;
  assert.ok(Math.abs(r.balance.emitted / emitted - 1) < 1e-15);
  assert.equal(r.lost, 0);
  const room = createRoom({ L, W, H, h: r.h });
  assert.ok(Math.abs(faceFlux(room, r.Edir).total / emitted - 1) < 1e-9);
  for (const t of r.types) assert.ok(Math.abs(t.onFaces / t.emitted - 1) < 1e-9, t.id);
  assert.equal(r.checks3.length, 3);
  assert.ok(r.checks3.every((c) => c.ok), JSON.stringify(r.checks3));
  assert.ok(r.checks4.every((c) => c.ok));
  assert.equal(r.checks5, undefined);
});

test('a type with a file next to a cosine type; a luminaire in the ceiling plane loses only its upward flux', () => {
  const table = fixture('ERCO-C1000001.ldt');
  const T3 = { id: 'f', phot: 'file', flux: 0, table, fileKey: 'erco' };
  const T4 = { ...T2, id: 'g' };
  const lums = [{ type: 'f', pos: [1.5, 2, 2.6], psi: 0.3 }, { type: 'f', pos: [4.2, 1.2, 2.9], psi: 2 },
    { type: 'g', pos: [3, 3, 3], psi: 0 }];
  const r = createCalc().run({ ...base, types: [T3, T4], lums });
  const ph = createPhotometry({ type: 'file', table });
  assert.ok(Math.abs(r.types[0].flux / ph.flux - 1) < 1e-15);
  // the direct-indirect luminaire in the ceiling plane emits only Φ(1 − f_up)
  assert.ok(Math.abs(r.lost - 2000 * 0.3) < 1e-9);
  assert.ok(Math.abs(r.balance.emitted - (2 * ph.flux + 2000 * 0.7)) < 1e-9);
  assert.ok(r.checks3.every((c) => c.ok), JSON.stringify(r.checks3));
  assert.ok(Math.abs(r.types[0].onFaces / r.types[0].emitted - 1) < 1e-3);
});

test('a changed type recalculates only its own part; a type without luminaires is skipped', () => {
  const calc = createCalc();
  const r1 = calc.run({ ...base, types: [T1, T2], lums: [...L1, ...L2] });
  assert.equal(r1.reused.direct, false);
  const r2 = calc.run({ ...base, types: [T1, T2], lums: [...L1, ...L2] });
  assert.equal(r2.reused.direct, true);
  // moving a luminaire of type b: the result equals a fresh calculation
  const moved = [...L1, L2[0], { ...L2[1], pos: [5, 1.5, 2.2] }];
  const r3 = calc.run({ ...base, types: [T1, T2], lums: moved });
  const fresh = createCalc().run({ ...base, types: [T1, T2], lums: moved });
  assert.equal(r3.reused.direct, false);
  assert.ok(relMax(r3.Edir, fresh.Edir) === 0);
  assert.ok(relMax(r3.planes[1].E, fresh.planes[1].E) < 1e-6);
  // an unused type takes no part
  const r4 = createCalc().run({ ...base, types: [T2, T1], lums: L1 });
  const r5 = createCalc().run({ ...base, types: [T1], lums: L1 });
  assert.deepEqual(r4.types.map((t) => t.id), ['a']);
  assert.ok(relMax(r4.Edir, r5.Edir) === 0);
});

test('symmetry with arbitrary placement: mirrored pairs of one type are used, the result is the same', () => {
  // a set with only partial mirror symmetry: two luminaires mirrored in x, one not
  const room = createRoom({ L, W, H, h: 0.4 });
  const cos = createPhotometry({ type: 'cosine', flux: 1000 });
  const lums = [{ pos: [1, 1.5, 2.8], psi: 0 }, { pos: [5, 1.5, 2.8], psi: 0 }, { pos: [2.2, 3.1, 2.8], psi: 0 }];
  assert.ok(relMax(elementDirect(room, lums, cos, undefined, true), elementDirect(room, lums, cos, undefined, false)) < 1e-12);
  const ph = createPhotometry({ type: 'file', table: fixture('Nostalgia.ldt') });
  const a = elementDirect(room, lums, ph, undefined, true), b = elementDirect(room, lums, ph, undefined, false);
  assert.ok(relMax(a, b) < 1e-3);
  // different rotations in one set: no mirror is used (each luminaire integrated)
  const turned = lums.map((l, k) => ({ ...l, psi: 0.2 * k }));
  const c = elementDirect(room, turned, ph, undefined, true);
  assert.equal(c.stats.integrated, 3);
  // the plan: the direct part at the nodes is the sum over the sets
  const M = new Float64Array(room.N);
  const f = planeField(room, 0.8, [{ lums, phot: cos }, { lums: turned, phot: ph }], M);
  const f1 = planeField(room, 0.8, [{ lums, phot: cos }], M), f2 = planeField(room, 0.8, [{ lums: turned, phot: ph }], M);
  assert.ok(relMax(f.Edir, Float64Array.from(f1.Edir, (v, k) => v + f2.Edir[k])) < 1e-14);
});
