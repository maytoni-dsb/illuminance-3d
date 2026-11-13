// Stage 6 criterion: comparison with DIALux evo for a reference room (report and LDT from the user,
// 5 Nov 2026). Room 6 × 4 × 3 m, ρ 0.7 / 0.5 / 0.2, MF 0.75, 4 × 2 Maytoni Focus LED (840 lm).
// DIALux hangs the luminaire by the top of its housing at the mounting height 3.000 m, so the
// photometric centre is the LDT height (125 mm) lower: h_c = 0.125 here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePhotometryFile } from '../js/photfile.js';
import { createCalc } from '../js/calc.js';
import { createRoom, autoStep } from '../js/geometry.js';
import { faceAverages } from '../js/direct.js';

const ref = JSON.parse(readFileSync(new URL('./fixtures/dialux-focus-led.json', import.meta.url), 'utf8'));
const table = parsePhotometryFile(readFileSync(new URL(`./fixtures/${ref.file}`, import.meta.url), 'latin1'), ref.file);
const { L, W, H, rho, mf } = ref.room;
const calc = createCalc();
const r = calc.run({
  L, W, H, nx: ref.luminaires.nx, ny: ref.luminaires.ny, flux: 840, hc: ref.luminaires.luminaireHeight, psi: 0,
  phot: 'file', table, fileKey: 'focus', rho: [rho.floor, rho.ceiling, rho.walls, rho.walls, rho.walls, rho.walls], hwp: 0.8, checks: false,
});
const rel = (a, b) => Math.abs(a / b - 1);

test('DIALux: Ē of the work plane and of the faces within 5 % (stage 6 criterion: 5–10 %)', () => {
  const wp = r.planes.find((p) => p.z === 0.8);
  assert.ok(rel(mf * wp.stats.avg, ref.results.workplane.avg) < 0.05, `plane 0.8: ${mf * wp.stats.avg}`);
  const room = createRoom({ L, W, H, h: autoStep(L, W, H) });
  const fa = faceAverages(room, r.Edir.map((v, k) => v + r.Eind[k])).map((v) => mf * v);
  assert.ok(rel(fa[0], ref.results.floor.avg) < 0.05, `floor ${fa[0]}`);
  assert.ok(rel(fa[1], ref.results.ceiling.avg) < 0.05, `ceiling ${fa[1]}`);
  for (const k of [2, 3]) assert.ok(rel(fa[k], (ref.results.walls.y[0] + ref.results.walls.y[1]) / 2) < 0.05, `wall ${k}: ${fa[k]}`);
  for (const k of [4, 5]) assert.ok(rel(fa[k], (ref.results.walls.x[0] + ref.results.walls.x[1]) / 2) < 0.05, `wall ${k}: ${fa[k]}`);
});

test('DIALux: point values at the GOST grid of the 0.8 m plane within 5 %, E_max within 5 %', () => {
  const wp = r.planes.find((p) => p.z === 0.8);
  const g = wp.field.gost;
  assert.deepEqual([g.nx, g.ny], [9, 6]);
  let worst = 0;
  ref.workplaneGrid.rows.forEach((row, j) => row.forEach((v, i) => {
    if (v === null) return;
    worst = Math.max(worst, rel(mf * g.E[i + j * g.nx], v));
  }));
  assert.ok(worst < 0.05, `worst point ${worst}`);
  assert.ok(rel(mf * wp.stats.max, ref.results.workplane.max) < 0.05, `E_max ${mf * wp.stats.max}`);
});

test('E_min and E_max are point extremes: every GOST value and node lies within them', () => {
  for (const pl of r.planes) {
    const { min, max } = pl.stats;
    for (const v of pl.field.gost.E) assert.ok(v >= min - 1e-9 && v <= max + 1e-9);
    for (const v of pl.field.E) assert.ok(v >= min - 1e-9 && v <= max + 1e-9);
    assert.ok(pl.stats.max >= pl.stats.cellMax && pl.stats.min <= pl.stats.cellMin);
  }
});
