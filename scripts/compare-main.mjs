// Comparison with the working version (spec v2, acceptance of stage 2.0 and later stages):
// the calculation modules of branch main are taken from git into a temporary folder and run on the
// same version 1 rooms as the modules of the working tree; the results are compared value by value
// and the times of both are measured.
//
//   node scripts/compare-main.mjs [ref] [--runs N]   — ref: a branch or commit (main by default)
//
// The rooms: the defaults, rooms of different size, rotations, mounting heights below the ceiling,
// cosine photometry and files of every symmetry from tests/fixtures/photometry. Every room goes
// through the project file of version 1 and the page of version 2: parseProject (v1 file → model),
// then model.calcParams — the way the page builds the inputs.
// Exit code 1 when a value differs by more than 1e-9 relative, or v2 is more than 15 % slower.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const ref = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'main';
const runs = Number(args[args.indexOf('--runs') + 1]) || 3;
const DEG = Math.PI / 180;
const FIX = join(root, 'tests', 'fixtures', 'photometry');

// ---- the modules of the reference branch ----
const dir = mkdtempSync(join(tmpdir(), 'lcalc-main-'));
const tar = join(dir, 'js.tar');
writeFileSync(tar, execFileSync('git', ['archive', ref, 'js'], { cwd: root, maxBuffer: 1 << 26 }));
execFileSync('tar', ['-xf', tar, '-C', dir]);
const imp = (base, f) => import(pathToFileURL(join(base, 'js', f)).href);
const A = { calc: await imp(dir, 'calc.js'), ui: await imp(dir, 'ui.js'), photfile: await imp(dir, 'photfile.js') };
const B = { calc: await imp(root, 'calc.js'), project: await imp(root, 'project.js'), model: await imp(root, 'model.js'), ui: await imp(root, 'ui.js'), photfile: await imp(root, 'photfile.js') };

// ---- the rooms (form values of version 1 and a file) ----
const D = A.ui.DEFAULTS;
const ROOMS = [
  { name: 'defaults', v: { ...D } },
  { name: 'office 7.2×4.8, psi 90', v: { ...D, L: 7.2, W: 4.8, H: 3.1, hm: 2.85, nx: 4, ny: 3, psi: 90, rhoC: 0.8, rhoW: 0.6, rhoF: 0.3, hwp: 0.8, flux: 3600 } },
  { name: 'corridor 20×2', v: { ...D, L: 20, W: 2, H: 2.8, hm: 2.8, nx: 10, ny: 1, flux: 1500 } },
  { name: 'hall 18×12×6, 8×5', v: { ...D, L: 18, W: 12, H: 6, hm: 5.5, nx: 8, ny: 5, flux: 12000, hwp: 0 } },
  { name: 'Focus LED, psi 30', v: { ...D, L: 5.4, W: 3.6, H: 2.8, hm: 2.6, nx: 4, ny: 2, psi: 30, hwp: 0.8 }, file: 'Focus-LED-TR032-2-12W3K-S-B.ldt' },
  { name: 'ERCO wallwasher B0000021 (IES)', v: { ...D, L: 6, W: 4, H: 3, nx: 3, ny: 2, psi: 0 }, file: 'ERCO-B0000021.ies' },
  { name: 'ERCO C1000005, 6×4', v: { ...D, L: 9, W: 6, H: 3.5, hm: 3.2, nx: 6, ny: 4 }, file: 'ERCO-C1000005.ldt' },
  { name: 'Nostalgia (field 24), psi 90', v: { ...D, L: 4, W: 4, H: 2.7, hm: 2.2, nx: 2, ny: 2, psi: 90 }, file: 'Nostalgia.ldt' },
  { name: 'TR186 IES, 5×3', v: { ...D, L: 6, W: 4, H: 3, nx: 5, ny: 3 }, file: 'TR186-1-8W4K-B.ies' },
  { name: 'O570 wall, 2×1', v: { ...D, L: 3, W: 3, H: 2.5, hm: 2, nx: 2, ny: 1, psi: 45 }, file: 'O570WL-L10B3K.ldt' },
];

/** A version 1 project file with the room, as main saves it. */
function fileV1(r, text) {
  const values = { ...r.v, phot: r.file ? 'file' : 'cosine' };
  return JSON.stringify({ format: 'maytoni-lighting-calc', version: 1, saved: '', info: {},
    rooms: [{ name: r.name, values, norm: null, file: r.file ? { name: r.file, text, set: 0 } : null }], active: 0 });
}

/** Inputs of version 1, as index.html of main builds them (calcParams). */
function paramsA(v, table) {
  const housing = table ? table.luminaire?.height || 0 : 0;
  const p = { L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, flux: v.flux, hc: A.ui.ceilingDrop(v.H, v.hm, housing), psi: v.psi * DEG,
    phot: table ? 'file' : 'cosine', rho: A.ui.faceRho(v), hwp: v.hwp, checks: false };
  if (table) { p.fileKey = 'k'; p.table = table; }
  return p;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
/** Largest relative difference of two arrays (relative to the largest value of a). */
function rel(a, b) {
  if (a.length !== b.length) return Infinity;
  let m = 0, s = 0;
  for (let k = 0; k < a.length; k++) { m = Math.max(m, Math.abs(a[k] - b[k])); s = Math.max(s, Math.abs(a[k])); }
  return s > 0 ? m / s : m;
}
/** Runs both in turn (A, B, A, B, …), so that warm-up and machine load fall on both alike. */
function timeBoth(fa, fb) {
  const ta = [], tb = [];
  let a, b;
  for (let k = 0; k < runs; k++) {
    let t0 = performance.now(); a = fa(); ta.push(performance.now() - t0);
    t0 = performance.now(); b = fb(); tb.push(performance.now() - t0);
  }
  return [{ out: a, ms: median(ta) }, { out: b, ms: median(tb) }];
}

let bad = 0, sumA = 0, sumB = 0;
console.log(`v2 (working tree) against ${ref}: ${ROOMS.length} rooms, median of ${runs} cold runs each, in turn\n`);
console.log('room'.padEnd(34) + 'max rel. diff'.padStart(14) + `${ref}, ms`.padStart(12) + 'v2, ms'.padStart(10) + 'ratio'.padStart(8));
for (const r of ROOMS) {
  const text = r.file ? readFileSync(join(FIX, r.file), 'latin1') : '';
  const tableA = r.file ? A.photfile.parsePhotometryFile(text, r.file) : null;
  const tableB = r.file ? B.photfile.parsePhotometryFile(text, r.file) : null;
  const vA = A.ui.validateParams({ ...r.v, phot: r.file ? 'file' : 'cosine' }).values;
  const pA = paramsA(vA, tableA);
  // v2: the room passes through the version 1 project file and the model, as on the page
  const proj = B.project.parseProject(fileV1({ ...r, v: vA }, text));
  const m = proj.rooms[0].model;
  const pB = { ...B.model.calcParams(m, () => (tableB ? { key: 'k', table: tableB } : null)), checks: false };
  const [a, b] = timeBoth(() => A.calc.createCalc().run(pA), () => B.calc.createCalc().run(pB));
  const d = Math.max(
    rel(a.out.Edir, b.out.Edir), rel(a.out.Eind, b.out.Eind),
    ...a.out.planes.map((pl, k) => rel(pl.E, b.out.planes[k]?.E ?? [])),
    ...a.out.planes.map((pl, k) => rel(pl.field.E, b.out.planes[k]?.field.E ?? [])),
    ...a.out.planes.map((pl, k) => rel([pl.stats.avg, pl.stats.min, pl.stats.max], [b.out.planes[k].stats.avg, b.out.planes[k].stats.min, b.out.planes[k].stats.max])),
  );
  const ratio = b.ms / a.ms;
  sumA += a.ms; sumB += b.ms;
  if (!(d <= 1e-9)) bad++;
  console.log(r.name.padEnd(34) + (d === 0 ? '0 (bitwise)' : d.toExponential(1)).padStart(14) + a.ms.toFixed(0).padStart(12) + b.ms.toFixed(0).padStart(10) + ratio.toFixed(2).padStart(8));
}
const total = sumB / sumA;
console.log(`\ntotal: ${ref} ${sumA.toFixed(0)} ms, v2 ${sumB.toFixed(0)} ms, ratio ${total.toFixed(2)}`);
rmSync(dir, { recursive: true, force: true });
if (bad || total > 1.15) {
  console.log(bad ? `${bad} room(s) differ` : 'v2 is slower');
  process.exit(1);
}
console.log('results identical, speed not worse');
