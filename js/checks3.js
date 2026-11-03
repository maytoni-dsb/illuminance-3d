// Stage 3 acceptance checks shown on the page ("Критерии этапа 3"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/direct.test.mjs (MATLAB comparison included).
// Check names and details are user-facing and therefore in Russian.

import { createRoom } from './geometry.js';
import { luminaireGrid } from './photometry.js';
import { directAtPoint, elementDirectExact, elementDirectCenters, elementDirectQuadrature, faceFlux } from './direct.js';

/** 3.1e-15 → "3,1·10<sup>−15</sup>" (decimal comma for the Russian UI; the panel uses innerHTML). */
function exp(x) {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(1).split('e');
  return `${m.replace('.', ',')}·10<sup>${e.replace('-', '−').replace('+', '')}</sup>`;
}
const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

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
  let detail = `пол: ${fmt(below)} лк, I(0)/d² = ${fmt(want)} лк, отличие ${exp(rel)}`;
  if (hc > 0 && phot.intensity(0, Math.PI) > 0) {
    const above = directAtPoint([s[0], s[1], H], [0, 0, -1], one, phot);
    const wantUp = phot.intensity(0, Math.PI) / (hc * hc);
    const r2 = Math.abs(above - wantUp) / wantUp;
    rel = Math.max(rel, r2);
    detail += `; потолок: ${fmt(above)} лк, I(180°)/h<sub>c</sub>² = ${fmt(wantUp)} лк`;
  }
  out.push({ name: 'Под светильником E = I(0)/d²', ok: rel <= 1e-12, detail: `один светильник; ${detail}` });

  // 2. Flux reaching all faces equals the luminaires' flux: element averages (exact)
  const total = lums.length * phot.flux;
  const errExact = Math.abs(faceFlux(room, E).total / total - 1);
  out.push({
    name: 'Поток на все грани равен потоку светильников',
    ok: errExact <= 1e-9,
    detail: `средние по элементам: |ΣE·A / ΣΦ − 1| = ${exp(errExact)} при N = ${room.N}`,
  });

  // 3. The same with values at element centres on a fine mesh (h/2): within 1e-3
  const fine = createRoom({ L, W, H, h: room.h / 2 });
  const Ec = elementDirectCenters(fine, lums, phot);
  const errCentres = Math.abs(faceFlux(fine, Ec).total / total - 1);
  out.push({
    name: 'Баланс потока по центрам элементов при мелкой сетке',
    ok: errCentres <= 1e-3,
    detail: `|ΣE·A / ΣΦ − 1| = ${exp(errCentres)} при N = ${fine.N} (шаг h/2); на основной сетке: ${exp(Math.abs(faceFlux(room, elementDirectCenters(room, lums, phot)).total / total - 1))}`,
  });

  // 4. Exact element averages against an independent Gauss 8 × 8 rule on the floor
  const floor = { ...room, faces: [room.faces[0]] };
  const Eq = elementDirectQuadrature(floor, lums, phot, 8, new Float64Array(room.N));
  let worst = 0;
  for (let k = 0; k < room.faces[0].count; k++) worst = Math.max(worst, Math.abs(Eq[k] - E[k]) / E[k]);
  out.push({
    name: 'Средние по элементам: точная формула и квадратура',
    ok: worst <= 1e-9,
    detail: `пол, Гаусс 8 × 8 по формуле в точке: наибольшее относительное отличие ${exp(worst)}`,
  });
  return out;
}
