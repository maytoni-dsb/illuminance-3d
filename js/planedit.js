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

import { groupPoints, housingHalf, moveGroup, movePoints } from './groups.js';

/** Defaults of the plan grid: steps along X and Y, origin, snapping (m). */
export const PLAN_GRID = Object.freeze({ sx: 0.1, sy: 0.1, ox: 0, oy: 0, snap: true });

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
  if (!g || typeof g !== 'object') return { ...d };
  return { sx: num(g.sx, 0.001, 100, d.sx), sy: num(g.sy, 0.001, 100, d.sy), ox: num(g.ox, -1000, 1000, d.ox), oy: num(g.oy, -1000, 1000, d.oy), snap: typeof g.snap === 'boolean' ? g.snap : d.snap };
}
