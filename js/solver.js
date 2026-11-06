// Radiosity solver: Gauss–Seidel gathering with a face-level coarse correction.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Метод расчета", item 4:
//
//   E_ind,i = Σ_j F_ij · M_j,   M_j = ρ_j · (E_dir,j + E_ind,j)
//
// iterated until the largest relative change of E_ind over one iteration is below ε.
// All values are initial values E₀ (no maintenance factor); MF is applied to results.
//
// Gauss–Seidel: elements are updated in global order (face 0…5, then i + j·nu) and every update
// uses the latest exitances. Elements of one face do not see each other, so a face is a block.
//
// Coarse correction (two-level method). With high reflectances the slowest error component is
// nearly constant on each face (light bouncing around the whole room), and plain Gauss–Seidel
// needs about 40 sweeps for ρ = 0.9. After each sweep we therefore add a constant c_F to every
// face, chosen so that the area-weighted residual of each face vanishes:
//   c_F − Σ_G F_FG ρ_G c_G = r_F,     r_F = (1/A_F) Σ_{i∈F} A_i r_i,
// F_FG — exact face-to-face factors. The residual after a sweep comes for free: element i was
// updated with the exitances of that moment, so r_i = Σ_j F_ij ρ_j Δ_j over the elements j updated
// after it — exactly the faces G > F(i). By reciprocity
//   A_F r_F = Σ_{G>F} ρ_G Σ_{j∈G} A_j F_{j→F} Δ_j ,
// with element-to-face factors F_{j→F} computed once per kernel. The correction does not change
// the solution (it is a fixed point of both steps), only the speed: ρ = 0.9 converges in a few
// sweeps instead of about 40.

import { gatherElement } from './kernel.js';
import { axisRect, rectToRect, elementRect } from './formfactor.js';

/** Default solver accuracy ε (spec, "Входные параметры"; internal, not shown in the UI). */
export const SOLVER_EPS = 1e-4;

/** Exact element → face factors F_{j→F} (N × 6) and face → face factors F_FG (6 × 6), cached on the kernel. */
export function coarseData(kernel) {
  if (kernel.coarse) return kernel.coarse;
  const { room } = kernel;
  const faceRects = room.faces.map((face) => {
    const hi = [0, 0, 0];
    for (let c = 0; c < 3; c++) hi[c] = face.origin[c] + face.sizeU * face.u[c] + face.sizeV * face.v[c];
    return axisRect(face.normal, face.origin, hi);
  });
  const toFace = new Float64Array(6 * room.N);
  const FF = Array.from({ length: 6 }, () => new Float64Array(6));
  for (const face of room.faces) {
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        const g = face.offset + i + j * face.nu;
        const r = elementRect(room, face.id, i, j);
        for (let F = 0; F < 6; F++) {
          if (F === face.id) continue;
          const v = rectToRect(r, faceRects[F]);
          toFace[6 * g + F] = v;
          FF[face.id][F] += v * face.elementArea;
        }
      }
    }
    for (let F = 0; F < 6; F++) FF[face.id][F] /= face.area;
  }
  kernel.coarse = { toFace, FF };
  return kernel.coarse;
}

/** Solves a small dense system A x = b (Gaussian elimination with partial pivoting). */
export function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) {
      const t = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= t * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * Reflectance per element from reflectance per face.
 * @param {import('./geometry.js').Room} room
 * @param {number[]} rho — 6 values, faces 0…5
 */
export function elementRho(room, rho) {
  const out = new Float64Array(room.N);
  for (const face of room.faces) out.fill(rho[face.id], face.offset, face.offset + face.count);
  return out;
}

/**
 * Solves for the reflected (indirect) illuminance.
 * @param {import('./kernel.js').Kernel} kernel
 * @param {Float64Array} Edir — element-average direct illuminance E₀, lx
 * @param {number[]} rho — reflectance of faces 0…5
 * @param {{ eps?: number, maxIter?: number, coarse?: boolean, Eind?: Float64Array }} [opts]
 *   eps — stop when max_i |ΔE_ind,i| / E_ind,i < eps; coarse — face-level correction (default on);
 *   Eind — initial guess (e.g. the previous solution), copied
 * @returns {{ Eind: Float64Array, iterations: number, change: number, converged: boolean, ms: number }}
 */
export function solve(kernel, Edir, rho, opts = {}) {
  const { eps = SOLVER_EPS, maxIter = 1000, coarse = true } = opts;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { room } = kernel;
  const N = room.N;
  const r = elementRho(room, rho);
  const x = opts.Eind ? Float64Array.from(opts.Eind) : new Float64Array(N);
  const M = new Float64Array(N);
  for (let g = 0; g < N; g++) M[g] = r[g] * (Edir[g] + x[g]);
  const prev = new Float64Array(N);
  const delta = new Float64Array(N);
  const cd = coarse ? coarseData(kernel) : null;
  // coarse matrix I − F_FG ρ_G (fixed for given ρ)
  const C = cd && cd.FF.map((row, F) => Array.from(row, (f, G) => (F === G ? 1 : 0) - f * rho[G]));

  let it = 0, change = Infinity;
  while (it < maxIter) {
    prev.set(x);
    for (const face of room.faces) {
      const f = face.id, off = face.offset;
      for (let k = 0; k < face.count; k++) {
        const g = off + k;
        const v = gatherElement(kernel, f, k, M);
        delta[g] = v - x[g];
        x[g] = v;
        M[g] = r[g] * (Edir[g] + v);
      }
    }
    if (cd) {
      // area-weighted face residuals after the sweep (see the header), then the 6 × 6 correction
      const res = new Array(6).fill(0);
      for (const face of room.faces) {
        const G = face.id, w = rho[G] * face.elementArea;
        if (!(w > 0)) continue;
        for (let k = 0; k < face.count; k++) {
          const g = face.offset + k, dg = delta[g];
          if (dg === 0) continue;
          for (let F = 0; F < G; F++) res[F] += w * cd.toFace[6 * g + F] * dg;
        }
      }
      for (const face of room.faces) res[face.id] /= face.area;
      const c = solveDense(C, res);
      for (const face of room.faces) {
        const cf = c[face.id];
        if (!cf) continue;
        for (let g = face.offset; g < face.offset + face.count; g++) {
          x[g] += cf;
          M[g] = r[g] * (Edir[g] + x[g]);
        }
      }
    }
    it++;
    change = 0;
    for (let g = 0; g < N; g++) {
      const d = Math.abs(x[g] - prev[g]);
      if (d > 0) change = Math.max(change, x[g] > 0 ? d / x[g] : Infinity);
    }
    if (change < eps) break;
  }
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { Eind: x, iterations: it, change, converged: change < eps, ms };
}

/**
 * Energy balance: absorbed flux Σ (1 − ρ_i) E_i A_i against the luminaires' flux.
 * @returns {{ absorbed: number, emitted: number, rel: number }} rel = absorbed / emitted − 1
 */
export function energyBalance(room, Edir, Eind, rho, emitted) {
  let absorbed = 0;
  for (const face of room.faces) {
    let s = 0;
    for (let g = face.offset; g < face.offset + face.count; g++) s += Edir[g] + Eind[g];
    absorbed += (1 - rho[face.id]) * s * face.elementArea;
  }
  return { absorbed, emitted, rel: absorbed / emitted - 1 };
}

/**
 * Sumpner's estimate of the mean reflected illuminance: Φ₁ / (A · (1 − ρ_m)),
 * Φ₁ — first-reflected flux Σ ρ_i E_dir,i A_i, A — total face area, ρ_m — area-weighted mean ρ.
 * Also returns the computed mean reflected illuminance (Σ E_ind A / A) for comparison.
 */
export function sumpner(room, Edir, Eind, rho) {
  let A = 0, rhoA = 0, phi1 = 0, indA = 0;
  for (const face of room.faces) {
    let sd = 0, si = 0;
    for (let g = face.offset; g < face.offset + face.count; g++) { sd += Edir[g]; si += Eind[g]; }
    A += face.area;
    rhoA += rho[face.id] * face.area;
    phi1 += rho[face.id] * sd * face.elementArea;
    indA += si * face.elementArea;
  }
  const rhoM = rhoA / A;
  const estimate = phi1 / (A * (1 - rhoM));
  const mean = indA / A;
  const rel = estimate > 0 ? mean / estimate - 1 : mean > 0 ? Infinity : 0;
  return { estimate, mean, rel, rhoM, phi1 };
}
