// Luminaire groups of version 2 (stage 2.1, spec v2 "Data model" and "Stage 2.1"): the mounting
// points of every kind of group, the room a luminaire housing needs and the edits of the plan
// editor (move, ungroup). Pure module: no DOM, tested in Node (tests/groups.test.mjs).
//
// A mounting point is { x, y, hm, psi }: plan position of the top centre of the housing, m,
// mounting height h_m, m, and the rotation ψ of the C0 plane from +X, counter-clockwise, degrees.
// Groups are drawn on the plan and have no rotation of their own (decided on 20 Nov 2026):
//
//   grid    { nx, ny, hm, psi, area?, mx?, my? } — over the area { x0, y0, x1, y1 } (the whole room
//            when absent); along X and Y the way of DIALux (decided on 21 Nov 2026): 'in' — cells
//            of equal size, a luminaire in every cell centre (version 1, the default), 'edge' — the
//            housings of the outer luminaires at the edges of the area, 'axis' — the axes of the
//            outer luminaires on the edges; one luminaire along an axis: the middle
//   line    { x0, y0, x1, y1, n, hm, hm1, psi, m? } — n luminaires from P0 to P1 the same ways
//            ('axis' — evenly from P0 to P1, the default; one: the middle); mounting heights from
//            hm at P0 to hm1 at P1; ψ counts from the direction P0 → P1
//   circle  { cx, cy, r, n, hm, psi, a0?, a1? } — n luminaires on the arc from a0 to a1 (degrees
//            from +X, counter-clockwise; 0 and 360 when absent): the full circle at the angles
//            a0 + k·(a1 − a0)/n, an arc from end to end (one: its middle); ψ counts from the
//            radius (90°: along the tangent)
//   single  { points: [{ x, y, hm, psi, tx?, ty? }] } — every luminaire with its own height and rotation
//
// Tilt (stage 2.1a, 25 Nov 2026): tx, ty — about the luminaire's own C0 and C90 axes, degrees,
// −90…90; R = Rz(ψ)·Ry(ty)·Rx(tx) (direct.lumMatrix). Every kind of group carries one tx, ty for
// each of its luminaires; a point carries them only when not zero (files and tests of version 2.1
// stay as they were).

/** Kinds of groups. */
export const GROUP_KINDS = Object.freeze(['single', 'grid', 'line', 'circle']);
/** Ways of spacing along an axis of a grid or along a line. */
export const SPACINGS = Object.freeze(['in', 'edge', 'axis']);

/**
 * Offsets of n luminaires along a segment of length len from its start (decided on 21 Nov 2026):
 * 'in' — cell centres, 'edge' — the housings (half size h along the segment) at the ends, 'axis'
 * — the axes at the ends; one luminaire: the middle.
 */
export function spacing(n, len, way, h = 0) {
  if (n === 1) return [len / 2];
  if (way === 'in') return Array.from({ length: n }, (_, i) => ((i + 0.5) * len) / n);
  const s = way === 'edge' ? Math.min(h, len / 2) : 0;
  return Array.from({ length: n }, (_, i) => s + (i * (len - 2 * s)) / (n - 1));
}

/** True when the arc of a circle group is the full circle. */
export const fullCircle = (g) => (g.a1 ?? 360) - (g.a0 ?? 0) >= 360 - 1e-9;

import { lumMatrix } from './direct.js';

const DEG = Math.PI / 180;
/** Lengths closer than this are equal (m); also the tolerance of the placement check. */
export const GEO_EPS = 1e-9;

/** The tilt fields of a point: { tx, ty } when either is not zero, otherwise nothing. */
export const tiltOf = (tx = 0, ty = 0) => (tx || ty ? { tx: tx || 0, ty: ty || 0 } : {});

/** Angle in degrees reduced to [0, 360). */
export const wrapDeg = (a) => { const r = a % 360; return r < 0 ? r + 360 : r + 0; };

/**
 * Mounting points of a group, in the order of the luminaires.
 * @param {object} g — group
 * @param {{ L: number, W: number }} room — size of the room (the area of a grid without its own)
 * @param {{ a: number, b: number }|null} [size] — the housing in plan (a along C0, b along C90) of
 *   the type of the group: the way 'edge' keeps it inside the area or the line (none: as 'axis')
 * @returns {{ x, y, hm, psi }[]}
 */
export function groupPoints(g, room, size = null) {
  const pts = basePoints(g, room, size);
  // luminaires moved within their group (25 Nov 2026): offsets from their own place
  if (g.offs && g.kind !== 'single') {
    for (const [k, o] of Object.entries(g.offs)) {
      const p = pts[Number(k)];
      if (!p) continue;
      pts[Number(k)] = { x: p.x + (o.dx ?? 0), y: p.y + (o.dy ?? 0), hm: p.hm + (o.dz ?? 0), psi: wrapDeg(p.psi + (o.dpsi ?? 0)), ...tiltOf((p.tx ?? 0) + (o.dtx ?? 0), (p.ty ?? 0) + (o.dty ?? 0)) };
    }
  }
  return pts;
}

/** The places of the luminaires of a group, without the offsets of moved ones. */
export function basePoints(g, room, size = null) {
  switch (g.kind) {
    case 'grid': {
      const out = [];
      const a = g.area, mx = g.mx ?? 'in', my = g.my ?? 'in', tl = tiltOf(g.tx, g.ty);
      if (mx === 'in' && my === 'in' && !g.xs && !g.ys) {
        for (let j = 0; j < g.ny; j++) {
          for (let i = 0; i < g.nx; i++) {
            // without an area: the expressions of photometry.luminaireGrid (version 1 bit for bit)
            const x = a ? a.x0 + (i + 0.5) * (a.x1 - a.x0) / g.nx : (i + 0.5) * room.L / g.nx;
            const y = a ? a.y0 + (j + 0.5) * (a.y1 - a.y0) / g.ny : (j + 0.5) * room.W / g.ny;
            out.push({ x, y, hm: g.hm, psi: g.psi, ...tl });
          }
        }
        return out;
      }
      const ar = a ?? { x0: 0, y0: 0, x1: room.L, y1: room.W };
      const [hx, hy] = housingHalf(size, g.psi);
      // own offsets of the axes from the area start (axes dragged on the view, 25 Nov 2026)
      const xs = g.xs ?? spacing(g.nx, ar.x1 - ar.x0, mx, hx), ys = g.ys ?? spacing(g.ny, ar.y1 - ar.y0, my, hy);
      for (const y of ys) for (const x of xs) out.push({ x: ar.x0 + x, y: ar.y0 + y, hm: g.hm, psi: g.psi, ...tl });
      return out;
    }
    case 'line': {
      const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
      const dir = dx || dy ? Math.atan2(dy, dx) / DEG : 0;
      const way = g.m ?? 'axis', tl = tiltOf(g.tx, g.ty);
      const out = [];
      if (way === 'axis' && !g.ts) {
        for (let k = 0; k < g.n; k++) {
          const t = g.n === 1 ? 0.5 : k / (g.n - 1);
          out.push({ x: g.x0 + t * dx, y: g.y0 + t * dy, hm: g.hm + t * (g.hm1 - g.hm), psi: wrapDeg(dir + g.psi), ...tl });
        }
        return out;
      }
      const len = Math.hypot(dx, dy);
      // half of the housing along the line: ψ counts from its direction
      const h = size ? housingHalf(size, g.psi)[0] : 0;
      // own distances from the start (luminaires dragged along the line, 25 Nov 2026)
      for (const d of g.ts ?? spacing(g.n, len, way, h)) {
        const t = len > 0 ? d / len : 0.5;
        out.push({ x: g.x0 + t * dx, y: g.y0 + t * dy, hm: g.hm + t * (g.hm1 - g.hm), psi: wrapDeg(dir + g.psi), ...tl });
      }
      return out;
    }
    case 'circle': {
      const out = [], tl = tiltOf(g.tx, g.ty);
      const a0 = g.a0 ?? 0, a1 = g.a1 ?? 360, full = fullCircle(g);
      for (let k = 0; k < g.n; k++) {
        const a = full ? (a0 === 0 && a1 === 360 ? (360 * k) / g.n : a0 + (k * (a1 - a0)) / g.n)
          : g.n === 1 ? (a0 + a1) / 2 : a0 + (k * (a1 - a0)) / (g.n - 1);
        out.push({ x: g.cx + g.r * Math.cos(a * DEG), y: g.cy + g.r * Math.sin(a * DEG), hm: g.hm, psi: wrapDeg(a + g.psi), ...tl });
      }
      return out;
    }
    case 'single':
      return g.points.map((p) => ({ x: p.x, y: p.y, hm: p.hm, psi: p.psi, ...tiltOf(p.tx, p.ty) }));
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

/**
 * Plan extent of a tilted housing (stage 2.1a): the box a × b × h (a along C0, b along C90, h down
 * from the mounting point) turned by R = Rz(ψ)·Ry(ty)·Rx(tx) about the mounting point; returns
 * [x0, x1, y0, y1] relative to the mounting point. Not tilted: ± housingHalf.
 */
export function housingExtent(size, psiDeg, txDeg = 0, tyDeg = 0) {
  if (!size) return [0, 0, 0, 0];
  if (!txDeg && !tyDeg) { const [hx, hy] = housingHalf(size, psiDeg); return [-hx, hx, -hy, hy]; }
  const R = lumMatrix({ psi: psiDeg * DEG, tx: txDeg * DEG, ty: tyDeg * DEG });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const u of [-size.a / 2, size.a / 2]) for (const v of [-size.b / 2, size.b / 2]) for (const w of [0, -(size.h || 0)]) {
    const x = R[0] * u + R[1] * v + R[2] * w, y = R[3] * u + R[4] * v + R[5] * w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, x1, y0, y1];
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

/**
 * The arc of a circle group from the angles typed (decided on 21 Nov 2026): a0 reduced to
 * [0, 360), a1 in (a0, a0 + 360] (a1 below a0 or equal: + 360).
 * @returns {[number, number]}
 */
export function normArc(a0, a1) {
  const b0 = wrapDeg(a0);
  let b1 = a1 - (a0 - b0);
  while (b1 <= b0 + 1e-9) b1 += 360;
  while (b1 > b0 + 360 + 1e-9) b1 -= 360;
  return [b0, +b1.toFixed(9)];
}

/** A circle group turned as a whole by d degrees about its centre: both angles move (E on the plan). */
export function turnArc(g, d) {
  const [a0, a1] = normArc((g.a0 ?? 0) + d, (g.a1 ?? 360) + d);
  return a0 === 0 && a1 === 360 ? (({ a0: _, a1: __, ...r }) => r)(g) : { ...g, a0, a1 };
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
export function ungroup(g, room, size = null) {
  return { id: g.id, type: g.type, kind: 'single', points: groupPoints(g, room, size) };
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
