// The whole calculation for one set of inputs: kernel (cached per geometry), direct component,
// solver and the stage checks. Pure module: no DOM and no Three.js; the Web Worker (worker.js)
// runs it in the browser, the tests run it in Node.
// Spec, section "Метод расчёта", item 5 (recalculation):
//   room size or step changed  → kernel, then E_dir and the solver;
//   luminaires or ρ changed    → E_dir (if the luminaires changed) and the solver only.
// The maintenance factor is not an input here: results are initial values E₀, MF is applied by
// the page (E = MF · E₀), so changing MF needs no recalculation.

import { createRoom, autoStep } from './geometry.js';
import { buildKernel } from './kernel.js';
import { solve, coarseData, energyBalance, sumpner, SOLVER_EPS } from './solver.js';
import { createPhotometry, luminaireGrid } from './photometry.js';
import { elementDirect } from './direct.js';
import { stage3Checks } from './checks3.js';
import { stage4Checks } from './checks4.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Creates a calculator that keeps the kernel, the direct component and the last solution between
 * calls, so that only what changed is recomputed.
 * @returns {{ run: (p: CalcParams) => CalcResult }}
 *
 * CalcParams = { L, W, H, nx, ny, flux, hc, psi (rad), phot: 'cosine' | 'directIndirect', fUp,
 *                rho: number[6] (faces 0…5), checks?: boolean }
 * CalcResult = { key, N, h, Edir, Eind (Float64Array, E₀, lx), iterations, converged, change,
 *                balance, sumpner, ms: { kernel, coarse, direct, solve, checks }, reused: {…},
 *                checks3?, checks4? }
 */
export function createCalc() {
  let geo = null;   // { key, room, kernel }
  let dir = null;   // { key, lums, phot, Edir }
  let sol = null;   // { key, Eind }

  function run(p) {
    const ms = { kernel: 0, coarse: 0, direct: 0, solve: 0, checks: 0 };
    const reused = { kernel: true, direct: true };

    const geoKey = `${p.L}|${p.W}|${p.H}`;
    if (!geo || geo.key !== geoKey) {
      const room = createRoom({ L: p.L, W: p.W, H: p.H, h: autoStep(p.L, p.W, p.H) });
      let t = now();
      const kernel = buildKernel(room);
      ms.kernel = now() - t;
      t = now();
      coarseData(kernel);
      ms.coarse = now() - t;
      geo = { key: geoKey, room, kernel };
      dir = null; sol = null;
      reused.kernel = false;
    }
    const { room, kernel } = geo;

    const dirKey = [p.nx, p.ny, p.flux, p.hc, p.psi, p.phot, p.phot === 'directIndirect' ? p.fUp : 0].join('|');
    if (!dir || dir.key !== dirKey) {
      const phot = createPhotometry({ type: p.phot, flux: p.flux, fUp: p.fUp });
      const lums = luminaireGrid({ L: p.L, W: p.W, H: p.H, nx: p.nx, ny: p.ny, hc: p.hc, psi: p.psi });
      const t = now();
      const Edir = elementDirect(room, lums, phot);
      ms.direct = now() - t;
      dir = { key: dirKey, lums, phot, Edir };
      reused.direct = false;
    }
    const { lums, phot, Edir } = dir;

    // Warm start from the previous solution of the same room: a small change converges in a few sweeps.
    const s = solve(kernel, Edir, p.rho, { eps: SOLVER_EPS, Eind: sol?.Eind });
    ms.solve = s.ms;
    sol = { key: `${dirKey}|${p.rho.join('|')}`, Eind: s.Eind };

    const emitted = lums.length * phot.flux;
    const balance = energyBalance(room, Edir, s.Eind, p.rho, emitted);
    const sp = sumpner(room, Edir, s.Eind, p.rho);

    const out = {
      key: geoKey, N: room.N, h: room.h, rho: [...p.rho],
      Edir: Float64Array.from(Edir), Eind: Float64Array.from(s.Eind),
      iterations: s.iterations, converged: s.converged, change: s.change,
      balance, sumpner: sp, ms, reused, lums: lums.map((l) => ({ pos: [...l.pos], psi: l.psi })),
    };
    if (p.checks !== false) {
      const t = now();
      out.checks3 = stage3Checks(room, lums, phot, Edir, { hc: p.hc, psi: p.psi });
      out.checks4 = stage4Checks(kernel, { iterations: s.iterations, converged: s.converged, change: s.change, balance, sumpner: sp });
      ms.checks = now() - t;
    }
    return out;
  }

  return { run };
}
