// Stage 2 acceptance checks shown on the page ("Критерии этапа 2"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/formfactor.test.mjs.
// Check names and details are user-facing and therefore in Russian.

import { pointToElements, pointToRect, coaxialRectangles } from './formfactor.js';

const UP = [0, 0, 1];
const TOL_SUM = 1e-6;

/** Gauss–Legendre nodes and weights on [−1, 1]. */
function gaussLegendre(n) {
  const x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      dp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / dp;
      if (Math.abs(z - z1) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}

/** Coaxial squares s × s at unit distance: point factor integrated over the receiving square. */
function coaxialByQuadrature(s, n = 24) {
  const { x, w } = gaussLegendre(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = [(x[i] + 1) / 2 * s, (x[j] + 1) / 2 * s, 0];
      sum += w[i] * w[j] / 4 * pointToRect(p, UP, [0, 0, 1], [s, 0, 0], [0, s, 0], [0, 0, -1]);
    }
  }
  return sum;
}

/** 3.1e-15 → "3,1·10<sup>−15</sup>" (decimal comma for the Russian UI; the panel uses innerHTML). */
function exp(x) {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(1).split('e');
  return `${m.replace('.', ',')}·10<sup>${e.replace('-', '−').replace('+', '')}</sup>`;
}

/**
 * @param {import('./geometry.js').Room} room
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage2Checks(room) {
  const { L, W } = room;
  const dL = room.d.L, dW = room.d.W;
  const points = [
    ['центр пола', [L / 2, W / 2, 0]],
    ['у стены', [dL / 2, W / 2, 0]],
    ['в углу', [dL / 2, dW / 2, 0]],
    ['Г-0,8, центр', [L / 2, W / 2, 0.8]],
  ];
  const F = new Float64Array(room.N);
  const out = points.map(([label, x]) => {
    pointToElements(room, x, UP, F);
    let s = 0;
    for (let k = 0; k < F.length; k++) s += F[k];
    const err = Math.abs(s - 1);
    return { name: `ΣF = 1: ${label}`, ok: err <= TOL_SUM, detail: `|ΣF − 1| = ${exp(err)} по ${room.N} элементам` };
  });

  // Coaxial squares: classic table values (side / distance → F)
  const table = [[0.5, 0.0686], [1, 0.1998], [2, 0.4153]];
  let worst = 0, okTable = true;
  for (const [s, Ft] of table) {
    const Fq = coaxialByQuadrature(s);
    worst = Math.max(worst, Math.abs(Fq - coaxialRectangles(s, s, 1)));
    okTable &&= Math.abs(Fq - Ft) <= 5e-5;
  }
  out.push({
    name: 'Соосные квадраты: табличные значения',
    ok: okTable && worst <= 1e-9,
    detail: `0,0686 · 0,1998 · 0,4153; отличие от точной формулы ${exp(worst)}`,
  });
  return out;
}
