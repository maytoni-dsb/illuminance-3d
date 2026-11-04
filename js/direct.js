// Direct illuminance from point luminaires.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Метод расчёта", item 1:
//
//   E_dir(x) = Σ_s I_s(C, γ) · cos ξ / d_s² ,   zero when cos ξ ≤ 0,
//
// ξ is the angle between the surface normal at x and the direction to luminaire s.
// All values here are initial values E₀ (no maintenance factor); MF is applied to results.
//
// Element values are AREA AVERAGES over the element, the same quantity the radiosity kernel uses
// (kernel values are area-averaged form factors, so E_ind is an element average too). For
// photometry made of cosine lobes (both models before stage 5) the average is exact:
//   E_avg,j = Σ_s Σ_lobes Φ_l · F(dA_s, axis_l → A_j) / A_j ,
// because a cosine lobe is a Lambertian differential emitter (see photometry.js). F is the exact
// point → rectangle factor with horizon clipping (formfactor.js), so the flux reaching all faces
// equals the luminaires' flux to rounding error for ANY mesh: Σ_j F = 1 for a point inside a
// closed room. Photometry without lobes (IES/LDT, stage 5) is averaged with a Gauss rule.

import { pointToElement } from './formfactor.js';
import { photometricAngles } from './photometry.js';

const TWO_PI = 2 * Math.PI;

/**
 * Direct illuminance at a point.
 * @param {ArrayLike<number>} x — point, m
 * @param {ArrayLike<number>} n — unit normal of the receiving surface
 * @param {{pos:number[], psi:number}[]} lums — luminaires (photometry.luminaireGrid)
 * @param {import('./photometry.js').Photometry} phot
 * @returns {number} E₀, lx
 */
export function directAtPoint(x, n, lums, phot) {
  let E = 0;
  const d = [0, 0, 0];
  for (const s of lums) {
    const p = s.pos;
    d[0] = x[0] - p[0]; d[1] = x[1] - p[1]; d[2] = x[2] - p[2]; // luminaire → point
    const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    if (!(r2 > 0)) continue; // point at the source: undefined, skip
    const r = Math.sqrt(r2);
    const cosXi = -(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / r; // n · (s − x) / r
    if (!(cosXi > 0)) continue;
    const { C, gamma } = photometricAngles(d, s.psi);
    E += phot.intensity(C, gamma) * cosXi / r2;
  }
  return E;
}

/**
 * Element-average direct illuminance, exact for photometry made of cosine lobes.
 * @param {import('./geometry.js').Room} room
 * @returns {Float64Array} E₀ per element (global order), lx
 */
export function elementDirectExact(room, lums, phot, out = new Float64Array(room.N)) {
  if (!phot.lobes) throw new Error('elementDirectExact: photometry has no cosine lobes');
  out.fill(0);
  for (const face of room.faces) {
    const inv = 1 / face.elementArea;
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        let flux = 0;
        for (const s of lums) {
          for (const l of phot.lobes) flux += l.flux * pointToElement(room, face.id, i, j, s.pos, l.axis);
        }
        out[face.offset + i + j * face.nu] = flux * inv;
      }
    }
  }
  return out;
}

/** Gauss–Legendre nodes and weights on [0, 1]. */
export function gaussLegendre01(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      dp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / dp;
      if (Math.abs(z - z1) < 1e-16) break;
    }
    x[i - 1] = (1 - z) / 2; w[i - 1] = 1 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

/**
 * Element-average direct illuminance by a q × q Gauss rule on each element (any photometry).
 * q = 1 samples element centres.
 */
export function elementDirectQuadrature(room, lums, phot, q = 4, out = new Float64Array(room.N)) {
  const { x: gx, w: gw } = gaussLegendre01(q);
  const p = [0, 0, 0];
  for (const face of room.faces) {
    const o = face.origin, u = face.u, v = face.v, n = face.normal;
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        let s = 0;
        for (let a = 0; a < q; a++) {
          const uu = (i + gx[a]) * face.du;
          for (let b = 0; b < q; b++) {
            const vv = (j + gx[b]) * face.dv;
            for (let c = 0; c < 3; c++) p[c] = o[c] + uu * u[c] + vv * v[c];
            s += gw[a] * gw[b] * directAtPoint(p, n, lums, phot);
          }
        }
        out[face.offset + i + j * face.nu] = s;
      }
    }
  }
  return out;
}

/** Direct illuminance at element centres (for comparison only: not an element average). */
export function elementDirectCenters(room, lums, phot, out = new Float64Array(room.N)) {
  const p = [0, 0, 0];
  for (const face of room.faces) {
    const o = face.origin, u = face.u, v = face.v;
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        const uu = (i + 0.5) * face.du, vv = (j + 0.5) * face.dv;
        for (let c = 0; c < 3; c++) p[c] = o[c] + uu * u[c] + vv * v[c];
        out[face.offset + i + j * face.nu] = directAtPoint(p, face.normal, lums, phot);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tabulated photometry (IES / LDT): adaptive cubature
//
// For a source s in front of a face (h = n · (s − o) > 0, the same for every point p of the face):
//   E(p) = I(C, γ) · cos ξ / r² = I(C, γ) · h / r³ ,   r = |p − s|.
// A narrow beam (8° in the library) covers about one element at 3 m, so a fixed rule is not enough.
// Each element is integrated adaptively: a q × q Gauss rule on a rectangle is compared with the
// sum of the same rule on its four quarters; where they differ by more than the tolerance the
// quarters are refined further (their values are reused). Tolerance per element and luminaire:
//   max(eps · |integral|, abs · Φ_lum).
// Faces the source is not in front of (h ≤ 0, e.g. the ceiling for h_c = 0) get nothing.
// The flux each luminaire puts on all faces must equal its emitted flux (Φ, or the downward flux
// Φ_down when the source lies in the ceiling plane): if a luminaire misses that by more than
// `balance`, everything is recomputed with one more forced level of subdivision (a beam missed by
// every sample point would show up there).

/** Defaults of the adaptive cubature (internal; not shown in the UI). */
export const ADAPTIVE = Object.freeze({ order: 3, eps: 1e-3, abs: 1e-7, maxDepth: 10, minDepth: 0, balance: 1e-4, maxRetries: 2 });

/**
 * Flux a luminaire at z_s can send into the room: Φ, or only Φ_down when it lies in the ceiling
 * plane (a recessed or surface-mounted luminaire cannot light upwards).
 */
export function emittedFlux(phot, zs, H) {
  if (H - zs > 1e-12) return phot.flux;
  if (phot.fluxDown !== undefined) return phot.fluxDown;
  if (phot.lobes) return phot.lobes.reduce((a, l) => a + (l.axis[2] < 0 ? l.flux : 0), 0);
  return phot.flux;
}

/**
 * Element-average direct illuminance for any photometry by adaptive cubature.
 * @param {import('./geometry.js').Room} room
 * @param {{pos:number[], psi:number}[]} lums
 * @param {import('./photometry.js').Photometry} phot
 * @param {Partial<typeof ADAPTIVE> & { out?: Float64Array }} [opts]
 * @returns {Float64Array} E₀ per element; the array also carries `stats`
 *   ({ evals, depth, retries, perLum: relative flux error per luminaire })
 */
export function elementDirectAdaptive(room, lums, phot, opts = {}) {
  const o = { ...ADAPTIVE, ...opts };
  let res;
  for (let attempt = 0; ; attempt++) {
    res = adaptivePass(room, lums, phot, { ...o, minDepth: o.minDepth + attempt });
    const worst = Math.max(0, ...res.perLum.map(Math.abs));
    if (worst <= o.balance || attempt >= o.maxRetries) { res.stats.retries = attempt; break; }
  }
  const out = opts.out ?? new Float64Array(room.N);
  out.set(res.E);
  out.stats = res.stats;
  return out;
}

function adaptivePass(room, lums, phot, o) {
  const E = new Float64Array(room.N);
  const { x: gx, w: gw } = gaussLegendre01(o.order);
  const q = o.order;
  const rot = !!phot.rotational;
  const I = phot.intensity;
  let evals = 0, deepest = 0;
  const perLum = [];
  for (const s of lums) {
    const [sx, sy, sz] = s.pos;
    const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
    const absTol = o.abs * phot.flux;
    let got = 0;
    for (const face of room.faces) {
      const n = face.normal, org = face.origin, U = face.u, V = face.v;
      const h = n[0] * (sx - org[0]) + n[1] * (sy - org[1]) + n[2] * (sz - org[2]);
      if (!(h > 1e-12)) continue;
      // source in face coordinates: p(u, v) − s = (u − su)·U + (v − sv)·V − h·n
      const su = U[0] * (sx - org[0]) + U[1] * (sy - org[1]) + U[2] * (sz - org[2]);
      const sv = V[0] * (sx - org[0]) + V[1] * (sy - org[1]) + V[2] * (sz - org[2]);
      const f = (u, v) => {
        evals++;
        const a = u - su, b = v - sv;
        const dx = a * U[0] + b * V[0] - h * n[0];
        const dy = a * U[1] + b * V[1] - h * n[1];
        const dz = a * U[2] + b * V[2] - h * n[2];
        const rh2 = dx * dx + dy * dy, r2 = rh2 + dz * dz;
        const gamma = Math.atan2(Math.sqrt(rh2), -dz);
        let C = 0;
        if (!rot) {
          const lx = cp * dx + sp * dy, ly = -sp * dx + cp * dy;
          C = Math.atan2(ly, lx);
          if (C < 0) C += TWO_PI;
        }
        return I(C, gamma) * h / (r2 * Math.sqrt(r2));
      };
      const rule = (u0, u1, v0, v1) => {
        const du = u1 - u0, dv = v1 - v0;
        let acc = 0;
        for (let i = 0; i < q; i++) {
          const u = u0 + gx[i] * du;
          let row = 0;
          for (let j = 0; j < q; j++) row += gw[j] * f(u, v0 + gx[j] * dv);
          acc += gw[i] * row;
        }
        return acc * du * dv;
      };
      const adapt = (u0, u1, v0, v1, whole, tol, depth) => {
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        const q1 = rule(u0, um, v0, vm), q2 = rule(um, u1, v0, vm), q3 = rule(u0, um, vm, v1), q4 = rule(um, u1, vm, v1);
        const sum = q1 + q2 + q3 + q4;
        if (depth >= o.maxDepth || (depth >= o.minDepth && Math.abs(sum - whole) <= tol)) {
          if (depth > deepest) deepest = depth;
          return sum;
        }
        const t = tol / 2;
        return adapt(u0, um, v0, vm, q1, t, depth + 1) + adapt(um, u1, v0, vm, q2, t, depth + 1)
          + adapt(u0, um, vm, v1, q3, t, depth + 1) + adapt(um, u1, vm, v1, q4, t, depth + 1);
      };
      const inv = 1 / face.elementArea;
      for (let j = 0; j < face.nv; j++) {
        const v0 = j * face.dv, v1 = v0 + face.dv;
        for (let i = 0; i < face.nu; i++) {
          const u0 = i * face.du, u1 = u0 + face.du;
          const whole = rule(u0, u1, v0, v1);
          const tol = Math.max(o.eps * Math.abs(whole), absTol);
          const flux = adapt(u0, u1, v0, v1, whole, tol, 1);
          E[face.offset + i + j * face.nu] += flux * inv;
          got += flux;
        }
      }
    }
    const em = emittedFlux(phot, sz, room.H);
    perLum.push(em > 1e-9 * phot.flux ? got / em - 1 : got / phot.flux);
  }
  return { E, perLum, stats: { evals, depth: deepest, perLum } };
}

/** Element-average direct illuminance: exact for cosine lobes, adaptive cubature otherwise. */
export function elementDirect(room, lums, phot, out) {
  return phot.lobes ? elementDirectExact(room, lums, phot, out) : elementDirectAdaptive(room, lums, phot, { out });
}

/** Flux reaching the faces: Σ_j E_j · A_j, lm (per face and total). */
export function faceFlux(room, E) {
  const perFace = room.faces.map((face) => {
    let s = 0;
    for (let k = 0; k < face.count; k++) s += E[face.offset + k];
    return s * face.elementArea;
  });
  return { perFace, total: perFace.reduce((a, b) => a + b, 0) };
}

/** Area-weighted mean of element values per face (all elements of a face have equal area). */
export function faceAverages(room, E) {
  return room.faces.map((face) => {
    let s = 0;
    for (let k = 0; k < face.count; k++) s += E[face.offset + k];
    return s / face.count;
  });
}

