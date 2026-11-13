// Direct illuminance from point luminaires.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Calculation method", item 1:
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
  const I = phot.intensity, rot = !!phot.rotational;
  for (const s of lums) {
    const p = s.pos;
    const dx = x[0] - p[0], dy = x[1] - p[1], dz = x[2] - p[2]; // luminaire → point
    const rh2 = dx * dx + dy * dy, r2 = rh2 + dz * dz;
    if (!(r2 > 0)) continue; // point at the source: undefined, skip
    const r = Math.sqrt(r2);
    const cosXi = -(n[0] * dx + n[1] * dy + n[2] * dz) / r; // n · (s − x) / r
    if (!(cosXi > 0)) continue;
    // photometricAngles inlined (no object per call): γ from the downward vertical, C in the
    // luminaire frame rotated by ψ
    const gamma = Math.atan2(Math.sqrt(rh2), -dz);
    let C = 0;
    if (!rot && rh2 > 0) {
      const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
      C = Math.atan2(-sp * dx + cp * dy, cp * dx + sp * dy);
      if (C < 0) C += TWO_PI;
      if (C >= TWO_PI) C -= TWO_PI;
    }
    E += I(C, gamma) * cosXi / r2;
  }
  return E;
}

// ---------------------------------------------------------------------------------------------
// Mirror symmetry of a regular grid (stage 7, accepted 6 Nov 2026)
//
// The luminaires of a regular grid lie symmetrically about the planes x = L/2 and y = W/2. If the
// light distribution, turned by ψ, is invariant under the same mirror, the field of the mirrored
// luminaire is the mirrored field of the original one. Then only one luminaire of every orbit
// (≤ 4 luminaires: itself and its images) is integrated, and the images are added by permuting
// the receivers: E(k) += F_rep(P(k)), P — the mirror map of elements, cells or nodes.
// A room mirror x → L − x turns a horizontal direction at angle φ into π − φ; in the luminaire frame
// (C = φ − ψ) that is C → π − 2ψ − C. The mirror y → W − y gives C → −2ψ − C.
// Invariance is tested on the interpolant itself: at all planes, their images and the midpoints,
// at all tabulated γ and the midpoints, to 10⁻¹² of the peak intensity. Measured files are rarely
// symmetric to that precision unless declared so; then nothing is gained and nothing is lost.

const wrap2pi = (c) => { c %= TWO_PI; return c < 0 ? c + TWO_PI : c; };

/** True when I(C, γ) = I(a − C, γ) for every direction (C in the luminaire frame). */
export function mirrorInvariant(phot, a) {
  if (phot.rotational) return true;
  if (phot.lobes) return phot.lobes.every((l) => Math.abs(l.axis[0]) < 1e-15 && Math.abs(l.axis[1]) < 1e-15);
  const t = phot.table;
  if (!t) return false;
  const Cs = [];
  for (let p = 0; p < t.planes.length; p++) {
    Cs.push(t.planes[p], wrap2pi(a - t.planes[p]));
    if (p + 1 < t.planes.length) Cs.push((t.planes[p] + t.planes[p + 1]) / 2);
  }
  const Gs = [];
  for (let k = 0; k < t.gamma.length; k++) {
    Gs.push(t.gamma[k]);
    if (k + 1 < t.gamma.length) Gs.push((t.gamma[k] + t.gamma[k + 1]) / 2);
  }
  let peak = 0;
  for (const v of t.rows) if (v > peak) peak = v;
  const tol = 1e-12 * Math.max(peak, 1e-300);
  for (const C0 of Cs) {
    const C = wrap2pi(C0), Cm = wrap2pi(a - C);
    for (const g of Gs) if (Math.abs(phot.intensity(C, g) - phot.intensity(Cm, g)) > tol) return false;
  }
  return true;
}

/** Room mirrors the photometry turned by ψ allows: { x: x → L − x, y: y → W − y }. */
export function mirrorSymmetry(phot, psi = 0) {
  return { x: mirrorInvariant(phot, Math.PI - 2 * psi), y: mirrorInvariant(phot, -2 * psi) };
}

/**
 * Orbits of the luminaires under the allowed mirrors: [{ lum, images: ('x'|'y'|'xy')[] }]; the
 * representative itself is always included (image 'id'). Every luminaire belongs to exactly one
 * orbit; a mirror whose image is not a luminaire of the set is not used for that orbit.
 */
export function luminaireOrbits(lums, sym, L, W) {
  const key = (x, y) => `${Math.round(x * 1e6)}|${Math.round(y * 1e6)}`;
  const byPos = new Map();
  lums.forEach((s, k) => byPos.set(key(s.pos[0], s.pos[1]), k));
  const psi0 = lums.length ? lums[0].psi : 0;
  const same = lums.every((s) => s.psi === psi0 && s.pos[2] === lums[0].pos[2]);
  const used = new Uint8Array(lums.length), out = [];
  lums.forEach((s, k) => {
    if (used[k]) return;
    used[k] = 1;
    const images = ['id'];
    if (same) {
      const [x, y] = s.pos, cand = [];
      if (sym.x) cand.push(['x', L - x, y]);
      if (sym.y) cand.push(['y', x, W - y]);
      if (sym.x && sym.y) cand.push(['xy', L - x, W - y]);
      for (const [name, px, py] of cand) {
        const m = byPos.get(key(px, py));
        if (m !== undefined && !used[m]) { used[m] = 1; images.push(name); }
      }
    }
    out.push({ lum: s, images });
  });
  return out;
}

/**
 * Mirror maps of the elements of a set of faces (faces with origin, u, v, normal, nu, nv, du, dv,
 * offset): { x, y, xy } — Int32Array P with P[k] the element that element k is mirrored to.
 */
export function elementMirrors(faces, N, L, W) {
  const map = (axis) => {
    const size = axis ? W : L, P = new Int32Array(N);
    for (const f of faces) {
      const n2 = f.normal.slice(); n2[axis] = -n2[axis];
      for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
        const c = [0, 1, 2].map((q) => f.origin[q] + (i + 0.5) * f.du * f.u[q] + (j + 0.5) * f.dv * f.v[q]);
        c[axis] = size - c[axis];
        const g = faces.find((h) => h.normal.every((v, q) => Math.abs(v - n2[q]) < 1e-12)
          && Math.abs(h.normal.reduce((a, v, q) => a + v * (c[q] - h.origin[q]), 0)) < 1e-9);
        if (!g) throw new Error('elementMirrors: no mirror face');
        const rel = [0, 1, 2].map((q) => c[q] - g.origin[q]);
        const ii = Math.floor(rel.reduce((a, v, q) => a + v * g.u[q], 0) / g.du);
        const jj = Math.floor(rel.reduce((a, v, q) => a + v * g.v[q], 0) / g.dv);
        P[f.offset + i + j * f.nu] = g.offset + Math.min(g.nu - 1, Math.max(0, ii)) + Math.min(g.nv - 1, Math.max(0, jj)) * g.nu;
      }
    }
    return P;
  };
  const x = map(0), y = map(1);
  return { x, y, xy: Int32Array.from(x, (v) => y[v]) };
}

/** Adds the field F of an orbit's representative and its mirrored copies to out. */
export function addOrbit(out, F, images, perms) {
  const n = out.length;
  for (const img of images) {
    if (img === 'id') { for (let k = 0; k < n; k++) out[k] += F[k]; continue; }
    const P = perms[img];
    for (let k = 0; k < n; k++) out[k] += F[P[k]];
  }
}

/** Orbits for a room-like object { L, W, faces, N }: { orbits, perms } (perms built lazily). */
function symmetryOf(room, lums, phot, symmetric) {
  const sym = symmetric && lums.length > 1 ? mirrorSymmetry(phot, lums[0].psi) : { x: false, y: false };
  const orbits = luminaireOrbits(lums, sym, room.L, room.W);
  const needs = orbits.some((o) => o.images.length > 1);
  return { orbits, perms: needs ? elementMirrors(room.faces, room.N, room.L, room.W) : null };
}

/**
 * Element-average direct illuminance, exact for photometry made of cosine lobes.
 * @param {import('./geometry.js').Room} room
 * @returns {Float64Array} E₀ per element (global order), lx
 */
export function elementDirectExact(room, lums, phot, out = new Float64Array(room.N), symmetric = false) {
  if (!phot.lobes) throw new Error('elementDirectExact: photometry has no cosine lobes');
  out.fill(0);
  const { orbits, perms } = symmetryOf(room, lums, phot, symmetric);
  const tmp = new Float64Array(room.N);
  for (const { lum: s, images } of orbits) {
    for (const face of room.faces) {
      const inv = 1 / face.elementArea;
      for (let j = 0; j < face.nv; j++) {
        for (let i = 0; i < face.nu; i++) {
          let flux = 0;
          for (const l of phot.lobes) flux += l.flux * pointToElement(room, face.id, i, j, s.pos, l.axis);
          tmp[face.offset + i + j * face.nu] = flux * inv;
        }
      }
    }
    addOrbit(out, tmp, images, perms);
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
// Φ_down when the source lies in the ceiling plane): a luminaire that misses it by more than
// `balance` is integrated again with 10 times smaller tolerances, up to `maxRetries` times (a beam
// missed by every sample point would show up there too).

/** Defaults of the adaptive cubature (internal; not shown in the UI). */
export const ADAPTIVE = Object.freeze({ order: 3, eps: 1e-3, abs: 1e-7, maxDepth: 10, minDepth: 0, balance: 1e-3, maxRetries: 2, symmetric: false });

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
 *   ({ evals, depth, retries: luminaires integrated again, perLum: relative flux error per luminaire })
 */
export function elementDirectAdaptive(room, lums, phot, opts = {}) {
  const o = { ...ADAPTIVE, ...opts };
  const out = opts.out ?? new Float64Array(room.N);
  out.fill(0);
  const tmp = new Float64Array(room.N);
  const { orbits, perms } = symmetryOf(room, lums, phot, !!o.symmetric);
  const stats = { evals: 0, depth: 0, retries: 0, perLum: [], integrated: orbits.length, luminaires: lums.length };
  for (const { lum: s, images } of orbits) {
    const em = emittedFlux(phot, s.pos[2], room.H);
    let eps = o.eps, abs = o.abs, rel = 0;
    for (let attempt = 0; ; attempt++) {
      tmp.fill(0);
      const got = integrateLuminaire(room, s, phot, { ...o, eps, abs }, tmp, stats);
      rel = em > 1e-9 * phot.flux ? got / em - 1 : got / phot.flux;
      if (Math.abs(rel) <= o.balance || attempt >= o.maxRetries) break;
      stats.retries++;
      eps /= 10; abs /= 10;
    }
    stats.perLum.push(rel);
    addOrbit(out, tmp, images, perms);
  }
  out.stats = stats;
  return out;
}

/** Adds one luminaire's element averages to E; returns the flux it put on all faces, lm. */
function integrateLuminaire(room, s, phot, o, E, stats) {
  const { x: gx, w: gw } = gaussLegendre01(o.order);
  const q = o.order;
  const rot = !!phot.rotational;
  const I = phot.intensity;
  const [sx, sy, sz] = s.pos;
  const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
  const absTol = o.abs * phot.flux;
  let got = 0, evals = 0;
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
        if (depth > stats.depth) stats.depth = depth;
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
  stats.evals += evals;
  return got;
}

/** Element-average direct illuminance: exact for cosine lobes, adaptive cubature otherwise. */
export function elementDirect(room, lums, phot, out, symmetric = true) {
  return phot.lobes ? elementDirectExact(room, lums, phot, out, symmetric) : elementDirectAdaptive(room, lums, phot, { out, symmetric });
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

