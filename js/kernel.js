// Element-to-element form-factor kernel.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Метод расчета", item 3:
//
// The form factor between two elements depends only on their relative position, and all elements
// along one room edge have the same size (geometry.js divides every edge once for all faces). So
// the N × N matrix is never stored; six small tables are enough:
//
//   parallel faces (floor–ceiling, y = 0 – y = W, x = 0 – x = L), normal axis a, in-plane axes p < q:
//     F[|Δp| + |Δq|·n_p]                                                  n_p · n_q values
//   perpendicular faces, common axis c, the other two axes p < q:
//     G[(|Δc|·n_p + d_Q)·n_q + d_P] = A·F, symmetric (reciprocity)        n_c · n_p · n_q values
//     d_Q — distance index (along p) of the element of the face whose normal is along q,
//     d_P — distance index (along q) of the element of the face whose normal is along p,
//     both counted from the line where the two faces meet.
//
// Values are exact element → element factors (formfactor.rectToRect: Sparrow's closed form near,
// Gauss 5 × 5 of the exact point factor far), i.e. averaged over the receiving element. Hence
// Σ_j F_ij = 1 and A_i F_ij = A_j F_ji hold to rounding, and the gathered E_ind is an element average.
// Elements of the same face do not see each other: F = 0.

import { axisRect, rectToRect } from './formfactor.js';

/** Axis index (0, 1, 2) of a unit coordinate vector. */
const axisOf = (v) => v.findIndex((c) => c !== 0);

/**
 * Builds the kernel tables for a room.
 * @param {import('./geometry.js').Room} room
 * @returns {Kernel}
 *
 * Kernel = {
 *   room,
 *   par:  [3] by normal axis a: { a, p, q, np, nq, F: Float64Array(np·nq) },
 *   perp: [3] by common axis c: { c, p, q, nc, np, nq, G: Float64Array(nc·np·nq) },
 *   pairs: [6][6] — per receiver face r and emitter face e: null (same face) or
 *          { kind: 'par', table } | { kind: 'perp', table, rQ, cR, dR, cE, dE }
 *          with element index arrays (Int32Array, per face element k = i + j·nu):
 *          cR/cE — index along the common axis, dR/dE — distance index from the other face,
 *          rQ — true when the receiver's normal is along q (then dR is d_Q and dE is d_P).
 *   ms: build time, ms
 * }
 */
export function buildKernel(room) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const n = [room.n.L, room.n.W, room.n.H];
  const d = [room.d.L, room.d.W, room.d.H];
  const size = [room.L, room.W, room.H];

  const par = [0, 1, 2].map((a) => {
    const [p, q] = [0, 1, 2].filter((c) => c !== a);
    const np = n[p], nq = n[q];
    const F = new Float64Array(np * nq);
    const nUp = [0, 0, 0], nDown = [0, 0, 0];
    nUp[a] = 1; nDown[a] = -1;
    const lo1 = [0, 0, 0], hi1 = [0, 0, 0];
    hi1[p] = d[p]; hi1[q] = d[q];
    const r1 = axisRect(nUp, lo1, hi1);
    for (let j = 0; j < nq; j++) {
      for (let i = 0; i < np; i++) {
        const lo2 = [0, 0, 0], hi2 = [0, 0, 0];
        lo2[a] = hi2[a] = size[a];
        lo2[p] = i * d[p]; hi2[p] = (i + 1) * d[p];
        lo2[q] = j * d[q]; hi2[q] = (j + 1) * d[q];
        F[i + j * np] = rectToRect(r1, axisRect(nDown, lo2, hi2));
      }
    }
    return { a, p, q, np, nq, F };
  });

  const perp = [0, 1, 2].map((c) => {
    const [p, q] = [0, 1, 2].filter((x) => x !== c);
    const nc = n[c], np = n[p], nq = n[q];
    const G = new Float64Array(nc * np * nq);
    const nQ = [0, 0, 0], nP = [0, 0, 0];
    nQ[q] = 1; nP[p] = 1;
    const areaQ = d[c] * d[p]; // element of the face with normal along q spans c × p
    for (let k = 0; k < nc; k++) {
      for (let a = 0; a < np; a++) {
        const loQ = [0, 0, 0], hiQ = [0, 0, 0];
        hiQ[c] = d[c]; loQ[p] = a * d[p]; hiQ[p] = (a + 1) * d[p];
        const rQ = axisRect(nQ, loQ, hiQ);
        for (let b = 0; b < nq; b++) {
          const loP = [0, 0, 0], hiP = [0, 0, 0];
          loP[c] = k * d[c]; hiP[c] = (k + 1) * d[c];
          loP[q] = b * d[q]; hiP[q] = (b + 1) * d[q];
          G[(k * np + a) * nq + b] = areaQ * rectToRect(rQ, axisRect(nP, loP, hiP));
        }
      }
    }
    return { c, p, q, nc, np, nq, G };
  });

  // Per-face element indices along each axis (null for the face's normal axis).
  const idx = room.faces.map((face) => {
    const out = [null, null, null];
    const au = axisOf(face.u), av = axisOf(face.v);
    const iu = new Int32Array(face.count), iv = new Int32Array(face.count);
    for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) { iu[i + j * face.nu] = i; iv[i + j * face.nu] = j; }
    out[au] = iu; out[av] = iv;
    return out;
  });

  /** Distance index of the elements of face f from the plane of face g (perpendicular to f). */
  function distFrom(f, g) {
    const ag = axisOf(room.faces[g].normal);
    const at0 = room.faces[g].origin[ag] === 0;
    const i = idx[f][ag], nn = n[ag];
    return at0 ? i : i.map((x) => nn - 1 - x);
  }

  const pairs = room.faces.map((fr) => room.faces.map((fe) => {
    if (fr.id === fe.id) return null;
    const ar = axisOf(fr.normal), ae = axisOf(fe.normal);
    if (ar === ae) return { kind: 'par', table: par[ar] };
    const c = 3 - ar - ae;
    const table = perp[c];
    return {
      kind: 'perp', table, rQ: ar === table.q,
      cR: idx[fr.id][c], dR: distFrom(fr.id, fe.id),
      cE: idx[fe.id][c], dE: distFrom(fe.id, fr.id),
    };
  }));

  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { room, par, perp, pairs, ms };
}

/**
 * Form factor F_ij from element i (receiver/sender of the fraction) to element j, global indices,
 * looked up in the kernel tables.
 */
export function kernelF(kernel, gi, gj) {
  const { room } = kernel;
  const fi = faceOf(room, gi), fj = faceOf(room, gj);
  const pr = kernel.pairs[fi][fj];
  if (!pr) return 0;
  const a = room.faces[fi], b = room.faces[fj];
  const ki = gi - a.offset, kj = gj - b.offset;
  if (pr.kind === 'par') {
    const t = pr.table;
    const di = Math.abs(ki % a.nu - kj % b.nu), dj = Math.abs(Math.floor(ki / a.nu) - Math.floor(kj / b.nu));
    return t.F[di + dj * t.np];
  }
  const t = pr.table;
  const dc = Math.abs(pr.cR[ki] - pr.cE[kj]);
  const dQ = pr.rQ ? pr.dR[ki] : pr.dE[kj], dP = pr.rQ ? pr.dE[kj] : pr.dR[ki];
  return t.G[(dc * t.np + dQ) * t.nq + dP] / a.elementArea;
}

/** Face number of a global element index. */
export function faceOf(room, g) {
  let f = 0;
  while (g >= room.offset[f + 1]) f++;
  return f;
}

/**
 * Gathers Σ_j F_ij · M_j for every element i of receiver face `fr` from every other face.
 * Writes into out (length N, only the elements of fr are written).
 * Used for Jacobi-style evaluation and checks; the solver uses gatherElement.
 */
export function gatherFace(kernel, fr, M, out) {
  const face = kernel.room.faces[fr];
  for (let k = 0; k < face.count; k++) out[face.offset + k] = gatherElement(kernel, fr, k, M);
  return out;
}

/**
 * Σ_j F_ij · M_j for element k of face fr (i = offset + k): irradiance of element i from the
 * exitances M (lm/m²) of all elements of the other faces.
 */
export function gatherElement(kernel, fr, k, M) {
  const { room, pairs } = kernel;
  const recv = room.faces[fr];
  const row = pairs[fr];
  const ir = k % recv.nu, jr = (k - ir) / recv.nu;
  let total = 0;
  for (let fe = 0; fe < 6; fe++) {
    const pr = row[fe];
    if (!pr) continue;
    const em = room.faces[fe];
    const off = em.offset, nu = em.nu, nv = em.nv;
    let s = 0;
    if (pr.kind === 'par') {
      const F = pr.table.F, np = pr.table.np;
      for (let j = 0; j < nv; j++) {
        const base = Math.abs(jr - j) * np;
        const mrow = off + j * nu;
        for (let i = 0; i < nu; i++) {
          const di = ir > i ? ir - i : i - ir;
          s += F[base + di] * M[mrow + i];
        }
      }
      total += s;
    } else {
      const t = pr.table, G = t.G, np = t.np, nq = t.nq;
      const cr = pr.cR[k], dr = pr.dR[k], cE = pr.cE, dE = pr.dE;
      const cnt = em.count;
      if (pr.rQ) {
        // receiver is the q-normal face: d_Q = dr, d_P = dE[e]
        for (let e = 0; e < cnt; e++) {
          const dc = cr > cE[e] ? cr - cE[e] : cE[e] - cr;
          s += G[(dc * np + dr) * nq + dE[e]] * M[off + e];
        }
      } else {
        // receiver is the p-normal face: d_P = dr, d_Q = dE[e]
        for (let e = 0; e < cnt; e++) {
          const dc = cr > cE[e] ? cr - cE[e] : cE[e] - cr;
          s += G[(dc * np + dE[e]) * nq + dr] * M[off + e];
        }
      }
      total += s / recv.elementArea;
    }
  }
  return total;
}

/** Row sums Σ_j F_ij for all elements (should be 1 in a closed room). */
export function rowSums(kernel) {
  const ones = new Float64Array(kernel.room.N).fill(1);
  const out = new Float64Array(kernel.room.N);
  for (let f = 0; f < 6; f++) gatherFace(kernel, f, ones, out);
  return out;
}
