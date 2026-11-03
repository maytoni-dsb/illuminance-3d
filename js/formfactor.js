// Point-to-polygon form factor (configuration factor from a differential area to a polygon).
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Метод расчёта", item 2 (Lambert's contour integral, exact):
//
//   F(x → A) = 1/(2π) · | Σ_k γ_k · n_x · (r_k × r_{k+1}) / |r_k × r_{k+1}| |
//
// r_k = p_k − x are vectors from the receiving point to the polygon vertices, γ_k is the angle
// between r_k and r_{k+1}. The formula is exact only for a polygon lying entirely in front of the
// receiver (n_x · r ≥ 0 everywhere). Two visibility rules make it valid in general:
//   1. Horizon clipping: the polygon is first clipped to the receiver's front half-space
//      n_x · (p − x) ≥ 0. Without it a wall that extends below a work plane would be counted
//      as visible below the horizon (and the absolute value would hide the error).
//   2. Emitter side: a diffuse emitter radiates only from its front side, so F = 0 when x is not
//      strictly in front of the polygon (n_A · (x − p_0) ≤ 0). This also gives F = 0 for elements
//      of the receiver's own face, as required by the spec.
// After clipping the polygon is convex and in front of x, so every term has the same sign and the
// absolute value only removes the dependence on vertex winding.
// γ_k = atan2(|r_k × r_{k+1}|, r_k · r_{k+1}) is accurate for small and near-π angles, unlike acos.

const INV_2PI = 1 / (2 * Math.PI);

// Scratch buffer for a clipped polygon: a convex quad clipped by one plane has at most 5 vertices;
// 8 leaves room for general convex polygons up to 7 vertices. Coordinates are relative to x.
const MAX_VERTS = 8;
const clip = new Float64Array(3 * MAX_VERTS);
const rel = new Float64Array(3 * MAX_VERTS);
const side = new Float64Array(MAX_VERTS);

/**
 * Contour sum for a polygon given relative vertices (r_k = p_k − x), all in front of x.
 * Returns the absolute value divided by 2π.
 */
function contour(r, count, nx, ny, nz) {
  let sum = 0;
  for (let k = 0; k < count; k++) {
    const a = 3 * k, b = 3 * ((k + 1) % count);
    const ax = r[a], ay = r[a + 1], az = r[a + 2];
    const bx = r[b], by = r[b + 1], bz = r[b + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const cn = Math.sqrt(cx * cx + cy * cy + cz * cz);
    // Degenerate edge: x lies on the line through the edge. On the extension γ = 0 and the term
    // vanishes; on the edge itself the factor is singular (x on the emitter boundary), so skip it.
    if (!(cn > 0)) continue;
    const gamma = Math.atan2(cn, ax * bx + ay * by + az * bz);
    sum += gamma * (nx * cx + ny * cy + nz * cz) / cn;
  }
  return Math.abs(sum) * INV_2PI;
}

/**
 * Form factor from a differential area at x with unit normal n to a convex planar polygon.
 * Horizon clipping is applied; the emitter-side rule is NOT (the polygon has no normal here),
 * use pointToRect or pass only polygons whose front side faces x.
 * @param {ArrayLike<number>} x — receiving point [x, y, z], m
 * @param {ArrayLike<number>} n — unit normal of the receiver
 * @param {ArrayLike<number>} verts — flat array of polygon vertices [x0,y0,z0, x1,y1,z1, …], m
 * @returns {number} F, 0…1
 */
export function pointToPolygon(x, n, verts) {
  const count = verts.length / 3;
  if (!(count >= 3 && count < MAX_VERTS && Number.isInteger(count))) {
    throw new RangeError(`pointToPolygon: ${verts.length / 3} vertices, need 3…${MAX_VERTS - 1}`);
  }
  const x0 = x[0], x1 = x[1], x2 = x[2];
  const nx = n[0], ny = n[1], nz = n[2];
  let front = 0, back = 0;
  for (let k = 0; k < count; k++) {
    const rx = verts[3 * k] - x0, ry = verts[3 * k + 1] - x1, rz = verts[3 * k + 2] - x2;
    rel[3 * k] = rx; rel[3 * k + 1] = ry; rel[3 * k + 2] = rz;
    const s = nx * rx + ny * ry + nz * rz;
    side[k] = s;
    if (s > 0) front++; else if (s < 0) back++;
  }
  if (front === 0) return 0;             // entirely behind or in the receiver's plane
  if (back === 0) return contour(rel, count, nx, ny, nz);
  return contour(clip, clipToFront(count), nx, ny, nz);
}

/**
 * Sutherland–Hodgman clipping of the polygon in `rel` (with signed distances in `side`)
 * to the half-space side ≥ 0. Writes the result into `clip`, returns its vertex count.
 */
function clipToFront(count) {
  let m = 0;
  for (let k = 0; k < count; k++) {
    const k1 = (k + 1) % count;
    const s0 = side[k], s1 = side[k1];
    if (s0 >= 0) {
      clip[3 * m] = rel[3 * k]; clip[3 * m + 1] = rel[3 * k + 1]; clip[3 * m + 2] = rel[3 * k + 2];
      m++;
    }
    if ((s0 > 0 && s1 < 0) || (s0 < 0 && s1 > 0)) {
      const t = s0 / (s0 - s1);
      for (let c = 0; c < 3; c++) {
        const v = rel[3 * k + c] + t * (rel[3 * k1 + c] - rel[3 * k + c]);
        clip[3 * m + c] = v;
      }
      m++;  // the intersection lies in the receiver's plane (up to rounding)
    }
  }
  return m;
}

const quad = new Float64Array(12);

/**
 * Form factor from a differential area to a parallelogram (rectangle) p0, p0+a, p0+a+b, p0+b.
 * @param {ArrayLike<number>} x — receiving point, m
 * @param {ArrayLike<number>} n — unit normal of the receiver
 * @param {ArrayLike<number>} p0 — corner of the rectangle, m
 * @param {ArrayLike<number>} a — first edge vector, m
 * @param {ArrayLike<number>} b — second edge vector, m
 * @param {ArrayLike<number>} [nA] — normal of the emitting side; if given, F = 0 unless x is
 *        strictly in front of the rectangle's plane
 * @returns {number} F, 0…1
 */
export function pointToRect(x, n, p0, a, b, nA) {
  if (nA && !(nA[0] * (x[0] - p0[0]) + nA[1] * (x[1] - p0[1]) + nA[2] * (x[2] - p0[2]) > 0)) return 0;
  for (let c = 0; c < 3; c++) {
    quad[c] = p0[c];
    quad[3 + c] = p0[c] + a[c];
    quad[6 + c] = p0[c] + a[c] + b[c];
    quad[9 + c] = p0[c] + b[c];
  }
  return pointToPolygon(x, n, quad);
}

const p0s = [0, 0, 0], as = [0, 0, 0], bs = [0, 0, 0];

/**
 * Form factor from a differential area at x (normal n) to element (i, j) of face f.
 * The element emits from the side of the face normal (inside the room).
 * @param {import('./geometry.js').Room} room
 */
export function pointToElement(room, f, i, j, x, n) {
  const face = room.faces[f];
  const o = face.origin, u = face.u, v = face.v, du = face.du, dv = face.dv;
  for (let c = 0; c < 3; c++) {
    p0s[c] = o[c] + i * du * u[c] + j * dv * v[c];
    as[c] = du * u[c];
    bs[c] = dv * v[c];
  }
  return pointToRect(x, n, p0s, as, bs, face.normal);
}

/** Form factor from a differential area at x (normal n) to the whole face f. */
export function pointToFace(room, f, x, n) {
  const face = room.faces[f];
  for (let c = 0; c < 3; c++) {
    as[c] = face.sizeU * face.u[c];
    bs[c] = face.sizeV * face.v[c];
  }
  return pointToRect(x, n, face.origin, as, bs, face.normal);
}

/**
 * Form factors from a differential area at x (normal n) to every element of the room.
 * @returns {Float64Array} of length N in global element order
 */
export function pointToElements(room, x, n, out = new Float64Array(room.N)) {
  for (const face of room.faces) {
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        out[face.offset + i + j * face.nu] = pointToElement(room, face.id, i, j, x, n);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rectangle → rectangle (area-to-area) for axis-aligned rectangles: the element-to-element kernel.
// ---------------------------------------------------------------------------------------------
//
// Exact form: Sparrow's double contour integral (1963),
//   A₁F₁₂ = 1/(2π) ∮_{C₁} ∮_{C₂} ln r dl₁·dl₂ .
// For axis-aligned rectangles only parallel edge pairs contribute (dl₁·dl₂ ≠ 0), and the double
// integral of ln r over two parallel segments with transverse separation s has the primitive
//   H(t; s) = ¼(t² − s²)·ln(t² + s²) + s·t·atan(t/s)       (t = offset along the edges),
// polynomial terms dropped because they cancel in the corner sums. Hence (signs (−1)^(i+j+k+l)):
//   parallel, distance c:  A₁F₁₂ = 1/(2π) Σ [H(xᵢ−ξₖ; √((yⱼ−ηₗ)² + c²)) + H(yⱼ−ηₗ; √((xᵢ−ξₖ)² + c²))]
//   perpendicular:         A₁F₁₂ = 1/(2π) Σ  H(xᵢ−ξₖ; √(yⱼ² + zₗ²))
// where for perpendicular rectangles x runs along the common direction and y, z are the distances
// of rectangle 1 and 2 from the line where their planes meet. At a shared corner t = s = 0 and the
// terms vanish (limits r²·ln r → 0, s·atan → 0).
//
// Rounding: the result is a fourth difference of H, so for distant small rectangles most digits
// cancel. Measured on element pairs of a 6 × 4 × 3 m room (relative error vs a high-order rule):
// 6e-13 at a centre distance of 4–5 sizes, 1e-11 at 5–6, 1e-10 at 10, 1e-9 at 14, 1e-2 at 400.
// For distant pairs the exact point → rectangle factor integrated over rectangle 1 with a 5 × 5
// Gauss–Legendre rule is more accurate: its error falls as (size/distance)^10 — 3e-12 at 5 sizes,
// 1e-14 beyond 10. The switch is at a centre distance of RECT_SWITCH sizes, so over the whole range
// the relative error stays below about 3e-12 (see tests/formfactor.test.mjs).

/** Switch from Sparrow's closed form to Gauss quadrature: centre distance / largest side. */
export const RECT_SWITCH = 5;
const GAUSS5 = (() => {
  const a = Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, b = Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3;
  const wa = (322 + 13 * Math.sqrt(70)) / 900, wb = (322 - 13 * Math.sqrt(70)) / 900;
  // nodes on [0, 1] and weights summing to 1
  return { x: [-b, -a, 0, a, b].map((t) => (t + 1) / 2), w: [wb, wa, 128 / 225, wa, wb].map((w) => w / 2) };
})();

function H(t, s) {
  const q = t * t + s * s;
  return (q > 0 ? 0.25 * (t * t - s * s) * Math.log(q) : 0) + (s > 0 ? s * t * Math.atan(t / s) : 0);
}

/**
 * Exact F₁₂ between parallel, directly facing rectangles: 1 = [x1,x2]×[y1,y2] in one plane,
 * 2 = [p1,p2]×[q1,q2] in a parallel plane at distance c > 0 (same in-plane axes).
 */
export function parallelRects(x1, x2, y1, y2, p1, p2, q1, q2, c) {
  const X = [x1, x2], Y = [y1, y2], P = [p1, p2], Q = [q1, q2];
  let s = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
    const u = X[i] - P[k], v = Y[j] - Q[l];
    const term = H(u, Math.sqrt(v * v + c * c)) + H(v, Math.sqrt(u * u + c * c));
    s += (i + j + k + l) & 1 ? -term : term;
  }
  return s / (2 * Math.PI * (x2 - x1) * (y2 - y1));
}

/**
 * Exact F₁₂ between perpendicular rectangles facing each other: 1 = [x1,x2] × [y1,y2],
 * 2 = [p1,p2] × [z1,z2]; x is along the line where the planes meet, y ≥ 0 and z ≥ 0 are the
 * distances of rectangle 1 and rectangle 2 from that line.
 */
export function perpendicularRects(x1, x2, y1, y2, p1, p2, z1, z2) {
  const X = [x1, x2], Y = [y1, y2], P = [p1, p2], Z = [z1, z2];
  let s = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
    const term = H(X[i] - P[k], Math.sqrt(Y[j] * Y[j] + Z[l] * Z[l]));
    s += (i + j + k + l) & 1 ? -term : term;
  }
  return s / (2 * Math.PI * (x2 - x1) * (y2 - y1));
}

/**
 * Axis-aligned rectangle: { axis, n, lo, hi } — normal along coordinate axis `axis` (0, 1, 2),
 * n = its unit normal (emitting/receiving side), lo/hi = opposite corners (lo[axis] = hi[axis]).
 */
export function axisRect(n, lo, hi) {
  const axis = n.findIndex((c) => c !== 0);
  if (axis < 0 || n.filter((c) => c !== 0).length !== 1 || Math.abs(n[axis]) !== 1 || lo[axis] !== hi[axis]) {
    throw new RangeError('axisRect: n must be ±(unit axis) and lo, hi must lie in one plane across it');
  }
  const a = lo.map((v, c) => Math.min(v, hi[c])), b = lo.map((v, c) => Math.max(v, hi[c]));
  return { axis, n, lo: a, hi: b };
}

/** Is the box [lo, hi] strictly in front of (side > 0), in, or behind the plane of rectangle r? */
function sideOf(r, lo, hi) {
  const k = r.axis, sgn = r.n[k], p = r.lo[k];
  const d1 = sgn * (lo[k] - p), d2 = sgn * (hi[k] - p);
  return { min: Math.min(d1, d2), max: Math.max(d1, d2) };
}

const gx = [0, 0, 0], ga = [0, 0, 0], gb = [0, 0, 0], g0 = [0, 0, 0];

/** F₁₂ by 5 × 5 Gauss quadrature of the exact point → rectangle factor over rectangle 1. */
function rectToRectGauss(r1, r2, u1, v1, u2, v2) {
  for (let c = 0; c < 3; c++) {
    g0[c] = r2.lo[c];
    ga[c] = c === u2 ? r2.hi[c] - r2.lo[c] : 0;
    gb[c] = c === v2 ? r2.hi[c] - r2.lo[c] : 0;
  }
  const { x, w } = GAUSS5;
  let s = 0;
  gx[r1.axis] = r1.lo[r1.axis];
  for (let i = 0; i < 5; i++) {
    gx[u1] = r1.lo[u1] + x[i] * (r1.hi[u1] - r1.lo[u1]);
    for (let j = 0; j < 5; j++) {
      gx[v1] = r1.lo[v1] + x[j] * (r1.hi[v1] - r1.lo[v1]);
      s += w[i] * w[j] * pointToRect(gx, r1.n, g0, ga, gb, r2.n);
    }
  }
  return s;
}

/**
 * Form factor F₁₂ from axis-aligned rectangle 1 to rectangle 2 (fraction of the diffuse flux leaving
 * 1 that reaches 2), see axisRect. The rectangles must see each other fully (true for any two faces
 * of an empty box); F = 0 when they lie in one plane or one is behind the other.
 */
export function rectToRect(r1, r2) {
  const s21 = sideOf(r1, r2.lo, r2.hi), s12 = sideOf(r2, r1.lo, r1.hi);
  if (s21.max <= 0 || s12.max <= 0) return 0;                 // coplanar or behind
  // Element edges computed as origin + i·Δ may overshoot a wall plane by rounding (~1e-16 m),
  // so "partially behind" is judged with a tolerance relative to the room scale.
  const tol = 1e-9 * Math.max(s21.max, s12.max);
  if (s21.min < -tol || s12.min < -tol) throw new RangeError('rectToRect: rectangles in partial view');
  const a1 = r1.axis, a2 = r2.axis;
  const [u1, v1] = [0, 1, 2].filter((c) => c !== a1);
  const [u2, v2] = [0, 1, 2].filter((c) => c !== a2);

  // centre distance in units of the largest side → which form is more accurate
  let d2 = 0, size = 0;
  for (let c = 0; c < 3; c++) {
    const dc = (r1.lo[c] + r1.hi[c] - r2.lo[c] - r2.hi[c]) / 2;
    d2 += dc * dc;
    size = Math.max(size, r1.hi[c] - r1.lo[c], r2.hi[c] - r2.lo[c]);
  }
  if (Math.sqrt(d2) >= RECT_SWITCH * size) return rectToRectGauss(r1, r2, u1, v1, u2, v2);

  if (a1 === a2) {
    return parallelRects(r1.lo[u1], r1.hi[u1], r1.lo[v1], r1.hi[v1],
      r2.lo[u1], r2.hi[u1], r2.lo[v1], r2.hi[v1], Math.abs(r1.lo[a1] - r2.lo[a1]));
  }
  // perpendicular: common axis k; rect 1 extends along a2, rect 2 along a1
  const k = 3 - a1 - a2;
  const P2 = r2.lo[a2], P1 = r1.lo[a1];
  const y1 = Math.abs(r1.lo[a2] - P2), y2 = Math.abs(r1.hi[a2] - P2);
  const z1 = Math.abs(r2.lo[a1] - P1), z2 = Math.abs(r2.hi[a1] - P1);
  return perpendicularRects(r1.lo[k], r1.hi[k], Math.min(y1, y2), Math.max(y1, y2),
    r2.lo[k], r2.hi[k], Math.min(z1, z2), Math.max(z1, z2));
}

/** Element (i, j) of face f as an axis-aligned rectangle (see axisRect). */
export function elementRect(room, f, i, j) {
  const face = room.faces[f];
  const lo = [0, 0, 0], hi = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    lo[c] = face.origin[c] + i * face.du * face.u[c] + j * face.dv * face.v[c];
    hi[c] = lo[c] + face.du * face.u[c] + face.dv * face.v[c];
  }
  return axisRect(face.normal, lo, hi);
}

/** Exact form factor from element (f1, i1, j1) to element (f2, i2, j2). */
export function elementToElement(room, f1, i1, j1, f2, i2, j2) {
  if (f1 === f2) return 0;
  return rectToRect(elementRect(room, f1, i1, j1), elementRect(room, f2, i2, j2));
}

// ---------------------------------------------------------------------------------------------
// Closed-form references (used by tests and the stage 2 check panel).
// ---------------------------------------------------------------------------------------------

/**
 * Differential area to a parallel rectangle a × b, the normal through x passing through a corner
 * of the rectangle at distance c (Howell's catalogue, B-3).
 */
export function cornerParallel(a, b, c) {
  const A = a / c, B = b / c;
  const sa = Math.sqrt(1 + A * A), sb = Math.sqrt(1 + B * B);
  return INV_2PI * (A / sa * Math.atan(B / sa) + B / sb * Math.atan(A / sb));
}

/**
 * Area-to-area factor between two identical, parallel, directly opposed rectangles a × b
 * at distance c (Howell's catalogue, C-11).
 */
export function coaxialRectangles(a, b, c) {
  const X = a / c, Y = b / c;
  const sx = Math.sqrt(1 + X * X), sy = Math.sqrt(1 + Y * Y);
  return 2 / (Math.PI * X * Y) * (
    0.5 * Math.log((1 + X * X) * (1 + Y * Y) / (1 + X * X + Y * Y))
    + X * sy * Math.atan(X / sy) + Y * sx * Math.atan(Y / sx)
    - X * Math.atan(X) - Y * Math.atan(Y));
}

/**
 * Area-to-area factor from rectangle 1 (w × l) to rectangle 2 (h × l), perpendicular and sharing
 * the common edge of length l (Howell's catalogue, C-14).
 */
export function perpendicularCommonEdge(w, h, l) {
  const W = w / l, H = h / l;
  const W2 = W * W, H2 = H * H, R = Math.sqrt(W2 + H2);
  const lnArg =
    Math.log((1 + W2) * (1 + H2) / (1 + W2 + H2))
    + W2 * Math.log(W2 * (1 + W2 + H2) / ((1 + W2) * (W2 + H2)))
    + H2 * Math.log(H2 * (1 + W2 + H2) / ((1 + H2) * (W2 + H2)));
  return 1 / (Math.PI * W) * (W * Math.atan(1 / W) + H * Math.atan(1 / H) - R * Math.atan(1 / R) + 0.25 * lnArg);
}
