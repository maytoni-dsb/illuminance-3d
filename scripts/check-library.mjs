// Checks a folder of photometric files (IES / LDT): every file must parse, and the flux of the
// interpolated intensity table must agree with the rated luminaire flux within 1 % (spec, stage 5).
// IES files with absolute photometry state no luminaire flux; they are compared with the LDT file
// of the same name when there is one, and the two tables are compared direction by direction.
//
//   node scripts/check-library.mjs <folder> [--json report.json] [--verbose]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parsePhotometryFile } from '../js/photfile.js';
import { createPhotometry } from '../js/photometry.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: node scripts/check-library.mjs <folder> [--json out.json] [--verbose]'); process.exit(2); }
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const verbose = args.includes('--verbose');
const TOL = 0.01;

/** Decodes a file: UTF-8 when valid, otherwise Windows-1252 (common in LDT files). */
export function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

const files = readdirSync(dir).filter((f) => /\.(ies|ldt)$/i.test(f)).sort();
const rows = [];
const byStem = new Map();
for (const f of files) {
  const r = { file: f, ok: false };
  try {
    const t = parsePhotometryFile(decode(readFileSync(join(dir, f))), f);
    const p = createPhotometry({ type: 'file', table: t });
    Object.assign(r, { ok: true, format: t.format, sym: t.sym, planes: t.C.length, nG: t.gamma.length,
      flux: p.flux, rated: t.ratedFlux, warnings: t.warnings, phot: p });
    if (t.ratedFlux) r.dev = p.flux / t.ratedFlux - 1;
  } catch (e) { r.error = e.message; }
  rows.push(r);
  const stem = basename(f, extname(f)).toLowerCase();
  if (!byStem.has(stem)) byStem.set(stem, {});
  byStem.get(stem)[extname(f).slice(1).toLowerCase()] = r;
}

// IES ↔ LDT pairs: flux and intensities in 10 000 directions
let pairs = 0;
for (const [, pr] of byStem) {
  if (!pr.ies?.ok || !pr.ldt?.ok) continue;
  pairs++;
  pr.ies.pairDev = pr.ies.flux / pr.ldt.rated - 1;
  let worst = 0, imax = 0;
  for (let a = 0; a < 100; a++) for (let b = 0; b <= 100; b++) {
    const C = 2 * Math.PI * a / 100, g = Math.PI * b / 100;
    const x = pr.ies.phot.intensity(C, g), y = pr.ldt.phot.intensity(C, g);
    imax = Math.max(imax, x, y);
    worst = Math.max(worst, Math.abs(x - y));
  }
  pr.ies.pairIntensity = worst / imax; // relative to the peak intensity
}

const parsed = rows.filter((r) => r.ok), failed = rows.filter((r) => !r.ok);
const withRated = parsed.filter((r) => r.dev !== undefined);
const iesPaired = parsed.filter((r) => r.pairDev !== undefined);
const iesAlone = parsed.filter((r) => r.format === 'ies' && r.pairDev === undefined);
const outRated = withRated.filter((r) => Math.abs(r.dev) > TOL);
const outPair = iesPaired.filter((r) => Math.abs(r.pairDev) > TOL);
const pct = (x) => `${(100 * x).toFixed(3)} %`;
const stat = (a, key) => {
  const v = a.map((r) => Math.abs(r[key])).sort((x, y) => x - y);
  return v.length ? `median ${pct(v[v.length >> 1])}, 99th pct ${pct(v[Math.floor(0.99 * (v.length - 1))])}, max ${pct(v[v.length - 1])}` : '—';
};
console.log(`files: ${rows.length} (${rows.filter((r) => /ies$/i.test(r.file)).length} IES, ${rows.filter((r) => /ldt$/i.test(r.file)).length} LDT)`);
console.log(`parsed: ${parsed.length}; rejected: ${failed.length}`);
for (const r of failed) console.log(`  ✗ ${r.file}: ${r.error}`);
const symCount = {};
for (const r of parsed) symCount[`${r.format} ${r.sym}`] = (symCount[`${r.format} ${r.sym}`] ?? 0) + 1;
console.log('symmetry:', JSON.stringify(symCount));
const warnCount = {};
for (const r of parsed) for (const w of r.warnings) { const k = w.replace(/[\d.,]+/g, '#'); warnCount[k] = (warnCount[k] ?? 0) + 1; }
console.log('warnings:'); for (const [k, v] of Object.entries(warnCount)) console.log(`  ${v} × ${k}`);
console.log(`LDT rated flux vs integral (${withRated.length} files): ${stat(withRated, 'dev')}; beyond 1 %: ${outRated.length}`);
for (const r of outRated) console.log(`  ✗ ${r.file}: integral ${r.flux.toFixed(1)} lm, rated ${r.rated.toFixed(1)} lm (${pct(r.dev)})`);
console.log(`IES integral vs rated flux of the LDT pair (${iesPaired.length} of ${pairs} pairs): ${stat(iesPaired, 'dev' in {} ? '' : 'pairDev')}; beyond 1 %: ${outPair.length}`);
for (const r of outPair) console.log(`  ✗ ${r.file}: ${pct(r.pairDev)}`);
console.log(`IES vs LDT intensities (max |ΔI| / I_max over 10 100 directions): ${stat(iesPaired, 'pairIntensity')}`);
if (verbose) for (const r of iesPaired.filter((x) => x.pairIntensity > 0.01)) console.log(`  ! ${r.file}: ${pct(r.pairIntensity)}`);
console.log(`IES without an LDT pair: ${iesAlone.length}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows.map(({ phot, ...r }) => r), null, 1));
process.exitCode = failed.length + outRated.length + outPair.length ? 1 : 0;
