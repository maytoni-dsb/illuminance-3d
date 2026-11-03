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

/** Element-average direct illuminance: exact for cosine lobes, Gauss 4 × 4 otherwise. */
export function elementDirect(room, lums, phot, out) {
  return phot.lobes ? elementDirectExact(room, lums, phot, out) : elementDirectQuadrature(room, lums, phot, 4, out);
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

