// Stage 2.1a: four tilted spots compared with DIALux (tests/fixtures/dialux21a/README.md). The DIALux
// rotation X / Y / Z is our tx, ty, ψ (R = Rz·Ry·Rx), about the mounting point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelFromValues, calcParams, placementErrors } from '../js/model.js';
import { DEFAULTS } from '../js/ui.js';
import { parsePhotometryFile, luminaireShape } from '../js/photfile.js';
import { createPhotometry } from '../js/photometry.js';
import { createCalc } from '../js/calc.js';
import { createRoom } from '../js/geometry.js';
import { gridFormFactors, planeIlluminance } from '../js/workplane.js';

const FILE = 'TR032-2-12W4K-S-B.ldt';
// x, y, X, Y, Z of the report (page 25)
const LUMS = [[2.693, 2.832, 0, -39.2, 99.4], [1.137, 2.717, 0, -40.6, 104.7], [2.791, 1.089, 0, -44.0, 30.5], [1.258, 0.643, -16.5, 14.6, 4.2]];
// work plane at 0.8 m, points 0.25 + 0.5 i, rows from y = 3.75 down to y = 0.25; null — hidden in the report
const DLX = [
  [168, 396, 211, 104, 293, 277, 67.1, null],
  [59.9, 94.7, 75.1, 59.2, 77.2, 75.0, 46.7, null],
  [33.5, null, 41.8, 39.4, null, 43.4, 46.3, null],
  [26.2, 29.6, 30.7, 32.0, 33.9, 39.3, 64.3, 205],
  [25.7, 28.3, 28.2, 28.7, 29.5, 39.7, null, 313],
  [31.4, 37.0, 34.9, 29.3, 29.5, 33.9, 55.9, 113],
  [65.4, null, 81.2, 36.5, 27.3, 26.0, 31.1, 32.7],
  [216, null, 335, 48.2, 24.9, 21.5, 20.8, null],
];
const MF = 0.75;
const close = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) <= tol, `${what}: ${a.toFixed(2)} vs ${b} (${((a / b - 1) * 100).toFixed(2)} %)`);

test('four tilted spots: work plane, floor, walls, ceiling and 55 points as in DIALux', () => {
  const text = readFileSync(new URL(`./fixtures/dialux21a/${FILE}`, import.meta.url), 'latin1');
  const table = parsePhotometryFile(text, FILE), phot = createPhotometry({ type: 'file', table }), shape = luminaireShape(table);
  close(phot.flux, 840, 1e-3, 'flux');
  const m = modelFromValues({ ...DEFAULTS, L: 4, W: 4, H: 2.7, rhoC: 0.7, rhoW: 0.5, rhoF: 0.2, hwp: 0.8, mf: MF, hm: 2.7 });
  m.types = [{ id: 't', photometry: 'file', flux: phot.flux, cct: 4000, power: 12, file: { name: FILE, text, set: 0 } }];
  m.groups = [{ id: 'g', type: 't', kind: 'single', points: LUMS.map(([x, y, tx, ty, psi]) => ({ x, y, hm: 2.7, psi, tx, ty })) }];
  assert.deepEqual(placementErrors(m, () => ({ a: shape.housing.a, b: shape.housing.b, h: table.luminaire.height })), []);
  const p = calcParams(m, () => ({ key: 'tr032', table, phot }));
  const r = createCalc().run({ ...p, checks: true });
  assert.ok(r.checks3.every((c) => c.ok));
  const [floor, wp] = r.planes;
  // measured 26 Nov 2026: Ē −0.7 %, E_max −0.8 %; floor −0.7 %, −0.5 %
  close(MF * wp.stats.avg, 88.0, 0.015, 'work plane Ē');
  close(MF * wp.stats.max, 790, 0.015, 'work plane E_max');
  close(MF * floor.stats.avg, 56.1, 0.015, 'floor Ē');
  close(MF * floor.stats.max, 379, 0.015, 'floor E_max');
  // E_min: ours 12.8 lx in the corner (3.93, 0.07) where DIALux's adaptive grid does not reach;
  // the nearest common point (3.75, 0.25): 18.4 against 17.6 (below, not compared, hidden value)
  assert.ok(MF * wp.stats.min < 15.5 && MF * wp.stats.min > 0.75 * 15.5);
  // walls and ceiling: mean illuminance of the face; measured −0.2 … +1.2 %
  const room = createRoom({ L: 4, W: 4, H: 2.7, h: r.h });
  const want = { 5: 76.2, 3: 127, 2: 64.7, 4: 41.5, 1: 28.5 };
  for (const f of room.faces) {
    if (!(f.id in want)) continue;
    let s = 0;
    for (let k = f.offset; k < f.offset + f.count; k++) s += r.Edir[k] + r.Eind[k];
    close(MF * s / f.count, want[f.id], 0.015, `face ${f.id}`);
  }
  // the points: median 1.1 %, 90 % of them within 4.3 %; the worst −10.5 % at (0.25, 0.25) on the
  // steep flank of the beam of spot 4 (a tenth of a degree of its direction moves it by percents)
  const M = new Float64Array(room.N);
  for (const f of room.faces) for (let k = f.offset; k < f.offset + f.count; k++) M[k] = p.rho[f.id] * (r.Edir[k] + r.Eind[k]);
  const pts = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) pts.push(0.25 + 0.5 * i, 3.75 - 0.5 * j, 0.8);
  const grid = { pts: Float64Array.from(pts) };
  const E = planeIlluminance(room, grid, gridFormFactors(room, grid), M, [{ lums: p.lums, phot }]).E;
  const errs = [];
  DLX.flat().forEach((d, k) => { if (d != null) errs.push(Math.abs(MF * E[k] / d - 1)); });
  errs.sort((a, b) => a - b);
  assert.equal(errs.length, 55);
  assert.ok(errs[27] < 0.015, `median ${(errs[27] * 100).toFixed(2)} %`);
  assert.ok(errs[Math.floor(55 * 0.9)] < 0.05, `90th ${(errs[49] * 100).toFixed(2)} %`);
  assert.ok(errs[54] < 0.11, `worst ${(errs[54] * 100).toFixed(2)} %`);
});
