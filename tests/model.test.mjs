// Stage 2.0: the data model of version 2 and the calculation on the outline and the instances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelFromValues, formValues, applyFormValues, withFile, modelFile, instances, calcParams, outlineOf, lumCount, cleanModel } from '../js/model.js';
import { createCalc, normalizeParams } from '../js/calc.js';
import { rectOutline, outlineRect } from '../js/geometry.js';
import { luminaireGrid } from '../js/photometry.js';
import { parsePhotometryFile } from '../js/photfile.js';
import { DEFAULTS, faceRho, ceilingDrop } from '../js/ui.js';

const DEG = Math.PI / 180;
const ldt = 'Focus-LED-TR032-2-12W3K-S-B.ldt';
const table = parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${ldt}`, import.meta.url), 'latin1'), ldt);
const fileRef = { name: ldt, text: 'LDT', set: 0 };

test('the outline of a rectangle and back', () => {
  assert.deepEqual(rectOutline(6, 4), [[0, 0], [6, 0], [6, 4], [0, 4]]);
  assert.deepEqual(outlineRect(rectOutline(7.3, 2.1)), { L: 7.3, W: 2.1 });
  // not a rectangle from the origin, or clockwise: refused until stage 2.3
  assert.throws(() => outlineRect([[0, 0], [6, 0], [6, 4], [3, 4], [3, 6], [0, 6]]), RangeError);
  assert.throws(() => outlineRect([[0, 0], [0, 4], [6, 4], [6, 0]]), RangeError);
  assert.throws(() => outlineRect([[1, 0], [6, 0], [6, 4], [1, 4]]), RangeError);
});

test('form values → model → form values is the identity; ids and the file are kept', () => {
  const v = { ...DEFAULTS, L: 7.2, W: 4.8, nx: 4, ny: 3, psi: 90, hm: 2.7, U0n: 0.4 };
  const m = withFile(modelFromValues(v), fileRef);
  assert.deepEqual(formValues(m), v);
  assert.deepEqual(outlineOf(m), rectOutline(7.2, 4.8));
  assert.equal(lumCount(m), 12);
  const e = applyFormValues({ ...m, types: [{ ...m.types[0], id: 'tA' }], groups: [{ ...m.groups[0], id: 'gA', type: 'tA' }] }, { ...v, nx: 5 });
  assert.equal(e.types[0].id, 'tA');
  assert.equal(e.groups[0].type, 'tA');
  assert.equal(e.groups[0].nx, 5);
  assert.deepEqual(modelFile(e), fileRef);
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(e))), e);
});

test('a grid gives exactly the luminaires of version 1', () => {
  const v = { ...DEFAULTS, L: 6.3, W: 4.1, H: 3.2, nx: 5, ny: 3, hm: 2.9, psi: 30 };
  const m = modelFromValues(v);
  const housing = 0.087;
  const got = instances(m, () => housing);
  const want = luminaireGrid({ L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, hc: ceilingDrop(v.H, v.hm, housing), psi: v.psi * DEG });
  assert.equal(got.length, want.length);
  got.forEach((l, k) => {
    assert.deepEqual(l.pos, want[k].pos);
    assert.equal(l.psi, want[k].psi);
    assert.equal(l.type, 't1');
    assert.equal(l.group, 'g1');
  });
});

/** Inputs of version 1, as the page of main builds them (index.html, calcParams). */
function paramsV1(v, file) {
  const p = { L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, flux: v.flux, hc: ceilingDrop(v.H, v.hm, file ? table.luminaire.height : 0),
    psi: v.psi * DEG, phot: file ? 'file' : 'cosine', rho: faceRho(v), hwp: v.hwp, checks: false };
  if (file) { p.fileKey = 'k'; p.table = table; }
  return p;
}

test('the model gives the same result as the inputs of version 1, to the last bit', () => {
  const cases = [
    { v: { ...DEFAULTS, L: 6, W: 4, H: 3, nx: 3, ny: 2, hwp: 0.8 }, file: false },
    { v: { ...DEFAULTS, L: 5.4, W: 3.6, H: 2.8, nx: 4, ny: 2, hm: 2.6, psi: 90, phot: 'file', flux: 840, hwp: 0 }, file: true },
  ];
  for (const { v, file } of cases) {
    const a = createCalc().run(paramsV1(v, file));
    const m = file ? withFile(modelFromValues(v), fileRef) : modelFromValues(v);
    const b = createCalc().run({ ...calcParams(m, () => ({ key: 'k', table })), checks: false });
    assert.deepEqual(b.Edir, a.Edir);
    assert.deepEqual(b.Eind, a.Eind);
    assert.equal(b.iterations, a.iterations);
    assert.deepEqual(b.planes.map((pl) => pl.stats), a.planes.map((pl) => pl.stats));
    assert.deepEqual(b.planes.map((pl) => pl.field.E), a.planes.map((pl) => pl.field.E));
    assert.deepEqual(b.lums, a.lums);
  }
});

test('the calculator reuses the kernel and the direct part with the new inputs', () => {
  const calc = createCalc();
  const m = modelFromValues({ ...DEFAULTS });
  const p = { ...calcParams(m), checks: false };
  calc.run(p);
  const r2 = calc.run({ ...p, rho: [0.3, 0.8, 0.5, 0.5, 0.5, 0.5] });
  assert.deepEqual(r2.reused, { kernel: true, direct: true });
  // a copy of the same instances (as after postMessage) is the same set
  const r3 = calc.run(structuredClone({ ...p, types: p.types.map(({ table: _, ...ty }) => ty) }));
  assert.deepEqual(r3.reused, { kernel: true, direct: true });
  const moved = { ...p, lums: p.lums.map((l, k) => (k ? l : { ...l, pos: [l.pos[0] + 0.1, l.pos[1], l.pos[2]] })) };
  assert.deepEqual(calc.run(moved).reused, { kernel: true, direct: false });
});

test('the calculation refuses wrong inputs', () => {
  const p = { ...calcParams(modelFromValues({ ...DEFAULTS })), checks: false };
  const calc = createCalc();
  assert.throws(() => calc.run({ ...p, types: [...p.types, { ...p.types[0] }] }), /same id/);
  assert.throws(() => calc.run({ ...p, types: [] }), /unknown type/);         // luminaires of no type
  assert.equal(calc.run({ ...p, types: [], lums: [] }).balance.emitted, 0);   // a room without luminaires (21 Nov 2026)
  assert.throws(() => calc.run({ ...p, types: undefined }), /no luminaire types/);
  assert.equal(calc.run({ ...p, lums: [] }).balance.emitted, 0); // an empty room is calculated (stage 2.1)
  assert.throws(() => calc.run({ ...p, lums: p.lums.map((l) => ({ ...l, type: 'x' })) }), /unknown type/);
  assert.throws(() => calc.run({ ...p, lums: p.lums.map((l) => ({ ...l, pos: [l.pos[0], l.pos[1], 0] })) }), /outside/);
  assert.throws(() => calc.run({ ...p, outline: [[0, 0], [6, 0], [6, 4], [3, 4], [3, 6], [0, 6]] }), RangeError);
  // version 1 inputs pass through the adapter
  assert.ok(Array.isArray(normalizeParams(paramsV1({ ...DEFAULTS }, false)).lums));
});
