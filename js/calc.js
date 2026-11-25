// The whole calculation for one set of inputs: kernel (cached per geometry), direct component,
// solver and the stage checks. Pure module: no DOM and no Three.js; the Web Worker (worker.js)
// runs it in the browser, the tests run it in Node.
// Spec, section "Calculation method", item 5 (recalculation):
//   room size or step changed  → kernel, then E_dir and the solver;
//   luminaires or ρ changed    → E_dir (if the luminaires changed) and the solver only.
// The maintenance factor is not an input here: results are initial values E₀, MF is applied by
// the page (E = MF · E₀), so changing MF needs no recalculation.

import { createRoom, autoStep, rectOutline, outlineRect } from './geometry.js';
import { buildKernel } from './kernel.js';
import { solve, coarseData, energyBalance, sumpner, SOLVER_EPS } from './solver.js';
import { createPhotometry, luminaireGrid } from './photometry.js';
import { elementDirect, emittedFlux, faceFlux, isTilted, lumMatrix } from './direct.js';
import { mixChecks } from './checksmix.js';
import { pointInOutline } from './groups.js';
import { stage3Checks } from './checks3.js';
import { stage4Checks } from './checks4.js';
import { stage5Checks } from './checks5.js';
import { planeHeights, planeTables, planeReflected, planeDirect, cellStats, planeField } from './workplane.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Calculation inputs of version 2 (spec v2, "Data model"): the room outline, its height and ρ,
 * the luminaire types and the list of instances (stage 2.1: any number of types; the direct
 * component is calculated per type and summed, a type without instances is skipped).
 *   CalcParams = { outline: [x, y][] (rectangle until stage 2.3, geometry.outlineRect), H,
 *                  rho: number[6] (faces 0…5), hwp?: number (height of the normative work plane, m),
 *                  types: [{ id, phot: 'cosine' | 'directIndirect' | 'file', flux, fUp?,
 *                            table?: PhotTable (photfile.js; phot = 'file'), fileKey?: string }],
 *                  lums: [{ type, pos: [x, y, z] (photometric centre, m), psi (rad), tx?, ty? (tilt, rad, 2.1a) }],
 *                  checks?: boolean }
 * With a file the flux comes from the table (the flux of its interpolant), `flux` is ignored.
 *
 * Version 1 inputs { L, W, H, nx, ny, flux, hc, psi, phot, fUp, table, fileKey, rho, hwp, checks }
 * are still accepted and turned into the same instances (normalizeParams): the grid is generated
 * by the same code, so both give identical results.
 */
export function normalizeParams(p) {
  if (Array.isArray(p.lums)) return p;
  const lums = luminaireGrid({ L: p.L, W: p.W, H: p.H, nx: p.nx, ny: p.ny, hc: p.hc, psi: p.psi });
  return {
    outline: rectOutline(p.L, p.W), H: p.H, rho: p.rho, hwp: p.hwp, checks: p.checks,
    types: [{ id: 't1', phot: p.phot, flux: p.flux, fUp: p.fUp, table: p.table, fileKey: p.fileKey }],
    lums: lums.map((l) => ({ type: 't1', pos: l.pos, psi: l.psi })),
  };
}

/** Key of the luminaire set of one type: the type's photometry and every instance. */
function lumsKey(type, lums) {
  const isFile = type.phot === 'file';
  const head = [type.phot, isFile ? type.fileKey : type.flux, type.phot === 'directIndirect' ? type.fUp : 0].join('|');
  let s = head;
  for (const l of lums) s += `;${l.pos[0]},${l.pos[1]},${l.pos[2]},${l.psi}` + (l.tx || l.ty ? `,${l.tx || 0},${l.ty || 0}` : '');
  return s;
}

/** Flux a set of luminaires of one type sends into the room (direct.emittedFlux per height). */
function setEmitted(src, H) {
  const count = new Map();
  let e = 0;
  for (const l of src.lums) {
    if (isTilted(l)) { e += emittedFlux(src.phot, l.pos[2], H, l); continue; }
    count.set(l.pos[2], (count.get(l.pos[2]) ?? 0) + 1);
  }
  for (const [z, n] of count) e += n * emittedFlux(src.phot, z, H);
  return e;
}

/**
 * Creates a calculator that keeps the kernel, the direct component and the last solution between
 * calls, so that only what changed is recomputed.
 * @returns {{ run: (p: CalcParams) => CalcResult, plan: (z: number) => object }}
 *
 * CalcResult = { key, N, h, Edir, Eind (Float64Array, E₀, lx), iterations, converged, change,
 *                balance, sumpner, ms: { kernel, coarse, direct, solve, checks }, reused: {…},
 *                lums, planes, flux (of one luminaire), lost, checks3?, checks4?, checks5? }
 */
export function createCalc() {
  let geo = null;   // { key, room, kernel }
  let dir = null;   // { key, sources: [{ key, id, lums, phot, Edir, planes }], Edir, stats }
  let sol = null;   // { key, Eind }
  let tables = new Map(); // plane height → cell → element factor tables of the current room
  let planCache = new Map(); // plane height → { vt, gost }: point factor tables of the plans
  let parts = new Map();     // key of a type's set → { lums, phot, Edir, stats, planes } of the current room
  let last = null;           // { room, sources, M } of the last run, for the plans

  function run(params) {
    const p = normalizeParams(params);
    const ms = { kernel: 0, coarse: 0, direct: 0, solve: 0, planes: 0, checks: 0 };
    const reused = { kernel: true, direct: true };
    // a room without luminaires (21 Nov 2026) is calculated in the dark
    if (!Array.isArray(p.types)) throw new RangeError('calc: no luminaire types');
    const byType = new Map(p.types.map((ty) => [ty.id, []]));
    if (byType.size !== p.types.length) throw new RangeError('calc: two luminaire types with the same id');
    for (const l of p.lums) {
      const list = byType.get(l.type);
      if (!list) throw new RangeError(`calc: a luminaire of an unknown type ${l.type}`);
      list.push(l);
    }
    // the sets of the types that have luminaires, in the order of the types
    const sets = p.types.filter((ty) => byType.get(ty.id).length).map((ty) => ({ type: ty, lums: byType.get(ty.id) }));
    const { L, W } = outlineRect(p.outline);
    const H = p.H;

    const geoKey = `${L}|${W}|${H}`;
    if (!geo || geo.key !== geoKey) {
      const room = createRoom({ L, W, H, h: autoStep(L, W, H) });
      let t = now();
      const kernel = buildKernel(room);
      ms.kernel = now() - t;
      t = now();
      coarseData(kernel);
      ms.coarse = now() - t;
      geo = { key: geoKey, room, kernel };
      dir = null; sol = null; tables = new Map(); planCache = new Map(); parts = new Map();
      reused.kernel = false;
    }
    const { room, kernel } = geo;

    // direct component per type: a type whose set did not change keeps its part
    const dirKey = sets.map((st) => `${st.type.id}/${st.type.label ?? ''}:${lumsKey(st.type, st.lums)}`).join('#');
    if (!dir || dir.key !== dirKey) {
      const t = now();
      const next = new Map();
      const sources = sets.map((st) => {
        const key = lumsKey(st.type, st.lums);
        let part = parts.get(key) ?? next.get(key);
        if (!part) {
          const ty = st.type;
          const phot = createPhotometry({ type: ty.phot, flux: ty.flux, fUp: ty.fUp, table: ty.table });
          const lums = st.lums.map((l) => Object.freeze(isTilted(l)
            ? { pos: Object.freeze([l.pos[0], l.pos[1], l.pos[2]]), psi: l.psi, tx: l.tx || 0, ty: l.ty || 0, R: Object.freeze(lumMatrix(l)) }
            : { pos: Object.freeze([l.pos[0], l.pos[1], l.pos[2]]), psi: l.psi }));
          for (const l of lums) {
            if (!(l.pos[2] > 0 && l.pos[2] <= H)) throw new RangeError(`calc: a luminaire at z = ${l.pos[2]} is outside (0, H]`);
            if (!pointInOutline(p.outline, l.pos[0], l.pos[1])) throw new RangeError(`calc: a luminaire at (${l.pos[0]}, ${l.pos[1]}) is outside the room`);
          }
          const E = elementDirect(room, lums, phot);
          part = { lums, phot, Edir: E, stats: E.stats ?? null, planes: new Map() };
          reused.direct = false;
        }
        next.set(key, part);
        return { key, id: st.type.id, label: st.type.label, type: st.type, ...part, part };
      });
      parts = next;
      // one type: its array as it is (results of version 1 bit for bit); several: the sum
      // no luminaires (an empty room, stage 2.1): no light anywhere
      let Edir = sources.length ? sources[0].Edir : new Float64Array(room.N);
      if (sources.length > 1) {
        Edir = new Float64Array(room.N);
        for (const src of sources) for (let k = 0; k < room.N; k++) Edir[k] += src.Edir[k];
      }
      const st = sources.map((src) => src.stats).filter(Boolean);
      const stats = st.length ? { ...st[0], evals: st.reduce((a, x) => a + x.evals, 0), retries: st.reduce((a, x) => a + x.retries, 0), integrated: st.reduce((a, x) => a + x.integrated, 0), luminaires: st.reduce((a, x) => a + x.luminaires, 0), perLum: st.flatMap((x) => x.perLum) } : null;
      ms.direct = now() - t;
      dir = { key: dirKey, sources, Edir, stats };
    }
    const { sources, Edir } = dir;
    const lums = sources.flatMap((src) => src.lums);

    // Warm start from the previous solution of the same room: a small change converges in a few sweeps.
    const s = solve(kernel, Edir, p.rho, { eps: SOLVER_EPS, Eind: sol?.Eind });
    ms.solve = s.ms;
    sol = { key: `${dirKey}|${p.rho.join('|')}`, Eind: s.Eind };

    // a luminaire in the ceiling plane (h_c = 0) cannot light upwards: its upward flux is lost
    const typeFlux = sources.map((src) => ({ id: src.id, label: src.label, count: src.lums.length, flux: src.phot.flux, emitted: setEmitted(src, H), onFaces: faceFlux(room, src.Edir).total, file: !src.phot.lobes }));
    let emitted = 0, lost = 0;
    for (const tf of typeFlux) { emitted += tf.emitted; lost += tf.count * tf.flux - tf.emitted; }
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
    const planes = planeHeights(p.hwp ?? 0.8).map(({ z, normative }) => {
      const zk = z.toFixed(6);
      if (!tables.has(zk)) tables.set(zk, planeTables(room, z));
      for (const src of sources) if (!src.planes.has(zk)) src.planes.set(zk, planeDirect(room, z, src.lums, src.phot));
      let Ed = sources.length ? sources[0].planes.get(zk) : null;
      if (!sources.length) Ed = planeDirect(room, z, [], null);
      if (sources.length > 1) {
        Ed = new Float64Array(Ed.length);
        for (const src of sources) { const e = src.planes.get(zk); for (let k = 0; k < Ed.length; k++) Ed[k] += e[k]; }
      }
      const Er = planeReflected(room, tables.get(zk), M);
      const E = new Float64Array(Ed.length);
      for (let k = 0; k < E.length; k++) E[k] = Ed[k] + Er[k];
      // the field of the plan (point values): its extremes are E_min and E_max of the plane
      if (!planCache.has(zk)) planCache.set(zk, {});
      const field = planeField(room, z, sources, M, planCache.get(zk), dirKey);
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
    last = { room, sources, M, key: `${sol.key}`, dirKey };

    const out = {
      key: geoKey, N: room.N, h: room.h, rho: [...p.rho],
      Edir: Float64Array.from(Edir), Eind: Float64Array.from(s.Eind),
      iterations: s.iterations, converged: s.converged, change: s.change,
      balance, sumpner: sp, ms, reused,
      lums: sources.flatMap((src) => src.lums.map((l) => (isTilted(l) ? { type: src.id, pos: [...l.pos], psi: l.psi, tx: l.tx, ty: l.ty } : { type: src.id, pos: [...l.pos], psi: l.psi }))),
      planes, flux: sources.length ? sources[0].phot.flux : 0, lost, types: typeFlux, directStats: dir.stats,
      fileKey: sources.length === 1 && sources[0].type.phot === 'file' ? sources[0].type.fileKey : null,
    };
    if (p.checks !== false) {
      const t = now();
      // one type at one height and rotation (a grid of version 1): the stage 3 and 5 checks of
      // version 1; otherwise the flux of every type and of all of them (stage 2.1 criterion)
      const one = sources.length === 1 ? sources[0] : null;
      const uniform = one && one.lums.every((l) => l.pos[2] === one.lums[0].pos[2] && l.psi === one.lums[0].psi && !isTilted(l));
      if (uniform) {
        out.checks3 = stage3Checks(room, one.lums, one.phot, Edir, { hc: H - one.lums[0].pos[2], psi: one.lums[0].psi });
        if (one.type.phot === 'file') out.checks5 = stage5Checks(room, one.lums, one.phot, Edir, one.type.table);
      } else {
        out.checks3 = mixChecks(room, typeFlux, Edir);
        // the file checks of every type with a file, its letter before the name (decided on 20 Nov 2026)
        const files = sources.filter((src) => src.type.phot === 'file');
        if (files.length) {
          out.checks5 = files.flatMap((src) => stage5Checks(room, src.lums, src.phot, src.Edir, src.type.table)
            .map((c) => ({ ...c, name: `${src.label ?? src.id}: ${c.name}` })));
        }
      }
      out.checks4 = stage4Checks(kernel, { iterations: s.iterations, converged: s.converged, change: s.change, balance, sumpner: sp });
      ms.checks = now() - t;
    }
    return out;
  }

  /**
   * Field of the plan of the plane at height z for the last run (workplane.planeField): values at
   * the nodes of the auxiliary grid and at the GOST points, E₀. Spec, "Plans of the planes 0.0 and 0.8".
   */
  function plan(z) {
    if (!last) throw new Error('plan: no calculation yet');
    const zk = z.toFixed(6);
    if (!planCache.has(zk)) planCache.set(zk, {});
    const f = planeField(last.room, z, last.sources, last.M, planCache.get(zk), last.dirKey);
    return { ...f, key: last.key, roomKey: geo.key };
  }

  return { run, plan };
}
