// Isolines of a field given at the nodes of a regular grid: marching squares, polylines, places
// for the labels. Pure module: no DOM and no Three.js.
// Spec, "Планы Г-0,0 и Г-0,8": isolines by marching squares on the auxiliary grid; their levels are
// exactly the levels of the color scale, with the values written on the lines.
//
// Conventions shared with the colors of the plan (planview / view3d): the field inside a cell is the
// bilinear interpolant of its four nodes, and a value v gets color k when LEVELS[k] ≤ v. Hence:
//   - a node is "inside" a level l when v ≥ l (the same comparison as the colors);
//   - the crossing on a cell edge is found by linear interpolation, which is exactly where the
//     bilinear interpolant (linear along the edges) crosses l: every vertex of an isoline lies on the
//     border of two colors, and the straight segment across the cell stays close to the curved
//     border inside the cell;
//   - a saddle cell (inside corners on a diagonal) is resolved by the value of the bilinear
//     interpolant at its saddle point (asymptotic decider): the lines then connect the same edge
//     crossings as the borders of the colors do.

/**
 * Isolines of one level.
 * @param {ArrayLike<number>} V — node values, node (i, j) at i + j·(nx + 1)
 * @param {number} nx, ny — cells along x and y
 * @param {number} dx, dy — cell size
 * @param {number} level
 * @returns {{ pts: Float64Array, closed: boolean }[]} polylines, pts = x0, y0, x1, y1, …
 */
export function isolines(V, nx, ny, dx, dy, level) {
  const w = nx + 1;
  const nH = nx * (ny + 1);                // horizontal edges h(i, j) = i + j·nx, i < nx, j ≤ ny
  const hId = (i, j) => i + j * nx;
  const vId = (i, j) => nH + i + j * w;    // vertical edges v(i, j), i ≤ nx, j < ny
  // crossing point of an edge, computed once per edge
  const px = new Map(), py = new Map();
  const cross = (id, i0, j0, i1, j1) => {
    if (px.has(id)) return id;
    const a = V[i0 + j0 * w], b = V[i1 + j1 * w];
    const t = (level - a) / (b - a);
    px.set(id, (i0 + t * (i1 - i0)) * dx);
    py.set(id, (j0 + t * (j1 - j0)) * dy);
    return id;
  };
  const segA = [], segB = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v00 = V[i + j * w], v10 = V[i + 1 + j * w], v11 = V[i + 1 + (j + 1) * w], v01 = V[i + (j + 1) * w];
      const code = (v00 >= level ? 1 : 0) | (v10 >= level ? 2 : 0) | (v11 >= level ? 4 : 0) | (v01 >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // edges: 0 bottom (00–10), 1 right (10–11), 2 top (01–11), 3 left (00–01)
      const e = (k) => (k === 0 ? cross(hId(i, j), i, j, i + 1, j)
        : k === 1 ? cross(vId(i + 1, j), i + 1, j, i + 1, j + 1)
          : k === 2 ? cross(hId(i, j + 1), i, j + 1, i + 1, j + 1)
            : cross(vId(i, j), i, j, i, j + 1));
      const add = (a, b) => { segA.push(e(a)); segB.push(e(b)); };
      // a corner is cut off by the segment between its two edges:
      // corner 00 — edges 3, 0; corner 10 — 0, 1; corner 11 — 1, 2; corner 01 — 2, 3
      switch (code) {
        case 1: case 14: add(3, 0); break;
        case 2: case 13: add(0, 1); break;
        case 4: case 11: add(1, 2); break;
        case 8: case 7: add(2, 3); break;
        case 3: case 12: add(3, 1); break;
        case 6: case 9: add(0, 2); break;
        case 5: case 10: {
          // saddle: the value of the bilinear interpolant at its saddle point decides (asymptotic
          // decider); the segments cut off the corners whose state differs from it
          const den = v00 + v11 - v10 - v01;
          const centreIn = (den !== 0 ? (v00 * v11 - v10 * v01) / den : (v00 + v10 + v11 + v01) / 4) >= level;
          const in00 = code === 5;              // code 5: 00 and 11 inside; code 10: 10 and 01 inside
          if (centreIn === in00) { add(0, 1); add(2, 3); } // cut off 10 and 01
          else { add(3, 0); add(1, 2); }                    // cut off 00 and 11
          break;
        }
        default: break;
      }
    }
  }
  return stitch(segA, segB, px, py);
}

/** Joins segments that share an edge crossing into polylines (open ones first, then loops). */
function stitch(segA, segB, px, py) {
  const at = new Map(); // edge id → segment indices (at most 2)
  const link = (id, s) => { const l = at.get(id); if (l) l.push(s); else at.set(id, [s]); };
  for (let s = 0; s < segA.length; s++) { link(segA[s], s); link(segB[s], s); }
  const used = new Uint8Array(segA.length);
  const out = [];
  const walk = (start, s0) => {
    const ids = [start];
    let id = start, s = s0;
    while (s !== undefined && !used[s]) {
      used[s] = 1;
      id = segA[s] === id ? segB[s] : segA[s];
      ids.push(id);
      s = at.get(id).find((q) => !used[q]);
    }
    const closed = ids.length > 2 && ids[0] === ids[ids.length - 1];
    if (closed) ids.pop();
    const pts = new Float64Array(2 * ids.length);
    ids.forEach((q, k) => { pts[2 * k] = px.get(q); pts[2 * k + 1] = py.get(q); });
    out.push({ pts, closed });
  };
  for (const [id, l] of at) if (l.length === 1 && !used[l[0]]) walk(id, l[0]); // ends on the boundary
  for (let s = 0; s < segA.length; s++) if (!used[s]) walk(segA[s], s);       // loops
  return out;
}

/**
 * Isolines of several levels; levels outside the range of the field give no lines.
 * @returns {{ level: number, lines: { pts: Float64Array, closed: boolean }[] }[]}
 */
export function isolineSet(V, nx, ny, dx, dy, levels) {
  let min = Infinity, max = -Infinity;
  for (const v of V) { if (v < min) min = v; if (v > max) max = v; }
  return levels.filter((l) => l > min && l <= max).map((level) => ({ level, lines: isolines(V, nx, ny, dx, dy, level) }));
}

/**
 * Places for the labels of a polyline: every `spacing` along it, starting half a spacing from its
 * start (for a loop, anywhere), on lines at least `minLength` long. Works in any units (the plan
 * uses screen pixels, so the labels keep their spacing at any zoom).
 * @param {ArrayLike<number>} pts — x0, y0, x1, y1, …
 * @returns {{ x: number, y: number, angle: number }[]} angle of the line, rad, within −π/2…π/2
 *          (text along it stays upright)
 */
export function labelPlaces(pts, closed, spacing, minLength = spacing / 2) {
  const n = pts.length / 2;
  if (n < 2) return [];
  const seg = closed ? n : n - 1;
  let total = 0;
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % n;
    total += Math.hypot(pts[2 * k1] - pts[2 * k], pts[2 * k1 + 1] - pts[2 * k + 1]);
  }
  if (!(total >= minLength)) return [];
  const count = Math.max(1, Math.floor(total / spacing));
  const step = total / count;
  const out = [];
  let target = step / 2, acc = 0;
  for (let k = 0; k < seg && out.length < count; k++) {
    const k1 = (k + 1) % n;
    const x0 = pts[2 * k], y0 = pts[2 * k + 1], x1 = pts[2 * k1], y1 = pts[2 * k1 + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    while (len > 0 && target <= acc + len && out.length < count) {
      const t = (target - acc) / len;
      let angle = Math.atan2(y1 - y0, x1 - x0);
      if (angle > Math.PI / 2) angle -= Math.PI; else if (angle < -Math.PI / 2) angle += Math.PI;
      out.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), angle });
      target += step;
    }
    acc += len;
  }
  return out;
}
