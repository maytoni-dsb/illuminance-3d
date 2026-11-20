// Stage 2.1: a room with four luminaire types placed one by one, compared with DIALux
// (tests/fixtures/dialux21/README.md). The photometric centre is the housing height below the
// mounting height for all of them (pendants of 300 and 450 mm included).
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

const FIX = new URL('./fixtures/dialux21/', import.meta.url);
const TYPES = [
  ['elem', 'Elem_DL052-L7B4K.ldt', 2.797, 1.339, 500],
  ['palette', 'Palette_MOD303PL-01CFL2.ldt', 1.036, 1.296, 576],
  ['bubble', 'Bubble_dream_MOD383PL-L4BS3K.ldt', 0.643, 3.192, 150],
  ['blow', 'Blow_O435WL-L5GF3K.ldt', 2.250, 2.550, 450],
];
// DIALux work plane at 0.8 m, points 0.25 + 0.5 i, rows from y = 3.75 down to y = 0.25
const DLX = [
  [34.0, 59.2, 30.3, 30.0, 31.6, 28.7, 23.7, 19.0],
  [104, 153, 62.7, 40.4, 42.5, 38.2, 30.0, 23.0],
  [59.5, 103, 54.0, 51.9, 54.0, 48.2, 36.4, 26.4],
  [40.0, 62.0, 71.8, 67.0, 77.6, 96.8, 63.2, 30.2],
  [64.7, 134, 149, 101, 139, 139, 121, 49.0],
  [79.6, 193, 213, 122, 142, 135, 122, 61.3],
  [55.4, 110, 119, 74.3, 109, 117, 99.4, 31.4],
  [29.2, 44.4, 47.1, 37.0, 32.6, 37.8, 26.1, 17.4],
];
const MF = 0.75;
const close = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) <= tol, `${what}: ${a.toFixed(2)} vs ${b} (${((a / b - 1) * 100).toFixed(2)} %)`);

test('four types one by one: work plane, floor, walls and 64 points as in DIALux', () => {
  const parsed = {};
  const m = modelFromValues({ ...DEFAULTS, L: 4, W: 4, H: 2.7, rhoC: 0.7, rhoW: 0.5, rhoF: 0.2, hwp: 0.8, mf: MF, hm: 2.7 });
  m.types = []; m.groups = [];
  for (const [id, f, x, y, flux] of TYPES) {
    const text = readFileSync(new URL(f, FIX), 'latin1');
    const table = parsePhotometryFile(text, f);
    const phot = createPhotometry({ type: 'file', table });
    close(phot.flux, flux, 1e-3, `${id} flux`);                 // DIALux luminaire flux (Palette: field 24 = 0.9)
    parsed[id] = { key: id, table, phot, shape: luminaireShape(table) };
    m.types.push({ id, photometry: 'file', flux: phot.flux, cct: 3000, power: 1, file: { name: f, text, set: 0 } });
    m.groups.push({ id: `g-${id}`, type: id, kind: 'single', points: [{ x, y, hm: 2.7, psi: 0 }] });
  }
  const sizeOf = (ty) => { const s = parsed[ty.id].shape, h = s.housing ?? s.luminous; return { a: h?.a ?? 0, b: h?.b ?? 0, h: parsed[ty.id].table.luminaire?.height || 0 }; };
  assert.deepEqual(placementErrors(m, sizeOf), []);
  const p = calcParams(m, (ty) => parsed[ty.id]);
  assert.deepEqual(p.lums.map((l) => +l.pos[2].toFixed(3)), [2.698, 2.4, 2.25, 2.636]); // h_m − housing height
  const r = createCalc().run({ ...p, checks: true });
  assert.ok(r.checks3.every((c) => c.ok));
  const [floor, wp] = r.planes;
  // work plane: Ē 72.5, E_max 233; E_min 14.1 lx on DIALux's adaptive grid (our cells: 13.8)
  close(MF * wp.stats.avg, 72.5, 0.005, 'work plane Ē');
  close(MF * wp.stats.max, 233, 0.01, 'work plane E_max');
  close(MF * wp.stats.min, 14.1, 0.03, 'work plane E_min');
  close(MF * floor.stats.avg, 62.6, 0.005, 'floor Ē');
  close(MF * floor.stats.max, 123, 0.01, 'floor E_max');
  // walls: mean illuminance of the face
  const room = createRoom({ L: 4, W: 4, H: 2.7, h: r.h });
  const wall = { 3: 17.5, 4: 20.7, 5: 18.2, 2: 19.3 };
  for (const f of room.faces) {
    if (!(f.id in wall)) continue;
    let s = 0;
    for (let k = f.offset; k < f.offset + f.count; k++) s += r.Edir[k] + r.Eind[k];
    close(MF * s / f.count, wall[f.id], 0.01, `wall ${f.id}`);
  }
  // the 64 points
  const M = new Float64Array(room.N);
  for (const f of room.faces) for (let k = f.offset; k < f.offset + f.count; k++) M[k] = p.rho[f.id] * (r.Edir[k] + r.Eind[k]);
  const pts = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) pts.push(0.25 + 0.5 * i, 3.75 - 0.5 * j, 0.8);
  const grid = { pts: Float64Array.from(pts) };
  const sources = TYPES.map(([id]) => ({ lums: p.lums.filter((l) => l.type === id), phot: parsed[id].phot }));
  const E = planeIlluminance(room, grid, gridFormFactors(room, grid), M, sources).E;
  let worst = 0;
  DLX.flat().forEach((d, k) => { worst = Math.max(worst, Math.abs(MF * E[k] / d - 1)); });
  assert.ok(worst < 0.015, `worst point ${(worst * 100).toFixed(2)} %`);
});
