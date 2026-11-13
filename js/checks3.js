// Stage 3 acceptance checks shown on the page (panel "Stage 3 criteria"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/direct.test.mjs (MATLAB comparison included).
// Check names and details come from the dictionaries (chk.s3.*).

import { createRoom } from './geometry.js';
import { t, sci, decimal } from './i18n.js';
import { luminaireGrid } from './photometry.js';
import { directAtPoint, elementDirectExact, elementDirectCenters, elementDirectQuadrature, elementDirectAdaptive, faceFlux, emittedFlux } from './direct.js';

/** 3.1e-15 → "3.1·10<sup>−15</sup>" with the decimal separator of the language (the panel uses innerHTML). */
const exp = (x) => sci(x, 1);
const fmt = (x, d = 1) => x.toFixed(d).replace('.', decimal());
const lx = () => t('unit.lx');

/**
 * @param {import('./geometry.js').Room} room — the current room
 * @param {{pos:number[], psi:number}[]} lums — the current luminaires
 * @param {import('./photometry.js').Photometry} phot
 * @param {Float64Array} E — element-average direct illuminance E₀ of the current room
 * @param {{ hc:number, psi:number }} lumParams — suspension, m, and rotation, rad
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage3Checks(room, lums, phot, E, { hc, psi }) {
  const out = [];
  const { L, W, H } = room;

  // 1. Directly below a single luminaire: E = I(0)/d² (and above it for the upward lobe)
  const one = luminaireGrid({ L, W, H, nx: 1, ny: 1, hc, psi });
  const s = one[0].pos;
  const below = directAtPoint([s[0], s[1], 0], [0, 0, 1], one, phot);
  const want = phot.intensity(0, 0) / (s[2] * s[2]);
  let rel = Math.abs(below - want) / want;
  let detail = t('chk.s3.below', { a: `${fmt(below)} ${lx()}`, b: `${fmt(want)} ${lx()}`, x: exp(rel) });
  if (hc > 0 && phot.intensity(0, Math.PI) > 0) {
    const above = directAtPoint([s[0], s[1], H], [0, 0, -1], one, phot);
    const wantUp = phot.intensity(0, Math.PI) / (hc * hc);
    const r2 = Math.abs(above - wantUp) / wantUp;
    rel = Math.max(rel, r2);
    detail += t('chk.s3.above', { a: `${fmt(above)} ${lx()}`, b: `${fmt(wantUp)} ${lx()}` });
  }
  out.push({ name: t('chk.s3.under'), ok: rel <= 1e-12, detail: t('chk.s3.one', { d: detail }) });

  // 2. Flux reaching all faces equals the luminaires' flux (a luminaire in the ceiling plane emits
  //    only its downward flux): exact for cosine lobes, adaptive cubature for a file (control 1e-3)
  const total = lums.length * emittedFlux(phot, lums[0].pos[2], H);
  const file = !phot.lobes;
  const errExact = Math.abs(faceFlux(room, E).total / total - 1);
  out.push({
    name: t('chk.s3.flux'),
    ok: errExact <= (file ? 1e-3 : 1e-9),
    detail: t(file ? 'chk.s3.fluxFile' : 'chk.s3.fluxExact', { x: exp(errExact), n: room.N }) +
      (H - lums[0].pos[2] < 1e-12 && phot.flux - total / lums.length > 1e-9 * phot.flux ? t('chk.s3.up') : ''),
  });

  if (!file) {
    // 3. The same with values at element centres on a fine mesh (h/2): within 1e-3
    const fine = createRoom({ L, W, H, h: room.h / 2 });
    const Ec = elementDirectCenters(fine, lums, phot);
    const errCentres = Math.abs(faceFlux(fine, Ec).total / total - 1);
    out.push({
      name: t('chk.s3.centres'),
      ok: errCentres <= 1e-3,
      detail: t('chk.s3.centresDetail', { x: exp(errCentres), n: fine.N, y: exp(Math.abs(faceFlux(room, elementDirectCenters(room, lums, phot)).total / total - 1)) }),
    });
  }

  // 4. Element averages against an independent rule on the floor: Gauss 8 × 8 for cosine lobes
  //    (exact formula, 1e-9); for a file a 100 times tighter adaptive cubature (1e-2)
  const floor = { ...room, faces: [room.faces[0]] };
  const Eq = file
    ? elementDirectAdaptive(floor, lums, phot, { eps: 1e-5, abs: 1e-9, maxRetries: 0, balance: Infinity, out: new Float64Array(room.N) })
    : elementDirectQuadrature(floor, lums, phot, 8, new Float64Array(room.N));
  let worst = 0, Emax = 0;
  for (let k = 0; k < room.faces[0].count; k++) Emax = Math.max(Emax, Eq[k]);
  for (let k = 0; k < room.faces[0].count; k++) if (Eq[k] > (file ? 1e-2 * Emax : 0)) worst = Math.max(worst, Math.abs(Eq[k] - E[k]) / Eq[k]);
  out.push({
    name: t(file ? 'chk.s3.avgFile' : 'chk.s3.avgExact'),
    ok: worst <= (file ? 1e-2 : 1e-9),
    detail: file
      ? t('chk.s3.avgFileDetail', { x: exp(worst) })
      : t('chk.s3.avgExactDetail', { x: exp(worst) }),
  });
  return out;
}
