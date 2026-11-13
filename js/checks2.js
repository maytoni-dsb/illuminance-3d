// Stage 2 acceptance checks shown on the page (panel "Stage 2 criteria"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/formfactor.test.mjs.
// Check names and details come from the dictionaries (chk.s2.*).

import { t, sci, planeName } from './i18n.js';
import { pointToElements, pointToRect, coaxialRectangles, elementToElement } from './formfactor.js';

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

/** 3.1e-15 → "3.1·10<sup>−15</sup>" with the decimal separator of the language (the panel uses innerHTML). */
const exp = (x) => sci(x, 1);

/**
 * @param {import('./geometry.js').Room} room
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage2Checks(room) {
  const { L, W } = room;
  const dL = room.d.L, dW = room.d.W;
  const points = [
    [t('chk.s2.floorCentre'), [L / 2, W / 2, 0]],
    [t('chk.s2.wall'), [dL / 2, W / 2, 0]],
    [t('chk.s2.corner'), [dL / 2, dW / 2, 0]],
    [t('chk.s2.planeCentre', { plane: planeName(0.8) }), [L / 2, W / 2, 0.8]],
  ];
  const F = new Float64Array(room.N);
  const out = points.map(([label, x]) => {
    pointToElements(room, x, UP, F);
    let s = 0;
    for (let k = 0; k < F.length; k++) s += F[k];
    const err = Math.abs(s - 1);
    return { name: `ΣF = 1: ${label}`, ok: err <= TOL_SUM, detail: t('chk.s2.sumDetail', { err: exp(err), n: room.N }) };
  });

  // Element → element (exact kernel): row sums and reciprocity
  const rowSum = (f, i, j) => {
    let s = 0;
    for (const g of room.faces) for (let b = 0; b < g.nv; b++) for (let a = 0; a < g.nu; a++) s += elementToElement(room, f, i, j, g.id, a, b);
    return s;
  };
  const fl = room.faces[0];
  for (const [label, f, i, j] of [[t('chk.s2.cornerEl'), 0, 0, 0], [t('chk.s2.centreEl'), 0, fl.nu >> 1, fl.nv >> 1]]) {
    const err = Math.abs(rowSum(f, i, j) - 1);
    out.push({ name: `ΣF<sub>ij</sub> = 1: ${label}`, ok: err <= 1e-9, detail: t('chk.s2.rowDetail', { err: exp(err) }) });
  }
  let recip = 0;
  for (const [f1, i1, j1, f2, i2, j2] of [[0, 0, 0, 2, 0, 0], [0, 0, 0, 4, 1, 0], [0, 2, 1, 1, 3, 2], [2, 1, 1, 5, 0, 2]]) {
    const A1 = room.faces[f1].elementArea, A2 = room.faces[f2].elementArea;
    const a = A1 * elementToElement(room, f1, i1, j1, f2, i2, j2), b = A2 * elementToElement(room, f2, i2, j2, f1, i1, j1);
    recip = Math.max(recip, Math.abs(a - b) / Math.max(a, b));
  }
  out.push({ name: t('chk.s2.recip'), ok: recip <= 1e-9, detail: t('chk.s2.worst', { x: exp(recip) }) });

  // Coaxial squares: classic table values (side / distance → F)
  const table = [[0.5, 0.0686], [1, 0.1998], [2, 0.4153]];
  let worst = 0, okTable = true;
  for (const [s, Ft] of table) {
    const Fq = coaxialByQuadrature(s);
    worst = Math.max(worst, Math.abs(Fq - coaxialRectangles(s, s, 1)));
    okTable &&= Math.abs(Fq - Ft) <= 5e-5;
  }
  out.push({
    name: t('chk.s2.coax'),
    ok: okTable && worst <= 1e-9,
    detail: t('chk.s2.coaxDetail', { x: exp(worst) }),
  });
  return out;
}
