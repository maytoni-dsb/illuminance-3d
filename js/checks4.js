// Stage 4 acceptance checks shown on the page ("Критерии этапа 4"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/radiosity.test.mjs (MATLAB comparison
// included). The fourth criterion (exposure does not change with rotation) needs the 3D view and is
// checked by view3d.js. Check names and details are user-facing and therefore in Russian.

import { fromGlobalIndex } from './geometry.js';
import { elementToElement } from './formfactor.js';
import { kernelF, rowSums } from './kernel.js';
import { SOLVER_EPS } from './solver.js';

/** 3.1e-15 → "3,1·10<sup>−15</sup>" (decimal comma for the Russian UI; the panel uses innerHTML). */
function exp(x) {
  if (x === 0) return '0';
  if (!Number.isFinite(x)) return '∞';
  const [m, e] = Math.abs(x).toExponential(1).split('e');
  return `${m.replace('.', ',')}·10<sup>${e.replace('-', '−').replace('+', '')}</sup>`;
}
const pct = (x) => `${(100 * x).toFixed(2).replace('.', ',')} %`;

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32), so the panel is reproducible. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {import('./kernel.js').Kernel} kernel — kernel of the current room
 * @param {{ iterations, converged, change, balance, sumpner }} res — solver results (solver.js)
 * @param {number} [pairs] — number of random element pairs to compare
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage4Checks(kernel, res, pairs = 300) {
  const { room } = kernel;
  const out = [];

  // 1. Kernel against the direct element → element factor for random pairs; row sums
  const rand = rng(2026);
  let worst = 0, n = 0;
  for (let t = 0; t < pairs; t++) {
    const a = Math.floor(rand() * room.N), b = Math.floor(rand() * room.N);
    const x = fromGlobalIndex(room, a), y = fromGlobalIndex(room, b);
    const ref = elementToElement(room, x.f, x.i, x.j, y.f, y.i, y.j);
    const v = kernelF(kernel, a, b);
    if (ref === 0) { if (v !== 0) worst = Infinity; continue; }
    worst = Math.max(worst, Math.abs(v - ref) / ref);
    n++;
  }
  let rs = 0;
  for (const s of rowSums(kernel)) rs = Math.max(rs, Math.abs(s - 1));
  out.push({
    name: 'Ядро совпадает с прямым расчетом F',
    ok: worst <= 1e-9 && rs <= 1e-9,
    detail: `${n} случайных пар разных граней: наибольшее относительное отличие ${exp(worst)}; max |ΣF<sub>ij</sub> − 1| = ${exp(rs)} при N = ${room.N}`,
  });

  // 2. Energy balance
  const b = res.balance;
  out.push({
    name: 'Энергобаланс в пределах 0,5 %',
    ok: Math.abs(b.rel) <= 0.005,
    detail: `поглощено Σ(1 − ρ)·E·A = ${Math.round(b.absorbed)} лм, поток светильников ${Math.round(b.emitted)} лм, отличие ${exp(b.rel)}`,
  });

  // 3. Sumpner's estimate
  const sp = res.sumpner;
  out.push({
    name: 'Отраженная освещенность близка к оценке Сампнера',
    ok: Math.abs(sp.rel) <= 0.15,
    detail: `средняя по граням ${sp.mean.toFixed(1).replace('.', ',')} лк, оценка Φ₁ / (A·(1 − ρ<sub>ср</sub>)) = ${sp.estimate.toFixed(1).replace('.', ',')} лк, отличие ${Number.isFinite(sp.rel) ? pct(sp.rel) : '—'} (допуск 15 %)`,
  });

  // Solver convergence (informational, part of the method)
  out.push({
    name: 'Решатель сошелся',
    ok: res.converged,
    detail: `${res.iterations} итер. Гаусса–Зейделя с поправкой по граням; последнее изменение ${exp(res.change)} &lt; ε = ${exp(SOLVER_EPS)}`,
  });
  return out;
}
