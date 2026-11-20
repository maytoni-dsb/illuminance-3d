// Luminaire groups of version 2 (stage 2.1, spec v2 "Data model" and "Stage 2.1"): the mounting
// points of every kind of group, the room a luminaire housing needs and the edits of the plan
// editor (move, ungroup). Pure module: no DOM, tested in Node (tests/groups.test.mjs).
//
// A mounting point is { x, y, hm, psi }: plan position of the top centre of the housing, m,
// mounting height h_m, m, and the rotation ψ of the C0 plane from +X, counter-clockwise, degrees.
// Groups are drawn on the plan and have no rotation of their own (decided on 20 Nov 2026):
//
//   grid    { nx, ny, hm, psi, area? }        — as in version 1: cells of equal size over the area
//            { x0, y0, x1, y1 } (the whole room when absent), a luminaire in every cell centre;
//            the form shows the area as its centre and size
//   line    { x0, y0, x1, y1, n, hm, hm1, psi } — n luminaires evenly from P0 to P1 (one: the
//            middle); mounting heights from hm at P0 to hm1 at P1; ψ counts from the direction P0 → P1
//   circle  { cx, cy, r, n, hm, psi }         — n luminaires at the angles k·360°/n from +X; ψ counts
//            from the radius (90°: along the tangent)
//   single  { points: [{ x, y, hm, psi }] }    — every luminaire with its own height and rotation

/** Kinds of groups. */
export const GROUP_KINDS = Object.freeze(['single', 'grid', 'line', 'circle']);

const DEG = Math.PI / 180;
/** Lengths closer than this are equal (m); also the tolerance of the placement check. */
export const GEO_EPS = 1e-9;

/** Angle in degrees reduced to [0, 360). */
export const wrapDeg = (a) => { const r = a % 360; return r < 0 ? r + 360 : r + 0; };

/**
 * Mounting points of a group, in the order of the luminaires.
 * @param {object} g — group
 * @param {{ L: number, W: number }} room — size of the room (the area of a grid without its own)
 * @returns {{ x, y, hm, psi }[]}
 */
export function groupPoints(g, room) {
  switch (g.kind) {
    case 'grid': {
      const out = [];
      const a = g.area;
      for (let j = 0; j < g.ny; j++) {
        for (let i = 0; i < g.nx; i++) {
          // without an area: the expressions of photometry.luminaireGrid (version 1 bit for bit)
          const x = a ? a.x0 + (i + 0.5) * (a.x1 - a.x0) / g.nx : (i + 0.5) * room.L / g.nx;
          const y = a ? a.y0 + (j + 0.5) * (a.y1 - a.y0) / g.ny : (j + 0.5) * room.W / g.ny;
          out.push({ x, y, hm: g.hm, psi: g.psi });
        }
      }
      return out;
    }
    case 'line': {
      const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
      const dir = dx || dy ? Math.atan2(dy, dx) / DEG : 0;
      const out = [];
      for (let k = 0; k < g.n; k++) {
        const t = g.n === 1 ? 0.5 : k / (g.n - 1);
        out.push({ x: g.x0 + t * dx, y: g.y0 + t * dy, hm: g.hm + t * (g.hm1 - g.hm), psi: wrapDeg(dir + g.psi) });
      }
      return out;
    }
    case 'circle': {
      const out = [];
      for (let k = 0; k < g.n; k++) {
        const a = (360 * k) / g.n;
        out.push({ x: g.cx + g.r * Math.cos(a * DEG), y: g.cy + g.r * Math.sin(a * DEG), hm: g.hm, psi: wrapDeg(a + g.psi) });
      }
      return out;
    }
    case 'single':
      return g.points.map((p) => ({ x: p.x, y: p.y, hm: p.hm, psi: p.psi }));
    default:
      throw new RangeError(`groupPoints: group kind ${g.kind}`);
  }
}

/** Number of luminaires of a group (without generating them). */
export function groupCount(g) {
  switch (g.kind) {
    case 'grid': return g.nx * g.ny;
    case 'line': case 'circle': return g.n;
    case 'single': return g.points.length;
    default: return 0;
  }
}

/**
 * Half sizes along X and Y of the plan box of a housing a × b (a along the C0 plane, b along C90)
 * turned by ψ: the distance the mounting point keeps from a wall along that axis (decided on
 * 20 Nov 2026). No size (cosine model): 0.
 * @returns {[number, number]}
 */
export function housingHalf(size, psiDeg) {
  if (!size) return [0, 0];
  const c = Math.abs(Math.cos(psiDeg * DEG)), s = Math.abs(Math.sin(psiDeg * DEG));
  const a = size.a / 2, b = size.b / 2;
  return [a * c + b * s, a * s + b * c];
}

/** True when the point lies inside or on the outline (polygon, counter-clockwise). */
export function pointInOutline(outline, x, y, eps = GEO_EPS) {
  // on an edge: inside
  for (let k = 0; k < outline.length; k++) {
    const [ax, ay] = outline[k], [bx, by] = outline[(k + 1) % outline.length];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
    if (Math.hypot(ax + t * ex - x, ay + t * ey - y) <= eps) return true;
  }
  let inside = false;
  for (let k = 0, j = outline.length - 1; k < outline.length; j = k++) {
    const [xi, yi] = outline[k], [xj, yj] = outline[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * True when the box [x − hx, x + hx] × [y − hy, y + hy] lies inside an orthogonal outline: its
 * corners are inside and no vertex of the outline lies strictly inside the box.
 */
export function boxInOutline(outline, x, y, hx, hy, eps = GEO_EPS) {
  const corners = [[x - hx, y - hy], [x + hx, y - hy], [x + hx, y + hy], [x - hx, y + hy]];
  if (!corners.every(([px, py]) => pointInOutline(outline, px, py, eps))) return false;
  return !outline.some(([vx, vy]) => vx > x - hx + eps && vx < x + hx - eps && vy > y - hy + eps && vy < y + hy - eps);
}

/**
 * The point nearest to (x, y) where a box of half sizes hx, hy fits a rectangular room L × W
 * (dragging stops at the wall). A box larger than the room is centred.
 */
export function clampToRoom(x, y, hx, hy, L, W) {
  const cl = (v, h, size) => (2 * h >= size ? size / 2 : Math.min(size - h, Math.max(h, v)));
  return [cl(x, hx, L), cl(y, hy, W)];
}

/** The group moved by (dx, dy) in plan; a grid without an area gets the room as its area first. */
export function moveGroup(g, dx, dy, room) {
  switch (g.kind) {
    case 'grid': {
      const a = g.area ?? { x0: 0, y0: 0, x1: room.L, y1: room.W };
      return { ...g, area: { x0: a.x0 + dx, y0: a.y0 + dy, x1: a.x1 + dx, y1: a.y1 + dy } };
    }
    case 'line':
      return { ...g, x0: g.x0 + dx, y0: g.y0 + dy, x1: g.x1 + dx, y1: g.y1 + dy };
    case 'circle':
      return { ...g, cx: g.cx + dx, cy: g.cy + dy };
    case 'single':
      return { ...g, points: g.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    default:
      throw new RangeError(`moveGroup: group kind ${g.kind}`);
  }
}

/** Single luminaires at the given indices of a group "single" moved by (dx, dy). */
export function movePoints(g, indices, dx, dy) {
  if (g.kind !== 'single') throw new RangeError('movePoints: only single luminaires move one by one');
  const set = new Set(indices);
  return { ...g, points: g.points.map((p, k) => (set.has(k) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) };
}

/**
 * The group as single luminaires (ungroup): the same type, id and luminaires; every luminaire keeps
 * the height and rotation it had in the group.
 */
export function ungroup(g, room) {
  return { id: g.id, type: g.type, kind: 'single', points: groupPoints(g, room) };
}

/**
 * The group with its luminaires turned by dpsi degrees about their own vertical axes (the tool
 * "rotate" of the plan); of single luminaires only those at `indices` (all when absent).
 */
export function turnLuminaires(g, dpsi, indices = null) {
  if (g.kind !== 'single') return { ...g, psi: wrapDeg(g.psi + dpsi) };
  const set = indices ? new Set(indices) : null;
  return { ...g, points: g.points.map((p, k) => (!set || set.has(k) ? { ...p, psi: wrapDeg(p.psi + dpsi) } : p)) };
}

/** Grid area as the form shows it: centre and size. */
export const areaCentre = (a) => ({ cx: (a.x0 + a.x1) / 2, cy: (a.y0 + a.y1) / 2, w: a.x1 - a.x0, h: a.y1 - a.y0 });
/** Grid area from its centre and size. */
export const areaOf = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
