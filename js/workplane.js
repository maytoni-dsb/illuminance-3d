// Horizontal work planes: calculation grid, illuminance at the grid points and the indices
// Ē, E_min, E_max, U₀ = E_min / Ē. Pure module: no DOM and no Three.js.
// Spec, section "Результаты и рабочая плоскость":
//   - the planes are transparent and take no part in the radiosity; at a point x of a plane
//     (normal up) the illuminance is gathered from the luminaires and from every face element:
//       E(x) = E_dir(x) + Σ_j F(dx → A_j) · M_j ,   M_j = ρ_j (E_dir,j + E_ind,j)
//     with the exact point → rectangle factor (horizon clipping included);
//   - the grid covers the whole plane without a margin, GOST R 55710 / EN 12464-1:
//     p = 0.2 · 5^lg d (d — the larger room size), the number of points rounded up, points at the
//     centres of the cells.
// All values are initial values E₀ (no maintenance factor).

import { pointToElements } from './formfactor.js';
import { directAtPoint } from './direct.js';

/** Step of the calculation grid for a room whose larger size is d, m. */
export const gridStep = (d) => 0.2 * 5 ** Math.log10(d);

/**
 * Calculation grid of a horizontal plane at height z.
 * @returns {{ nx:number, ny:number, dx:number, dy:number, z:number, pts:Float64Array }}
 *   pts = x, y, z of point (i, j) at 3·(i + j·nx); i along X
 */
export function workGrid(L, W, z) {
  const p = gridStep(Math.max(L, W));
  const nx = Math.max(1, Math.ceil(L / p - 1e-9)), ny = Math.max(1, Math.ceil(W / p - 1e-9));
  const dx = L / nx, dy = W / ny;
  const pts = new Float64Array(3 * nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = 3 * (i + j * nx);
    pts[k] = (i + 0.5) * dx; pts[k + 1] = (j + 0.5) * dy; pts[k + 2] = z;
  }
  return { nx, ny, dx, dy, z, pts };
}

/**
 * Form factors from every grid point (normal up) to every element: a row of N per point.
 * Depends only on the room and the plane height, so the calculation keeps it.
 * @returns {Float64Array} nPoints × N
 */
export function gridFormFactors(room, grid) {
  const n = grid.pts.length / 3;
  const F = new Float64Array(n * room.N);
  const x = [0, 0, 0], up = [0, 0, 1];
  for (let k = 0; k < n; k++) {
    x[0] = grid.pts[3 * k]; x[1] = grid.pts[3 * k + 1]; x[2] = grid.pts[3 * k + 2];
    pointToElements(room, x, up, F.subarray(k * room.N, (k + 1) * room.N));
  }
  return F;
}

/**
 * Illuminance at the grid points: direct and reflected.
 * @param {Float64Array} F — gridFormFactors(room, grid)
 * @param {Float64Array} M — exitance of the elements ρ (E_dir + E_ind), lm/m²
 * @returns {{ Edir: Float64Array, Eref: Float64Array, E: Float64Array }}
 */
export function planeIlluminance(room, grid, F, M, lums, phot) {
  const n = grid.pts.length / 3, N = room.N;
  const Edir = new Float64Array(n), Eref = new Float64Array(n), E = new Float64Array(n);
  const x = [0, 0, 0], up = [0, 0, 1];
  for (let k = 0; k < n; k++) {
    x[0] = grid.pts[3 * k]; x[1] = grid.pts[3 * k + 1]; x[2] = grid.pts[3 * k + 2];
    Edir[k] = directAtPoint(x, up, lums, phot);
    let s = 0;
    const o = k * N;
    for (let j = 0; j < N; j++) s += F[o + j] * M[j];
    Eref[k] = s;
    E[k] = Edir[k] + s;
  }
  return { Edir, Eref, E };
}

/** Ē, E_min, E_max and U₀ = E_min / Ē (equal cells, so Ē is the plain mean). */
export function planeStats(E) {
  let s = 0, min = Infinity, max = -Infinity;
  for (const v of E) { s += v; if (v < min) min = v; if (v > max) max = v; }
  const avg = s / E.length;
  return { avg, min, max, u0: avg > 0 ? min / avg : 0 };
}

/**
 * Heights of the planes to show: 0.0 and 0.8 m always, and h when it differs from both;
 * the plane at h is the normative one.
 * @returns {{ z:number, normative:boolean }[]}
 */
export function planeHeights(h) {
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  const list = [{ z: 0, normative: same(h, 0) }, { z: 0.8, normative: same(h, 0.8) }];
  if (!same(h, 0) && !same(h, 0.8)) list.push({ z: h, normative: true });
  return list;
}

/**
 * The scale of illuminance levels (SP 52.13330.2016, GOST R 55710), lx. A result is "within the
 * step" of the required level E_n when E_n ≤ Ē < the next level of the scale.
 */
export const ILLUMINANCE_SCALE = Object.freeze([0.2, 0.3, 0.5, 1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 30, 50, 75, 100, 150,
  200, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]);

/**
 * Status of a maintained mean illuminance against the required one.
 * @returns {'low'|'ok'|'high'} low — Ē < E_n; ok — E_n ≤ Ē < next level of the scale; high — above
 */
export function levelStatus(avg, required) {
  if (avg < required) return 'low';
  const next = ILLUMINANCE_SCALE.find((v) => v > required + 1e-9);
  return next === undefined || avg < next ? 'ok' : 'high';
}

/** Minimum uniformity U₀ (spec): below it the result is flagged. */
export const U0_MIN = 0.3;

// ---------------------------------------------------------------------------------------------
// Plane indices on the element mesh (accepted 5 Nov 2026).
// The plane at height z is divided into cells exactly like the floor (n_L × n_W, the same Δ_L, Δ_W),
// and every cell gets its AREA-AVERAGE illuminance, the same quantity as the face elements:
//   direct    — the exact cosine-lobe formula or the adaptive cubature (direct.js), cell by cell;
//   reflected — E_k = Σ_j F(cell k → element j) · M_j with exact rectangle → rectangle factors.
// Hence Ē is the exact area mean, the plane at z = 0 is the floor itself (Ē, E_min, E_max equal the
// floor elements' mean, minimum and maximum), and E_min / E_max are the extremes of the map that the
// view shows. The cell → element factors depend only on relative positions (the same mesh), so,
// like the kernel, they are kept in small tables:
//   ceiling:       C[|Δi| + |Δj|·n_L]                              n_L · n_W values
//   walls y = 0/W: Y[(|Δi|·n_W + d)·n_H + r]   d — cell row distance from the wall, r — wall row
//   walls x = 0/L: X[(|Δj|·n_L + d)·n_H + r]   d — cell column distance from the wall
// Wall rows are clipped at the plane: only the part above z lights the upper side of the plane;
// floor elements are below or in it and give nothing.

import { axisRect, rectToRect, pointToRect } from './formfactor.js';
import { elementDirectAdaptive, elementDirectExact, mirrorSymmetry, luminaireOrbits, addOrbit } from './direct.js';

/** A face-like description of the plane at height z, on the floor mesh (for direct.js). */
export function planeFace(room, z) {
  const f = room.faces[0];
  return {
    id: 0, name: 'plane', normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], origin: [0, 0, z],
    nu: f.nu, nv: f.nv, du: f.du, dv: f.dv, sizeU: f.sizeU, sizeV: f.sizeV,
    elementArea: f.elementArea, area: f.area, offset: 0, count: f.count,
  };
}

/** Cell → element factor tables of the plane at height z (depend on the room and z only). */
export function planeTables(room, z) {
  const { L, W, H } = room;
  const nL = room.n.L, nW = room.n.W, nH = room.n.H, dL = room.d.L, dW = room.d.W, dH = room.d.H;
  const up = [0, 0, 1];
  const cell = (i, j) => axisRect(up, [i * dL, j * dW, z], [(i + 1) * dL, (j + 1) * dW, z]);
  const rowLo = (r) => Math.max(r * dH, z), rowHi = (r) => (r + 1) * dH;
  // ceiling: cell (0, 0) to ceiling element (di, dj)
  const C = new Float64Array(nL * nW);
  if (H - z > 1e-12) {
    const c0 = cell(0, 0);
    for (let dj = 0; dj < nW; dj++) for (let di = 0; di < nL; di++) {
      C[di + dj * nL] = rectToRect(c0, axisRect([0, 0, -1], [di * dL, dj * dW, H], [(di + 1) * dL, (dj + 1) * dW, H]));
    }
  }
  // wall y = 0: cell (0, d) to wall element (di, r)
  const Y = new Float64Array(nL * nW * nH);
  for (let d = 0; d < nW; d++) {
    const c = cell(0, d);
    for (let di = 0; di < nL; di++) for (let r = 0; r < nH; r++) {
      if (rowHi(r) - rowLo(r) <= 1e-12) continue;
      Y[(di * nW + d) * nH + r] = rectToRect(c, axisRect([0, 1, 0], [di * dL, 0, rowLo(r)], [(di + 1) * dL, 0, rowHi(r)]));
    }
  }
  // wall x = 0: cell (d, 0) to wall element (dj, r)
  const X = new Float64Array(nW * nL * nH);
  for (let d = 0; d < nL; d++) {
    const c = cell(d, 0);
    for (let dj = 0; dj < nW; dj++) for (let r = 0; r < nH; r++) {
      if (rowHi(r) - rowLo(r) <= 1e-12) continue;
      X[(dj * nL + d) * nH + r] = rectToRect(c, axisRect([1, 0, 0], [0, dj * dW, rowLo(r)], [0, (dj + 1) * dW, rowHi(r)]));
    }
  }
  return { z, C, Y, X, nL, nW, nH, L, W };
}

/**
 * Reflected illuminance of every cell: Σ_j F(cell → element j) · M_j.
 * @param {Float64Array} M — exitance ρ (E_dir + E_ind) of the room elements, global order
 * @returns {Float64Array} n_L · n_W, cell (i, j) at i + j·n_L
 */
export function planeReflected(room, t, M, out = new Float64Array(t.nL * t.nW)) {
  const { nL, nW, nH, C, Y, X } = t;
  const f = room.faces;
  const oC = f[1].offset, oY0 = f[2].offset, oYW = f[3].offset, oX0 = f[4].offset, oXL = f[5].offset;
  for (let j = 0; j < nW; j++) {
    for (let i = 0; i < nL; i++) {
      let s = 0;
      // ceiling elements (ei, ej): face 1 index ei + ej·nL
      for (let ej = 0; ej < nW; ej++) {
        const row = Math.abs(ej - j) * nL, m = oC + ej * nL;
        for (let ei = 0; ei < nL; ei++) s += C[Math.abs(ei - i) + row] * M[m + ei];
      }
      // walls y = 0 (distance j) and y = W (distance nW − 1 − j): element (ei, r) at ei + r·nL
      const dy0 = j, dyW = nW - 1 - j;
      for (let ei = 0; ei < nL; ei++) {
        const base = Math.abs(ei - i) * nW;
        const a = (base + dy0) * nH, b = (base + dyW) * nH;
        for (let r = 0; r < nH; r++) s += Y[a + r] * M[oY0 + ei + r * nL] + Y[b + r] * M[oYW + ei + r * nL];
      }
      // walls x = 0 (distance i) and x = L (distance nL − 1 − i): element (ej, r) at ej + r·nW
      const dx0 = i, dxL = nL - 1 - i;
      for (let ej = 0; ej < nW; ej++) {
        const base = Math.abs(ej - j) * nL;
        const a = (base + dx0) * nH, b = (base + dxL) * nH;
        for (let r = 0; r < nH; r++) s += X[a + r] * M[oX0 + ej + r * nW] + X[b + r] * M[oXL + ej + r * nW];
      }
      out[i + j * nL] = s;
    }
  }
  return out;
}

/**
 * Cell-average direct illuminance of the plane (exact for cosine lobes, adaptive cubature for a
 * file; no flux balance check — the plane does not catch all the flux).
 */
export function planeDirect(room, z, lums, phot) {
  const face = planeFace(room, z);
  const pr = { L: room.L, W: room.W, H: room.H, N: face.count, faces: [face] };
  if (phot.lobes) return elementDirectExact(pr, lums, phot, undefined, true);
  return elementDirectAdaptive(pr, lums, phot, { balance: Infinity, maxRetries: 0, symmetric: true });
}

/** Ē, E_min, E_max, U₀ = E_min / Ē and E_min / E_max of equal cells. */
export function cellStats(E) {
  const s = planeStats(E);
  return { ...s, minMax: s.max > 0 ? s.min / s.max : 0 };
}

// ---------------------------------------------------------------------------------------------
// Plans of the planes (stage 6): a field of POINT values for the colors and the isolines.
// Spec, "Планы Г-0,0 и Г-0,8": isolines by marching squares on an auxiliary grid with a step of
// 0.1 m; numbers at the points of the GOST grid. The field E(x) = E_dir(x) + E_ref(x) is built as:
//   direct    — the exact point formula (direct.js) at every node of the auxiliary grid;
//   reflected — exact point values Σ_j F(x → element j) · M_j at the VERTICES of the floor mesh,
//               interpolated bilinearly to the nodes. The reflected light is smooth (it comes from
//               large areas), while the exact sum at every node would cost N factors per node
//               (1.3 s for 6 × 4 m, 4.6 s for 10 × 10 m). At the vertices the factors depend only on
//               the offset to the element, so they are kept in tables like the kernel.
// The auxiliary grid includes the boundary of the plane (nodes on the walls). A point exactly in
// the plane of a wall would get F = 0 from that wall (not strictly in front of it), while the limit
// from inside is the full factor; such points are therefore moved inside by EDGE_EPS.

/** Auxiliary grid of the plan: the target step and the largest number of cells along a side. */
export const AUX = Object.freeze({ step: 0.1, maxCells: 400 });
const EDGE_EPS = 1e-9;

/**
 * Auxiliary grid of a plane: nodes (i·L/ax, j·W/ay), i = 0…ax, j = 0…ay, node (i, j) at i + j·(ax + 1).
 * The step is 0.1 m, larger for big rooms so that no side has more than AUX.maxCells cells.
 */
export function auxGrid(L, W, opts = AUX) {
  const s = Math.max(opts.step, Math.max(L, W) / opts.maxCells);
  const ax = Math.max(1, Math.ceil(L / s - 1e-9)), ay = Math.max(1, Math.ceil(W / s - 1e-9));
  return { ax, ay, dx: L / ax, dy: W / ay, L, W };
}

/** Mirrored offset: an element at offset o (o < 0 too) as seen from a vertex → table index ≥ 0. */
const mir = (o) => (o >= 0 ? o : -o - 1);

/**
 * Point → element factor tables for the vertices of the floor mesh lifted to height z (normal up).
 *   ceiling:       C[mi + mj·n_L]                         mi, mj — mirrored offsets to the element
 *   walls y = 0/W: Y[(mi·(n_W + 1) + b)·n_H + r]          b — vertex distance from the wall, 0…n_W
 *   walls x = 0/L: X[(mj·(n_L + 1) + a)·n_H + r]          a — vertex distance from the wall, 0…n_L
 * Floor elements give nothing (in the plane or below it); wall rows below z are cut by the horizon.
 */
export function vertexTables(room, z) {
  const { H } = room;
  const nL = room.n.L, nW = room.n.W, nH = room.n.H, dL = room.d.L, dW = room.d.W, dH = room.d.H;
  const up = [0, 0, 1], x = [0, 0, z];
  const eps = EDGE_EPS * Math.max(room.L, room.W);
  const C = new Float64Array(nL * nW);
  if (H - z > 1e-12) {
    x[0] = 0; x[1] = 0;
    for (let mj = 0; mj < nW; mj++) for (let mi = 0; mi < nL; mi++) {
      C[mi + mj * nL] = pointToRect(x, up, [mi * dL, mj * dW, H], [dL, 0, 0], [0, dW, 0], [0, 0, -1]);
    }
  }
  const Y = new Float64Array(nL * (nW + 1) * nH);
  for (let b = 0; b <= nW; b++) {
    x[0] = 0; x[1] = Math.max(b * dW, eps);
    for (let mi = 0; mi < nL; mi++) for (let r = 0; r < nH; r++) {
      if ((r + 1) * dH <= z + 1e-12) continue;
      Y[(mi * (nW + 1) + b) * nH + r] = pointToRect(x, up, [mi * dL, 0, r * dH], [dL, 0, 0], [0, 0, dH], [0, 1, 0]);
    }
  }
  const X = new Float64Array(nW * (nL + 1) * nH);
  for (let a = 0; a <= nL; a++) {
    x[0] = Math.max(a * dL, eps); x[1] = 0;
    for (let mj = 0; mj < nW; mj++) for (let r = 0; r < nH; r++) {
      if ((r + 1) * dH <= z + 1e-12) continue;
      X[(mj * (nL + 1) + a) * nH + r] = pointToRect(x, up, [0, mj * dW, r * dH], [0, dW, 0], [0, 0, dH], [1, 0, 0]);
    }
  }
  return { z, C, Y, X, nL, nW, nH };
}

/**
 * Exact reflected illuminance at the vertices of the floor mesh lifted to the plane.
 * @returns {Float64Array} (n_L + 1)(n_W + 1), vertex (a, b) at a + b·(n_L + 1)
 */
export function vertexReflected(room, t, M) {
  const { nL, nW, nH, C, Y, X } = t;
  const f = room.faces;
  const oC = f[1].offset, oY0 = f[2].offset, oYW = f[3].offset, oX0 = f[4].offset, oXL = f[5].offset;
  const out = new Float64Array((nL + 1) * (nW + 1));
  const mi = new Int32Array(nL), mj = new Int32Array(nW);
  for (let b = 0; b <= nW; b++) {
    for (let ej = 0; ej < nW; ej++) mj[ej] = mir(ej - b);
    for (let a = 0; a <= nL; a++) {
      for (let ei = 0; ei < nL; ei++) mi[ei] = mir(ei - a);
      let s = 0;
      for (let ej = 0; ej < nW; ej++) {
        const row = mj[ej] * nL, m = oC + ej * nL;
        for (let ei = 0; ei < nL; ei++) s += C[mi[ei] + row] * M[m + ei];
      }
      // walls y = 0 (distance b) and y = W (distance n_W − b): element (ei, r) at ei + r·n_L
      for (let ei = 0; ei < nL; ei++) {
        const base = mi[ei] * (nW + 1);
        const p = (base + b) * nH, q = (base + nW - b) * nH;
        for (let r = 0; r < nH; r++) s += Y[p + r] * M[oY0 + ei + r * nL] + Y[q + r] * M[oYW + ei + r * nL];
      }
      // walls x = 0 (distance a) and x = L (distance n_L − a): element (ej, r) at ej + r·n_W
      for (let ej = 0; ej < nW; ej++) {
        const base = mj[ej] * (nL + 1);
        const p = (base + a) * nH, q = (base + nL - a) * nH;
        for (let r = 0; r < nH; r++) s += X[p + r] * M[oX0 + ej + r * nW] + X[q + r] * M[oXL + ej + r * nW];
      }
      out[a + b * (nL + 1)] = s;
    }
  }
  // Corners: the factor of a wall at its end depends on the direction of approach (from a point on
  // the floor next to the corner, a wall covers 1/4 of the hemisphere along the other wall and 3/8
  // along the diagonal). The tables give the first limit; the corners take the diagonal one, the
  // same as the points moved inside by EDGE_EPS, by the direct sum over all elements.
  const eps = EDGE_EPS * Math.max(room.L, room.W), F = new Float64Array(room.N);
  for (const [a, b] of [[0, 0], [nL, 0], [0, nW], [nL, nW]]) {
    const x = [a ? room.L - eps : eps, b ? room.W - eps : eps, t.z];
    pointToElements(room, x, [0, 0, 1], F);
    let s = 0;
    for (let j = 0; j < room.N; j++) s += F[j] * M[j];
    out[a + b * (nL + 1)] = s;
  }
  return out;
}

/**
 * Bilinear interpolation of values at the nodes of a regular grid (nx × ny cells of size dx × dy,
 * node (i, j) at i + j·(nx + 1)) at the point (x, y); outside the grid the nearest edge value.
 */
export function bilinear(V, nx, ny, dx, dy, x, y) {
  let u = x / dx, v = y / dy;
  u = u < 0 ? 0 : u > nx ? nx : u;
  v = v < 0 ? 0 : v > ny ? ny : v;
  let i = Math.floor(u), j = Math.floor(v);
  if (i >= nx) i = nx - 1;
  if (j >= ny) j = ny - 1;
  const s = u - i, t = v - j, w = nx + 1, k = i + j * w;
  return (1 - t) * ((1 - s) * V[k] + s * V[k + 1]) + t * ((1 - s) * V[k + w] + s * V[k + w + 1]);
}

/**
 * Field of the plan of the plane at height z: values at the nodes of the auxiliary grid, exact
 * values at the points of the GOST grid and the extremes of all point values. Initial values E₀.
 * @param {object} cache — kept between calls for this room and height:
 *        { vt?: vertexTables, gost?: { grid, F }, dir?: { key, Edir } (direct at the nodes) }
 * @param {string} [dirKey] — identifies the luminaires and photometry: the direct part at the nodes
 *        is reused while it stays the same
 * @returns {{ z, grid: auxGrid, E, Edir, Eref: Float64Array (nodes), vertices,
 *             gost: { nx, ny, dx, dy, pts, E, Edir, Eref }, extremes: { min, max, minAt, maxAt },
 *             ms: { tables, reflected, direct, gost } }}
 *
 * Extremes (accepted 5 Nov 2026): E_min and E_max of a plane are the extremes of POINT values — the
 * nodes of the auxiliary grid (walls and corners included), the GOST points and the points straight
 * under every luminaire — so no number on the plan lies outside [E_min, E_max]. Ē stays the exact
 * area mean of the cells.
 */
export function planeField(room, z, lums, phot, M, cache = {}, dirKey = null) {
  const ms = { tables: 0, reflected: 0, direct: 0, gost: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let t = now();
  if (!cache.vt) cache.vt = vertexTables(room, z);
  ms.tables = now() - t;
  t = now();
  const Rv = vertexReflected(room, cache.vt, M);
  ms.reflected = now() - t;

  const grid = auxGrid(room.L, room.W);
  const nn = (grid.ax + 1) * (grid.ay + 1);
  const nL = room.n.L, nW = room.n.W, dL = room.d.L, dW = room.d.W;
  const eps = EDGE_EPS * Math.max(room.L, room.W);
  const x = [0, 0, z], up = [0, 0, 1];
  t = now();
  if (!cache.dir || dirKey === null || cache.dir.key !== dirKey) {
    // the nodes are symmetric about the centre too: node (i, j) ↔ (ax − i, j) ↔ (i, ay − j)
    const Ed = new Float64Array(nn), tmp = new Float64Array(nn), one = [null];
    const sym = lums.length > 1 ? mirrorSymmetry(phot, lums[0].psi) : { x: false, y: false };
    const orbits = luminaireOrbits(lums, sym, room.L, room.W);
    const w = grid.ax + 1;
    const perms = {
      x: Int32Array.from({ length: nn }, (_, k) => grid.ax - (k % w) + Math.floor(k / w) * w),
      y: Int32Array.from({ length: nn }, (_, k) => (k % w) + (grid.ay - Math.floor(k / w)) * w),
    };
    perms.xy = Int32Array.from(perms.x, (v) => perms.y[v]);
    for (const { lum, images } of orbits) {
      one[0] = lum;
      for (let j = 0; j <= grid.ay; j++) {
        x[1] = Math.min(Math.max(j * grid.dy, eps), room.W - eps);
        for (let i = 0; i <= grid.ax; i++) {
          x[0] = Math.min(Math.max(i * grid.dx, eps), room.L - eps);
          tmp[i + j * w] = directAtPoint(x, up, one, phot);
        }
      }
      addOrbit(Ed, tmp, images, perms);
    }
    cache.dir = { key: dirKey, Edir: Ed };
  }
  ms.direct = now() - t;
  const Edir = Float64Array.from(cache.dir.Edir), Eref = new Float64Array(nn), E = new Float64Array(nn);
  for (let j = 0; j <= grid.ay; j++) {
    for (let i = 0; i <= grid.ax; i++) {
      const k = i + j * (grid.ax + 1);
      Eref[k] = bilinear(Rv, nL, nW, dL, dW, i * grid.dx, j * grid.dy);
      E[k] = Edir[k] + Eref[k];
    }
  }

  t = now();
  if (!cache.gost) {
    const g = workGrid(room.L, room.W, z);
    cache.gost = { grid: g, F: gridFormFactors(room, g) };
  }
  const g = cache.gost.grid;
  const pl = planeIlluminance(room, g, cache.gost.F, M, lums, phot);
  ms.gost = now() - t;

  // extremes of the point values
  const ext = { min: Infinity, max: -Infinity, minAt: null, maxAt: null };
  const see = (v, px, py) => {
    if (v < ext.min) { ext.min = v; ext.minAt = [px, py]; }
    if (v > ext.max) { ext.max = v; ext.maxAt = [px, py]; }
  };
  for (let j = 0; j <= grid.ay; j++) for (let i = 0; i <= grid.ax; i++) see(E[i + j * (grid.ax + 1)], i * grid.dx, j * grid.dy);
  for (let k = 0; k < pl.E.length; k++) see(pl.E[k], g.pts[3 * k], g.pts[3 * k + 1]);
  for (const s of lums) {
    if (s.pos[2] <= z) continue;
    x[0] = s.pos[0]; x[1] = s.pos[1];
    see(directAtPoint(x, up, lums, phot) + bilinear(Rv, nL, nW, dL, dW, x[0], x[1]), x[0], x[1]);
  }
  return {
    z, grid, E, Edir, Eref, vertices: { nx: nL, ny: nW, dx: dL, dy: dW, E: Rv },
    gost: { nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, pts: g.pts, ...pl }, extremes: ext, ms,
  };
}
