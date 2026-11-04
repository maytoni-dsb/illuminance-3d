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
