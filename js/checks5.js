// Stage 5 acceptance checks shown on the page (panel "Stage 5 criteria"): photometric files.
// Pure module, no DOM. The library-wide check is scripts/check-library.mjs; tests/photfile.test.mjs
// covers the parsers with synthetic files of every symmetry.
// Check names and details come from the dictionaries (chk.s5.*).

import { expandPlanes, mirrorC } from './photometry.js';
import { gaussLegendre01 } from './direct.js';
import { t, sci, decimal } from './i18n.js';

const exp = (x) => sci(x, 1);
const pct = (x) => `${(100 * x).toFixed(3).replace('.', decimal())} %`;
const lm = (x) => `${x.toFixed(1).replace('.', decimal())} ${t('unit.lm')}`;
/** Symmetry of a file in words: chk.s5.sym.<rot|quad|half0|half90|none>. */
const symName = (s) => t(`chk.s5.sym.${s}`);

/**
 * @param {import('./geometry.js').Room} room
 * @param {{pos:number[], psi:number}[]} lums
 * @param {import('./photometry.js').Photometry} phot — type 'file'
 * @param {Float64Array} E — element-average direct illuminance
 * @param {import('./photfile.js').PhotTable} table — the parsed file
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage5Checks(room, lums, phot, E, table) {
  const out = [];

  // 1. The acceptance criterion: flux of the intensity table vs the rated flux, within 1 %
  if (table.ratedFlux) {
    const dev = phot.tableFlux / table.ratedFlux - 1;
    out.push({
      name: t('chk.s5.rated'),
      ok: Math.abs(dev) <= 0.01,
      detail: t('chk.s5.ratedDetail', { a: lm(phot.tableFlux), b: lm(table.ratedFlux), x: pct(dev) }) +
        (phot.scale !== 1 ? t('chk.s5.scaled', { a: lm(phot.flux), k: phot.scale.toFixed(4).replace('.', decimal()) }) : ''),
    });
  } else {
    out.push({
      name: t('chk.s5.rated'),
      ok: true,
      detail: t('chk.s5.iesDetail', { why: table.absolute ? t('chk.s5.absolute') : t('chk.s5.lamps', { a: lm(table.lampFlux) }), a: lm(phot.tableFlux) }),
    });
  }

  // 2. The interpolant passes through every tabulated value, also in the mirrored planes
  const nG = table.gamma.length;
  let worst = 0, Imax = 0;
  for (let i = 0; i < table.cd.length; i++) Imax = Math.max(Imax, table.cd[i]);
  const { planes } = expandPlanes(table);
  for (const C of planes) {
    const src = mirrorC(table.sym, C >= 2 * Math.PI - 1e-12 ? 0 : C);
    let p = 0;
    if (table.sym !== 'rot') {
      let best = Infinity;
      for (let i = 0; i < table.C.length; i++) { const d = Math.abs(table.C[i] - src); if (d < best) { best = d; p = i; } }
      if (best > 1e-9) { worst = Infinity; continue; }
    }
    for (let k = 0; k < nG; k++) {
      const I = phot.intensity(C >= 2 * Math.PI - 1e-12 ? 0 : C, table.gamma[k]);
      worst = Math.max(worst, Math.abs(I - phot.scale * table.cd[p * nG + k]) / (phot.scale * Imax));
    }
  }
  out.push({
    name: t('chk.s5.through'),
    ok: worst <= 1e-12,
    detail: t('chk.s5.throughDetail', { c: table.C.length, p: planes.length, s: symName(table.sym), g: nG, x: exp(worst) }),
  });

  // 3. The closed-form flux of the interpolant against Gauss quadrature over every cell
  const { x: gx, w: gw } = gaussLegendre01(6);
  const g = table.gamma;
  let quad = 0;
  const nP = planes.length;
  for (let c = 0; c < Math.max(1, nP - 1); c++) {
    const c0 = nP > 1 ? planes[c] : 0, c1 = nP > 1 ? planes[c + 1] : 2 * Math.PI;
    for (let k = 0; k < nG - 1; k++) {
      for (let a = 0; a < 6; a++) {
        const C = c0 + gx[a] * (c1 - c0);
        for (let b = 0; b < 6; b++) {
          const gm = g[k] + gx[b] * (g[k + 1] - g[k]);
          quad += gw[a] * gw[b] * phot.intensity(C, gm) * Math.sin(gm) * (c1 - c0) * (g[k + 1] - g[k]);
        }
      }
    }
  }
  const qerr = Math.abs(quad / phot.flux - 1);
  out.push({
    name: t('chk.s5.closed'),
    ok: qerr <= 1e-10,
    detail: t('chk.s5.closedDetail', { a: lm(phot.flux), x: exp(qerr), d: lm(phot.fluxDown), u: lm(phot.fluxUp) }),
  });

  // 4. Every luminaire puts its whole flux on the faces (adaptive cubature, control 1e-3)
  const per = E.stats?.perLum ?? [];
  const w = per.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  out.push({
    name: t('chk.s5.each'),
    ok: per.length > 0 && w <= 1e-3,
    detail: t('chk.s5.eachDetail', {
      n: E.stats?.luminaires ?? per.length, k: per.length, x: exp(w),
      e: Math.round((E.stats?.evals ?? 0) / Math.max(1, room.N * lums.length)), d: E.stats?.depth ?? '—', r: E.stats?.retries ?? '—',
    }),
  });
  return out;
}

