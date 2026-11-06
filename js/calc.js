// The whole calculation for one set of inputs: kernel (cached per geometry), direct component,
// solver and the stage checks. Pure module: no DOM and no Three.js; the Web Worker (worker.js)
// runs it in the browser, the tests run it in Node.
// Spec, section "Метод расчета", item 5 (recalculation):
//   room size or step changed  → kernel, then E_dir and the solver;
//   luminaires or ρ changed    → E_dir (if the luminaires changed) and the solver only.
// The maintenance factor is not an input here: results are initial values E₀, MF is applied by
// the page (E = MF · E₀), so changing MF needs no recalculation.

import { createRoom, autoStep } from './geometry.js';
import { buildKernel } from './kernel.js';
import { solve, coarseData, energyBalance, sumpner, SOLVER_EPS } from './solver.js';
import { createPhotometry, luminaireGrid } from './photometry.js';
import { elementDirect, emittedFlux } from './direct.js';
import { stage3Checks } from './checks3.js';
import { stage4Checks } from './checks4.js';
import { stage5Checks } from './checks5.js';
import { planeHeights, planeTables, planeReflected, planeDirect, cellStats, planeField } from './workplane.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Creates a calculator that keeps the kernel, the direct component and the last solution between
 * calls, so that only what changed is recomputed.
 * @returns {{ run: (p: CalcParams) => CalcResult }}
 *
 * CalcParams = { L, W, H, nx, ny, flux, hc, psi (rad), phot: 'cosine' | 'directIndirect' | 'file', fUp,
 *                table?: PhotTable (photfile.js; phot = 'file'), fileKey?: string (identifies the table),
 *                rho: number[6] (faces 0…5), hwp?: number (height of the normative work plane, m),
 *                checks?: boolean }
 * With a file the flux comes from the table (the flux of its interpolant), `flux` is ignored.
 * CalcResult = { key, N, h, Edir, Eind (Float64Array, E₀, lx), iterations, converged, change,
 *                balance, sumpner, ms: { kernel, coarse, direct, solve, checks }, reused: {…},
 *                checks3?, checks4? }
 */
export function createCalc() {
  let geo = null;   // { key, room, kernel }
  let dir = null;   // { key, lums, phot, Edir }
  let sol = null;   // { key, Eind }
  let tables = new Map(); // plane height → cell → element factor tables of the current room
  let planCache = new Map(); // plane height → { vt, gost }: point factor tables of the plans
  let last = null;           // { room, lums, phot, M } of the last run, for the plans

  function run(p) {
    const ms = { kernel: 0, coarse: 0, direct: 0, solve: 0, planes: 0, checks: 0 };
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
      dir = null; sol = null; tables = new Map(); planCache = new Map();
      reused.kernel = false;
    }
    const { room, kernel } = geo;

    const isFile = p.phot === 'file';
    const dirKey = [p.nx, p.ny, p.flux, p.hc, p.psi, p.phot, p.phot === 'directIndirect' ? p.fUp : 0, isFile ? p.fileKey : ''].join('|');
    if (!dir || dir.key !== dirKey) {
      const phot = createPhotometry({ type: p.phot, flux: p.flux, fUp: p.fUp, table: p.table });
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

    // a luminaire in the ceiling plane (h_c = 0) cannot light upwards: its upward flux is lost
    const emitted = lums.length * emittedFlux(phot, lums[0].pos[2], p.H);
    const lost = lums.length * phot.flux - emitted;
    const balance = energyBalance(room, Edir, s.Eind, p.rho, emitted);
    const sp = sumpner(room, Edir, s.Eind, p.rho);

    // work planes: direct light at the points and reflected light from all elements
    const t0 = now();
    const M = new Float64Array(room.N);
    for (const face of room.faces) {
      const r = p.rho[face.id];
      for (let k = face.offset; k < face.offset + face.count; k++) M[k] = r * (Edir[k] + s.Eind[k]);
    }
    // planes: cells of the floor mesh, cell averages (workplane.js); the direct part is kept per
    // luminaire set and plane height together with the direct component of the faces
    if (!dir.planes) dir.planes = new Map();
    const planes = planeHeights(p.hwp ?? 0.8).map(({ z, normative }) => {
      const zk = z.toFixed(6);
      if (!tables.has(zk)) tables.set(zk, planeTables(room, z));
      if (!dir.planes.has(zk)) dir.planes.set(zk, planeDirect(room, z, lums, phot));
      const Ed = dir.planes.get(zk);
      const Er = planeReflected(room, tables.get(zk), M);
      const E = new Float64Array(Ed.length);
      for (let k = 0; k < E.length; k++) E[k] = Ed[k] + Er[k];
      // the field of the plan (point values): its extremes are E_min and E_max of the plane
      if (!planCache.has(zk)) planCache.set(zk, {});
      const field = planeField(room, z, lums, phot, M, planCache.get(zk), dirKey);
      const cells = cellStats(E);
      const ex = field.extremes;
      const stats = {
        avg: cells.avg, min: ex.min, max: ex.max, u0: cells.avg > 0 ? ex.min / cells.avg : 0,
        minMax: ex.max > 0 ? ex.min / ex.max : 0, minAt: ex.minAt, maxAt: ex.maxAt,
        cellMin: cells.min, cellMax: cells.max,
      };
      return { z, normative, nx: room.n.L, ny: room.n.W, E, Edir: Float64Array.from(Ed), Eref: Er, stats, field };
    });
    ms.planes = now() - t0;
    last = { room, lums, phot, M, key: `${sol.key}`, dirKey };

    const out = {
      key: geoKey, N: room.N, h: room.h, rho: [...p.rho],
      Edir: Float64Array.from(Edir), Eind: Float64Array.from(s.Eind),
      iterations: s.iterations, converged: s.converged, change: s.change,
      balance, sumpner: sp, ms, reused, lums: lums.map((l) => ({ pos: [...l.pos], psi: l.psi })),
      planes, flux: phot.flux, lost, directStats: Edir.stats ?? null, fileKey: isFile ? p.fileKey : null,
    };
    if (p.checks !== false) {
      const t = now();
      out.checks3 = stage3Checks(room, lums, phot, Edir, { hc: p.hc, psi: p.psi });
      if (isFile) out.checks5 = stage5Checks(room, lums, phot, Edir, p.table);
      out.checks4 = stage4Checks(kernel, { iterations: s.iterations, converged: s.converged, change: s.change, balance, sumpner: sp });
      ms.checks = now() - t;
    }
    return out;
  }

  /**
   * Field of the plan of the plane at height z for the last run (workplane.planeField): values at
   * the nodes of the auxiliary grid and at the GOST points, E₀. Spec, "Планы Г-0,0 и Г-0,8".
   */
  function plan(z) {
    if (!last) throw new Error('plan: no calculation yet');
    const zk = z.toFixed(6);
    if (!planCache.has(zk)) planCache.set(zk, {});
    const f = planeField(last.room, z, last.lums, last.phot, last.M, planCache.get(zk), last.dirKey);
    return { ...f, key: last.key, roomKey: geo.key };
  }

  return { run, plan };
}
