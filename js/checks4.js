// Stage 4 acceptance checks shown on the page (panel "Stage 4 criteria"). Pure module, no DOM.
// The same criteria are verified more thoroughly by tests/radiosity.test.mjs (MATLAB comparison
// included). The fourth criterion (exposure does not change with rotation) needs the 3D view and is
// checked by view3d.js. Check names and details come from the dictionaries (chk.s4.*).

import { fromGlobalIndex } from './geometry.js';
import { t, sci, decimal } from './i18n.js';
import { elementToElement } from './formfactor.js';
import { kernelF, rowSums } from './kernel.js';
import { SOLVER_EPS } from './solver.js';

/** 3.1e-15 → "3.1·10<sup>−15</sup>" of |x| with the decimal separator of the language (innerHTML). */
const exp = (x) => (Number.isFinite(x) ? sci(Math.abs(x), 1) : '∞');
const pct = (x) => `${(100 * x).toFixed(2).replace('.', decimal())} %`;
const f1 = (x) => x.toFixed(1).replace('.', decimal());

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
    name: t('chk.s4.kernel'),
    ok: worst <= 1e-9 && rs <= 1e-9,
    detail: t('chk.s4.kernelDetail', { n, x: exp(worst), y: exp(rs), N: room.N }),
  });

  // 2. Energy balance
  const b = res.balance;
  out.push({
    name: t('chk.s4.balance'),
    ok: Math.abs(b.rel) <= 0.005,
    detail: t('chk.s4.balanceDetail', { a: Math.round(b.absorbed), e: Math.round(b.emitted), x: exp(b.rel) }),
  });

  // 3. Sumpner's estimate
  const sp = res.sumpner;
  out.push({
    name: t('chk.s4.sumpner'),
    ok: Math.abs(sp.rel) <= 0.15,
    detail: t('chk.s4.sumpnerDetail', { a: f1(sp.mean), b: f1(sp.estimate), x: Number.isFinite(sp.rel) ? pct(sp.rel) : '—' }),
  });

  // Solver convergence (informational, part of the method)
  out.push({
    name: t('chk.s4.solver'),
    ok: res.converged,
    detail: t('chk.s4.solverDetail', { n: res.iterations, x: exp(res.change), e: exp(SOLVER_EPS) }),
  });
  return out;
}
