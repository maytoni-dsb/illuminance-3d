// Plan editor (stage 2.1, spec v2 "Stage 2.1"): picking, selection, snapping, moving within the
// walls and deleting luminaires on the plan. Pure module: no DOM, tested in Node
// (tests/planedit.test.mjs); the page routes the pointer and the keys here.
//
// Decided on 20 Nov 2026: a luminaire of a group moves its whole group (ungroup first to move one);
// the plan grid has its own steps along X and Y and an origin, snapping is switched on and off;
// dragging stops at the wall: the housing keeps half its size along each axis from it.
//
// A selection is { groups: Set<groupId>, points: Map<groupId, Set<index>> } — whole groups, and
// luminaires of groups of single luminaires.

import { groupPoints, housingHalf, moveGroup, movePoints, turnLuminaires } from './groups.js';

/**
 * Defaults of the plan grid and snapping: steps along X and Y, origin (m), the grid shown, snapping
 * on, and the snaps: grid nodes, vertices (corners of the room), midpoints of the walls, centres
 * (of the room and of the luminaires).
 */
export const PLAN_GRID = Object.freeze({ sx: 0.25, sy: 0.25, ox: 0, oy: 0, show: true, snap: true, modes: Object.freeze({ grid: true, vertex: true, mid: true, centre: true }) });

/** An empty selection. */
export const emptySelection = () => ({ groups: new Set(), points: new Map() });
export const isEmpty = (s) => !s.groups.size && ![...s.points.values()].some((x) => x.size);

/** True when the luminaire (group, index) of a group of kind `kind` is selected. */
export function isSelected(s, group, index, kind) {
  return s.groups.has(group) || (kind === 'single' && !!s.points.get(group)?.has(index));
}

/**
 * Items of the plan: every luminaire with its mounting point and the half sizes of its housing.
 * @param {(type) => ({ a, b }|null)} sizeOf — housing of a type (a along C0, b along C90)
 * @returns {{ group, kind, type, index, x, y, psi, hx, hy, a, b }[]}
 */
export function planItems(m, sizeOf = () => null) {
  const room = { L: m.room.shape.L, W: m.room.shape.W };
  const types = new Map(m.types.map((ty) => [ty.id, ty]));
  const out = [];
  for (const g of m.groups) {
    const size = sizeOf(types.get(g.type)) ?? null;
    groupPoints(g, room).forEach((p, index) => {
      const [hx, hy] = housingHalf(size, p.psi);
      out.push({ group: g.id, kind: g.kind, type: g.type, index, x: p.x, y: p.y, psi: p.psi, hx, hy, a: size?.a ?? 0, b: size?.b ?? 0 });
    });
  }
  return out;
}

/**
 * The item under the point (x, y): its housing box widened by `tol` (m) contains the point; of
 * several the nearest centre wins, the last drawn on a tie.
 */
export function pickAt(items, x, y, tol) {
  let best = null, bd = Infinity;
  for (const it of items) {
    if (Math.abs(x - it.x) > it.hx + tol || Math.abs(y - it.y) > it.hy + tol) continue;
    const d = Math.hypot(x - it.x, y - it.y);
    if (d <= bd) { bd = d; best = it; }
  }
  return best;
}

/** The selection of one item: its group, or the luminaire of a group of single luminaires. */
export function selectionOf(it) {
  const s = emptySelection();
  if (!it) return s;
  if (it.kind === 'single') s.points.set(it.group, new Set([it.index])); else s.groups.add(it.group);
  return s;
}

/** Union (add) or symmetric difference (toggle) of two selections. */
export function combine(a, b, mode = 'add') {
  const s = { groups: new Set(a.groups), points: new Map([...a.points].map(([k, v]) => [k, new Set(v)])) };
  for (const g of b.groups) { if (mode === 'toggle' && s.groups.has(g)) s.groups.delete(g); else s.groups.add(g); }
  for (const [g, idx] of b.points) {
    const set = s.points.get(g) ?? new Set();
    for (const i of idx) { if (mode === 'toggle' && set.has(i)) set.delete(i); else set.add(i); }
    s.points.set(g, set);
  }
  return s;
}

/**
 * Selection of a rectangle on the plan: single luminaires whose mounting point lies inside, and
 * groups whose every luminaire lies inside.
 */
export function boxSelection(items, x0, y0, x1, y1) {
  const [xa, xb] = x0 < x1 ? [x0, x1] : [x1, x0], [ya, yb] = y0 < y1 ? [y0, y1] : [y1, y0];
  const inside = (it) => it.x >= xa && it.x <= xb && it.y >= ya && it.y <= yb;
  const s = emptySelection(), all = new Map();
  for (const it of items) {
    if (it.kind === 'single') {
      if (inside(it)) { if (!s.points.has(it.group)) s.points.set(it.group, new Set()); s.points.get(it.group).add(it.index); }
    } else {
      all.set(it.group, (all.get(it.group) ?? true) && inside(it));
    }
  }
  for (const [g, ok] of all) if (ok) s.groups.add(g);
  return s;
}

/** The items a selection moves. */
export const selectedItems = (items, s) => items.filter((it) => isSelected(s, it.group, it.index, it.kind));

/** A value snapped to the nearest node origin + k · step. */
export const snapValue = (v, step, origin = 0) => (step > 0 ? origin + Math.round((v - origin) / step) * step : v);

/**
 * The move (dx, dy) limited so that every housing box stays in the room L × W (dragging stops at
 * the wall). Items already outside do not limit the move away from that wall.
 */
export function clampDelta(items, dx, dy, L, W) {
  let lo = -Infinity, hi = Infinity, lo2 = -Infinity, hi2 = Infinity;
  for (const it of items) {
    lo = Math.max(lo, Math.min(0, it.hx - it.x)); hi = Math.min(hi, Math.max(0, L - it.hx - it.x));
    lo2 = Math.max(lo2, Math.min(0, it.hy - it.y)); hi2 = Math.min(hi2, Math.max(0, W - it.hy - it.y));
  }
  const cl = (v, a, b) => (a > b ? 0 : Math.min(b, Math.max(a, v)));
  return [items.length ? cl(dx, lo, hi) : dx, items.length ? cl(dy, lo2, hi2) : dy];
}

/**
 * The move of a drag: the anchor (the luminaire taken) goes to the pointer offset, snapped to the
 * plan grid when snapping is on, then the move is limited by the walls.
 * @param {{ x, y }} anchor — the luminaire taken, as it was when the drag started
 * @param {number} dx, dy — pointer offset from the start, m
 */
export function dragDelta(anchor, dx, dy, grid, items, L, W) {
  let ex = dx, ey = dy;
  if (grid.snap) {
    ex = snapValue(anchor.x + dx, grid.sx, grid.ox) - anchor.x;
    ey = snapValue(anchor.y + dy, grid.sy, grid.oy) - anchor.y;
  }
  return clampDelta(items, ex, ey, L, W);
}

/** The model with the selection moved by (dx, dy). */
export function moveSelection(m, s, dx, dy) {
  if (!dx && !dy) return m;
  const room = { L: m.room.shape.L, W: m.room.shape.W };
  const r = (v) => Math.round(v * 1e9) / 1e9; // no float noise in the fields
  const tidy = (g) => JSON.parse(JSON.stringify(g), (k, v) => (typeof v === 'number' && /^(x|y|x0|y0|x1|y1|cx|cy)$/.test(k) ? r(v) : v));
  return {
    ...m,
    groups: m.groups.map((g) => {
      if (s.groups.has(g.id)) return tidy(moveGroup(g, dx, dy, room));
      const idx = s.points.get(g.id);
      if (idx?.size && g.kind === 'single') return tidy(movePoints(g, [...idx], dx, dy));
      return g;
    }),
  };
}

/**
 * The model without the selection: whole groups, and single luminaires (a group of single
 * luminaires left empty goes too). The last luminaire of the room stays: null.
 */
export function deleteSelection(m, s) {
  const groups = [];
  let changed = false;
  for (const g of m.groups) {
    if (s.groups.has(g.id)) { changed = true; continue; }
    const idx = s.points.get(g.id);
    if (idx?.size && g.kind === 'single') {
      const points = g.points.filter((_, k) => !idx.has(k));
      if (points.length !== g.points.length) changed = true;
      if (points.length) groups.push(points.length === g.points.length ? g : { ...g, points });
      continue;
    }
    groups.push(g);
  }
  if (!changed) return m;
  return groups.length ? { ...m, groups } : null;
}

/** Cleans a plan grid read from a file; a wrong value gets its default. */
export function cleanPlanGrid(g) {
  const d = PLAN_GRID, num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : def);
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  if (!g || typeof g !== 'object') return { ...d, modes: { ...d.modes } };
  const m = g.modes && typeof g.modes === 'object' ? g.modes : {};
  return {
    sx: num(g.sx, 0.001, 100, d.sx), sy: num(g.sy, 0.001, 100, d.sy), ox: num(g.ox, -1000, 1000, d.ox), oy: num(g.oy, -1000, 1000, d.oy),
    show: bool(g.show, d.show), snap: bool(g.snap, d.snap),
    modes: { grid: bool(m.grid, d.modes.grid), vertex: bool(m.vertex, d.modes.vertex), mid: bool(m.mid, d.modes.mid), centre: bool(m.centre, d.modes.centre) },
  };
}

/**
 * A point of the plan snapped (decided on 20 Nov 2026): the nearest vertex of the room, midpoint of
 * a wall or centre (of the room, of a luminaire not being moved) within `tol` metres wins; else the
 * nearest node of the grid; with snapping off the point itself.
 * @param {{ x, y }[]} centres — centres of the luminaires that may be snapped to
 * @returns {{ x, y, kind: 'vertex' | 'mid' | 'centre' | 'grid' | null }}
 */
export function snapPoint(x, y, grid, L, W, centres, tol) {
  if (!grid.snap) return { x, y, kind: null };
  const m = grid.modes ?? PLAN_GRID.modes;
  const cand = [];
  if (m.vertex) for (const [a, b] of [[0, 0], [L, 0], [L, W], [0, W]]) cand.push([a, b, 'vertex']);
  if (m.mid) for (const [a, b] of [[L / 2, 0], [L, W / 2], [L / 2, W], [0, W / 2]]) cand.push([a, b, 'mid']);
  if (m.centre) { cand.push([L / 2, W / 2, 'centre']); for (const c of centres) cand.push([c.x, c.y, 'centre']); }
  let best = null, bd = tol;
  for (const [a, b, kind] of cand) { const d = Math.hypot(a - x, b - y); if (d <= bd) { bd = d; best = { x: a, y: b, kind }; } }
  if (best) return best;
  if (m.grid) return { x: snapValue(x, grid.sx, grid.ox), y: snapValue(y, grid.sy, grid.oy), kind: 'grid' };
  return { x, y, kind: null };
}

/** The model with the luminaires of the selection turned by dpsi degrees about their own axes. */
export function rotateSelection(m, s, dpsi) {
  if (!dpsi) return m;
  return {
    ...m,
    groups: m.groups.map((g) => {
      if (s.groups.has(g.id)) return turnLuminaires(g, dpsi);
      const idx = s.points.get(g.id);
      return idx?.size && g.kind === 'single' ? turnLuminaires(g, dpsi, [...idx]) : g;
    }),
  };
}

/**
 * The selection given another luminaire type (dialog "List", "Replace"): whole groups take the
 * type; selected single luminaires of a group move to a new group of single luminaires of that
 * type (the rest keep theirs). Returns { model, sel } with the selection of the same luminaires,
 * or the model itself when nothing changes.
 */
export function replaceType(m, s, type) {
  let changed = false;
  const groups = [], nsel = emptySelection();
  const used = new Set(m.groups.map((g) => g.id));
  const nid = () => { for (let k = 1; ; k++) if (!used.has(`g${k}`)) { used.add(`g${k}`); return `g${k}`; } };
  for (const g of m.groups) {
    if (s.groups.has(g.id)) {
      if (g.type !== type) changed = true;
      groups.push(g.type === type ? g : { ...g, type });
      nsel.groups.add(g.id);
      continue;
    }
    const idx = s.points.get(g.id);
    if (g.kind === 'single' && idx?.size && g.type !== type) {
      const keep = g.points.filter((_, k) => !idx.has(k)), take = g.points.filter((_, k) => idx.has(k));
      changed = true;
      if (keep.length) groups.push({ ...g, points: keep });
      const id = keep.length ? nid() : g.id;
      groups.push({ id, type, kind: 'single', points: take });
      nsel.points.set(id, new Set(take.map((_, k) => k)));
      continue;
    }
    if (idx?.size) nsel.points.set(g.id, new Set(idx));
    groups.push(g);
  }
  return changed ? { model: { ...m, groups }, sel: nsel } : m;
}
