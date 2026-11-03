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
