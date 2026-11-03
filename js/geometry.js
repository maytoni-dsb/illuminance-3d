// Room geometry: faces, subdivision into elements, indexing.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// SI units (m). Coordinate system and faces follow the spec, section
// "Система координат и грани" (coordinate system and faces).

/** Tolerance for size/step division: 1.1/0.1 = 11.000000000000002 must give 11, not 12. */
const DIVISION_EPS = 1e-9;

/** Number of divisions of size a for the desired step h: max(1, ceil(a/h − eps)). */
export function divisions(a, h) {
  if (!(a > 0) || !(h > 0)) throw new RangeError(`divisions: a=${a}, h=${h} must be > 0`);
  return Math.max(1, Math.ceil(a / h - DIVISION_EPS));
}

/**
 * Face definitions 0…5. Face sizes refer to room edges ('L' | 'W' | 'H'),
 * so every face sharing an edge gets the same number of divisions along it.
 * origin(L, W, H) is the point (u = 0, v = 0).
 * `name` is a user-facing label and is therefore in Russian.
 */
export const FACE_DEFS = Object.freeze([
  { id: 0, name: 'Пол',         normal: [0, 0, 1],  u: [1, 0, 0], v: [0, 1, 0], uEdge: 'L', vEdge: 'W', origin: () => [0, 0, 0] },
  { id: 1, name: 'Потолок',     normal: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], uEdge: 'L', vEdge: 'W', origin: (L, W, H) => [0, 0, H] },
  { id: 2, name: 'Стена y = 0', normal: [0, 1, 0],  u: [1, 0, 0], v: [0, 0, 1], uEdge: 'L', vEdge: 'H', origin: () => [0, 0, 0] },
  { id: 3, name: 'Стена y = W', normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], uEdge: 'L', vEdge: 'H', origin: (L, W) => [0, W, 0] },
  { id: 4, name: 'Стена x = 0', normal: [1, 0, 0],  u: [0, 1, 0], v: [0, 0, 1], uEdge: 'W', vEdge: 'H', origin: () => [0, 0, 0] },
  { id: 5, name: 'Стена x = L', normal: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], uEdge: 'W', vEdge: 'H', origin: (L) => [L, 0, 0] },
]);

/**
 * Builds a room with subdivided faces.
 * @param {{L:number, W:number, H:number, h:number}} p — room size, m; h — desired element step, m
 * @returns {Room}
 *
 * Room = {
 *   L, W, H, h,
 *   n:  { L, W, H },       // number of divisions per edge
 *   d:  { L, W, H },       // actual step Δ = size / n
 *   faces: Face[6],        // in order 0…5
 *   offset: Int32Array(7), // start of face f in the global array; offset[6] = N
 *   N,                     // total number of elements
 * }
 * Face = { id, name, normal, u, v, origin, nu, nv, du, dv, sizeU, sizeV,
 *          elementArea, area, offset, count }
 */
export function createRoom({ L, W, H, h }) {
  for (const [k, x] of Object.entries({ L, W, H, h })) {
    if (!Number.isFinite(x) || x <= 0) throw new RangeError(`createRoom: ${k}=${x} must be finite and > 0`);
  }
  const size = { L, W, H };
  const n = { L: divisions(L, h), W: divisions(W, h), H: divisions(H, h) };
  const d = { L: L / n.L, W: W / n.W, H: H / n.H };

  const offset = new Int32Array(7);
  const faces = FACE_DEFS.map((def, f) => {
    const nu = n[def.uEdge], nv = n[def.vEdge];
    const du = d[def.uEdge], dv = d[def.vEdge];
    const face = Object.freeze({
      id: def.id,
      name: def.name,
      normal: def.normal,
      u: def.u,
      v: def.v,
      origin: Object.freeze(def.origin(L, W, H)),
      nu, nv, du, dv,
      sizeU: size[def.uEdge],
      sizeV: size[def.vEdge],
      elementArea: du * dv,
      area: size[def.uEdge] * size[def.vEdge],
      offset: offset[f],
      count: nu * nv,
    });
    offset[f + 1] = offset[f] + face.count;
    return face;
  });

  return Object.freeze({ L, W, H, h, n: Object.freeze(n), d: Object.freeze(d), faces: Object.freeze(faces), offset, N: offset[6] });
}

/** Point on a face from local coordinates (u, v), m. */
export function facePoint(face, u, v, out = [0, 0, 0]) {
  const o = face.origin, a = face.u, b = face.v;
  out[0] = o[0] + u * a[0] + v * b[0];
  out[1] = o[1] + u * a[1] + v * b[1];
  out[2] = o[2] + u * a[2] + v * b[2];
  return out;
}

/** Center of element (i, j) of a face: u = (i + 0.5)·Δu, v = (j + 0.5)·Δv. */
export function elementCenter(face, i, j, out) {
  return facePoint(face, (i + 0.5) * face.du, (j + 0.5) * face.dv, out);
}

/** Index within a face: k = i + j·nu (i varies fastest). */
export const localIndex = (face, i, j) => i + j * face.nu;

/** Global index: offset[f] + k. */
export const globalIndex = (room, f, i, j) => room.offset[f] + i + j * room.faces[f].nu;

/** Inverse mapping: global index → { f, i, j }. */
export function fromGlobalIndex(room, g) {
  if (!(g >= 0 && g < room.N)) throw new RangeError(`fromGlobalIndex: ${g} is outside 0…${room.N - 1}`);
  let f = 0;
  while (g >= room.offset[f + 1]) f++;
  const k = g - room.offset[f];
  const nu = room.faces[f].nu;
  return { f, i: k % nu, j: Math.floor(k / nu) };
}

/** Centers of all elements: Float64Array of length 3N (x, y, z interleaved) in global order. */
export function elementCenters(room) {
  const out = new Float64Array(3 * room.N);
  const p = [0, 0, 0];
  for (const face of room.faces) {
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        elementCenter(face, i, j, p);
        const g = 3 * (face.offset + i + j * face.nu);
        out[g] = p[0]; out[g + 1] = p[1]; out[g + 2] = p[2];
      }
    }
  }
  return out;
}

/**
 * Vertex values for display: a (nu+1)×(nv+1) grid, index a + b·(nu+1).
 * Each vertex is the mean of the adjacent elements of THIS face only
 * (values are never averaged across edges between faces).
 * @param {Face} face
 * @param {ArrayLike<number>} values — array of length N (global order)
 * @returns {Float64Array} of length (nu+1)(nv+1)
 */
export function faceVertexValues(face, values) {
  const { nu, nv, offset } = face;
  const out = new Float64Array((nu + 1) * (nv + 1));
  for (let b = 0; b <= nv; b++) {
    for (let a = 0; a <= nu; a++) {
      let s = 0, c = 0;
      for (let j = b - 1; j <= b; j++) {
        if (j < 0 || j >= nv) continue;
        for (let i = a - 1; i <= a; i++) {
          if (i < 0 || i >= nu) continue;
          s += values[offset + i + j * nu];
          c++;
        }
      }
      out[a + b * (nu + 1)] = s / c;
    }
  }
  return out;
}
