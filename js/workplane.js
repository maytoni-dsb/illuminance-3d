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

import { axisRect, rectToRect } from './formfactor.js';
import { elementDirectAdaptive, elementDirectExact } from './direct.js';

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
  if (phot.lobes) return elementDirectExact(pr, lums, phot);
  return elementDirectAdaptive(pr, lums, phot, { balance: Infinity, maxRetries: 0 });
}

/** Ē, E_min, E_max, U₀ = E_min / Ē and E_min / E_max of equal cells. */
export function cellStats(E) {
  const s = planeStats(E);
  return { ...s, minMax: s.max > 0 ? s.min / s.max : 0 };
}


