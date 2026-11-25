// Stage 2.1: the plan editor — picking, selection, snapping, moving within the walls, deleting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planItems, pickAt, selectionOf, combine, boxSelection, selectedItems, snapValue, clampDelta, dragDelta,
  moveSelection, deleteSelection, emptySelection, isEmpty, isSelected, cleanPlanGrid, PLAN_GRID, snapPoint, rotateSelection, replaceType,
} from '../js/planedit.js';
import { modelFromValues, addGroup, replaceGroup, cleanModel, planGrid, placementErrors } from '../js/model.js';
import { groupPoints } from '../js/groups.js';
import { DEFAULTS } from '../js/ui.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
function model() {
  let m = modelFromValues({ ...DEFAULTS });                     // 6 × 4, grid 3 × 2 of t1
  m = addGroup(m, 'single', 't1').model;                        // g2
  m = replaceGroup(m, 'g2', { ...m.groups[1], points: [{ x: 0.5, y: 0.5, hm: 3, psi: 0 }, { x: 5.5, y: 3.5, hm: 3, psi: 90 }] });
  return m;
}
const size = () => ({ a: 0.6, b: 0.2 });

test('items, picking and the selection of one luminaire', () => {
  const m = model(), items = planItems(m, size);
  assert.equal(items.length, 8);
  assert.deepEqual([items[7].hx, items[7].hy].map((v) => Math.round(v * 1e9) / 1e9), [0.1, 0.3]); // turned by 90°
  const grid = pickAt(items, 1.1, 1.05, 0.02);                  // a grid luminaire at (1, 1)
  assert.deepEqual([grid.group, grid.index], ['g1', 0]);
  assert.equal(pickAt(items, 3, 2, 0.02), null);
  const s = selectionOf(grid);
  assert.ok(s.groups.has('g1') && isSelected(s, 'g1', 5, 'grid'));   // the whole group
  const one = selectionOf(pickAt(items, 5.45, 3.7, 0));
  assert.ok(!one.groups.size && one.points.get('g2').has(1) && !isSelected(one, 'g2', 0, 'single'));
  assert.ok(isEmpty(emptySelection()) && !isEmpty(one));
  const both = combine(s, one);
  assert.equal(selectedItems(items, both).length, 7);
  assert.equal(selectedItems(items, combine(both, s, 'toggle')).length, 1);
});

test('a rectangle: left to right a window, right to left crossing; a group whole by one of its luminaires', () => {
  const items = planItems(model(), size);
  let s = boxSelection(items, 0, 0, 3.2, 4);                    // a window over the left half
  assert.ok(s.groups.has('g1'));                                // a grid luminaire wholly inside: the whole grid
  assert.deepEqual([...s.points.get('g2')], [0]);
  s = boxSelection(items, 0, 0, 0.05, 0.05);                    // a window too small for any housing
  assert.ok(isEmpty(s));
  const it = items.find((x) => x.group === 'g2' && x.index === 1);
  // crossing: touching the housing is enough; a window around its centre only is not
  s = boxSelection(items, it.x + it.hx - 0.01, it.y + 0.01, it.x + it.hx + 0.5, it.y - 0.01);
  assert.ok(isEmpty(s) || !s.points.get('g2')?.has(1));
  s = boxSelection(items, it.x + it.hx + 0.5, it.y + 0.01, it.x + it.hx - 0.01, it.y - 0.01);
  assert.ok(s.points.get('g2')?.has(1));
});

test('snapping to the plan grid with its own steps and origin', () => {
  assert.ok(near(snapValue(1.234, 0.1), 1.2));
  assert.ok(near(snapValue(1.26, 0.25, 0.05), 1.3));
  assert.equal(snapValue(1.234, 0), 1.234);
  const items = [{ x: 1, y: 1, hx: 0.3, hy: 0.1 }];
  const g = { sx: 0.5, sy: 0.2, ox: 0, oy: 0.1, snap: true };
  let [dx, dy] = dragDelta({ x: 1, y: 1 }, 0.62, 0.33, g, items, 6, 4);
  assert.ok(near(dx, 0.5) && near(dy, 0.3));                    // to (1.5, 1.3)
  [dx, dy] = dragDelta({ x: 1, y: 1 }, 0.62, 0.33, { ...g, snap: false }, items, 6, 4);
  assert.ok(near(dx, 0.62) && near(dy, 0.33));
});

test('dragging stops at the wall: half the housing along each axis', () => {
  const items = [{ x: 1, y: 1, hx: 0.3, hy: 0.1 }, { x: 4, y: 2, hx: 0.1, hy: 0.3 }];
  let [dx, dy] = clampDelta(items, -5, -5, 6, 4);
  assert.ok(near(dx, -0.7) && near(dy, -0.9));                  // the first stops at x = 0.3, y = 0.1
  [dx, dy] = clampDelta(items, 5, 5, 6, 4);
  assert.ok(near(dx, 1.9) && near(dy, 1.7));                    // the second at x = 5.9, y = 3.7
  // an item already through a wall does not hold the move away from it
  [dx] = clampDelta([{ x: 0.1, y: 1, hx: 0.3, hy: 0.1 }], 1, 0, 6, 4);
  assert.equal(dx, 1);
  [dx] = clampDelta([{ x: 0.1, y: 1, hx: 0.3, hy: 0.1 }], -1, 0, 6, 4);
  assert.equal(dx, 0);
});

test('moving and deleting a selection; the model stays valid', () => {
  const m = model(), items = planItems(m, size);
  const s = combine(selectionOf(pickAt(items, 1, 1, 0)), selectionOf(pickAt(items, 0.5, 0.5, 0)));
  const moved = moveSelection(m, s, 0.3, 0.2);
  const g = groupPoints(moved.groups[0], { L: 6, W: 4 });
  assert.ok(near(g[0].x, 1.3) && near(g[0].y, 1.2));
  assert.deepEqual(moved.groups[0].area, { x0: 0.3, y0: 0.2, x1: 6.3, y1: 4.2 });
  assert.deepEqual(moved.groups[1].points.map((p) => [p.x, p.y]), [[0.8, 0.7], [5.5, 3.5]]);
  assert.deepEqual(placementErrors(moved, size), []);
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(moved))), moved);
  assert.equal(moveSelection(m, s, 0, 0), m);
  // delete: the grid and one single luminaire
  const d = deleteSelection(m, s);
  assert.deepEqual(d.groups.map((x) => x.id), ['g2']);
  assert.equal(d.groups[0].points.length, 1);
  assert.equal(deleteSelection(m, emptySelection()), m);
  // everything: the room is left empty
  const all = combine(selectionOf({ group: 'g1', kind: 'grid' }), { groups: new Set(), points: new Map([['g2', new Set([0, 1])]]) });
  assert.deepEqual(deleteSelection(m, all).groups, []);      // a room may have no luminaires
});

test('the plan grid is kept in the room and cleaned when read', () => {
  const m = model();
  assert.deepEqual(planGrid(m), { ...PLAN_GRID });
  const withGrid = { ...m, plan: { sx: 0.6, sy: 0.3, ox: 0.1, oy: 0, show: false, snap: false, modes: { grid: true, vertex: false, mid: true, centre: false } } };
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(withGrid))).plan, withGrid.plan);
  assert.deepEqual(cleanPlanGrid({ sx: -1, sy: 'a', ox: 2, snap: 1, modes: { mid: false } }),
    { sx: 0.25, sy: 0.25, ox: 2, oy: 0, show: true, snap: true, modes: { grid: true, vertex: true, mid: false, centre: true } });
});

test('snapping: vertices, midpoints and centres within the tolerance, else the grid nodes', () => {
  const g = { ...PLAN_GRID, modes: { ...PLAN_GRID.modes } };
  assert.deepEqual(snapPoint(0.05, 3.97, g, 6, 4, [], 0.1), { x: 0, y: 4, kind: 'vertex' });
  assert.deepEqual(snapPoint(3.04, 0.02, g, 6, 4, [], 0.1), { x: 3, y: 0, kind: 'mid' });
  assert.deepEqual(snapPoint(3.04, 2.02, g, 6, 4, [], 0.1), { x: 3, y: 2, kind: 'centre' });
  assert.deepEqual(snapPoint(1.27, 1.33, g, 6, 4, [{ x: 1.3, y: 1.3 }], 0.1), { x: 1.3, y: 1.3, kind: 'centre' });
  const p = snapPoint(1.37, 1.13, g, 6, 4, [], 0.05);
  assert.ok(near(p.x, 1.25) && near(p.y, 1.25) && p.kind === 'grid');
  assert.equal(snapPoint(0.05, 3.97, { ...g, modes: { ...g.modes, vertex: false } }, 6, 4, [], 0.1).kind, 'grid');
  assert.deepEqual(snapPoint(1.37, 1.13, { ...g, snap: false }, 6, 4, [], 0.1), { x: 1.37, y: 1.13, kind: null });
  assert.deepEqual(snapPoint(1.37, 1.13, { ...g, modes: { grid: false, vertex: true, mid: true, centre: true } }, 6, 4, [], 0.05), { x: 1.37, y: 1.13, kind: null });
});

test('rotating and replacing the type of a selection', () => {
  const m = model(), items = planItems(m, size);
  const s = combine(selectionOf(pickAt(items, 1, 1, 0)), selectionOf(pickAt(items, 5.5, 3.5, 0)));
  const r = rotateSelection(m, s, 45);
  assert.equal(r.groups[0].psi, 45);
  assert.deepEqual(r.groups[1].points.map((p) => p.psi), [0, 135]);
  assert.equal(rotateSelection(m, s, 0), m);
  const withT2 = { ...m, types: [...m.types, { ...m.types[0], id: 't2' }] };
  const x = replaceType(withT2, s, 't2');
  assert.equal(x.model.groups[0].type, 't2');
  assert.deepEqual(x.model.groups.map((g) => [g.id, g.type, g.kind === 'single' ? g.points.length : 0]), [['g1', 't2', 0], ['g2', 't1', 1], ['g3', 't2', 1]]);
  assert.ok(x.sel.groups.has('g1') && x.sel.points.get('g3').has(0));
  assert.equal(replaceType(withT2, selectionOf(pickAt(items, 1, 1, 0)), 't1'), withT2);
});

test('keys of the editor', async () => {
  const { editorKey } = await import('../js/hotkeys.js');
  assert.equal(editorKey({ key: 'z', code: 'KeyZ', ctrlKey: true }), 'undo');
  assert.equal(editorKey({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(editorKey({ key: 'y', code: 'KeyY', ctrlKey: true }), 'redo');
  assert.equal(editorKey({ key: 'я', code: 'KeyZ', ctrlKey: true }), 'undo');    // Russian layout
  assert.equal(editorKey({ key: 'z', code: 'KeyZ', ctrlKey: true }, true), null); // in a field: its own undo
  assert.equal(editorKey({ key: 'Delete' }), 'delete');
  assert.deepEqual(editorKey({ key: 'ArrowUp' }), { move: [0, 1] });
  assert.equal(editorKey({ key: 'ArrowUp', altKey: true }), null);
  assert.equal(editorKey({ key: 'a' }), null);
});

test('gizmo: the arrows, the plane square and the ring in view pixels', async () => {
  const { gizmoHit, planeSquare, constrain, selectionCentre, GIZMO } = await import('../js/planedit.js');
  const g = { o: [100, 100], x: [170, 100], y: [100, 30] };       // X right, Y up on the screen
  assert.equal(gizmoHit('move', [110, 90], g), 'xy');                // inside the plane square
  assert.equal(gizmoHit('move', [150, 103], g), 'x');
  assert.equal(gizmoHit('move', [98, 50], g), 'y');
  assert.equal(gizmoHit('move', [150, 140], g), null);
  assert.equal(gizmoHit('move', [180, 100], g), null);              // past the arrow tip by more than the hit
  // a skewed 3D projection: the square is a parallelogram
  const s = planeSquare([0, 0], [70, 20], [-30, -60]);
  assert.deepEqual(s[2].map((v) => Math.round(v * 100) / 100), [12.8, -12.8]);
  const ring = Array.from({ length: 64 }, (_, k) => [100 + GIZMO.ring * Math.cos(k * Math.PI / 32), 100 + GIZMO.ring * Math.sin(k * Math.PI / 32)]);
  assert.equal(gizmoHit('rotate', [100 + GIZMO.ring + 3, 100], { o: [100, 100], ring }), 'z');
  assert.equal(gizmoHit('rotate', [100, 100], { o: [100, 100], ring }), null);
  assert.equal(gizmoHit('select', [100, 100], g), null);
  assert.deepEqual(constrain('x', 0.3, 0.2), [0.3, 0]);
  assert.deepEqual(constrain('y', 0.3, 0.2), [0, 0.2]);
  assert.deepEqual(constrain('xy', 0.3, 0.2), [0.3, 0.2]);
  assert.deepEqual(selectionCentre([{ x: 1, y: 1, hm: 3 }, { x: 3, y: 2, hm: 2 }]), { x: 2, y: 1.5, z: 2.5 });
  assert.equal(selectionCentre([]), null);
});

test('a luminaire moved within its group: an offset that follows the group, reset and cleaned (25 Nov 2026)', async () => {
  const { offsetLums, resetOffsets, moveSelection } = await import('../js/planedit.js');
  const room = { L: 6, W: 4 };
  const g = { id: 'g', type: 't', kind: 'line', x0: 1, y0: 2, x1: 5, y1: 2, n: 3, hm: 3, hm1: 3, psi: 0 };
  const g2 = offsetLums(g, new Set([1]), { dx: 0.5, dz: -0.2 });
  assert.deepEqual(g2.offs, { 1: { dx: 0.5, dz: -0.2 } });
  const p = groupPoints(g2, room);
  assert.ok(Math.abs(p[1].x - 3.5) < 1e-9 && Math.abs(p[1].hm - 2.8) < 1e-9 && p[0].x === 1);
  // the group moved: the luminaire keeps its offset from its own place
  const m = { room: { H: 3, shape: { L: 6, W: 4 } }, types: [], groups: [g2] };
  const moved = moveSelection(m, { groups: new Set(['g']), points: new Map() }, 0, 1).groups[0];
  assert.ok(Math.abs(groupPoints(moved, room)[1].y - 3) < 1e-9 && Math.abs(groupPoints(moved, room)[1].x - 3.5) < 1e-9);
  // within the group: the selection writes the offset
  const within = moveSelection(m, { groups: new Set(), points: new Map([['g', new Set([1])]]) }, 0.5, 0).groups[0];
  assert.deepEqual(within.offs, { 1: { dx: 1, dz: -0.2 } });
  const back = resetOffsets(m, { groups: new Set(), points: new Map([['g', new Set([1])]]) });
  assert.equal(back.groups[0].offs, undefined);
  // a file: offsets of luminaires that do not exist go
  const f = JSON.parse(JSON.stringify(modelFromValues(DEFAULTS)));
  f.groups = [{ ...g, type: f.types[0].id, offs: { 1: { dx: 0.5 }, 7: { dx: 1 }, x: 2 } }];
  const cm = cleanModel(f);
  assert.deepEqual(cm.groups[0].offs, { 1: { dx: 0.5 } });
});

test('snaps as in 3ds Max: preview within 30 px, snapped within 20 px; reset of a layout (25 Nov 2026)', async () => {
  const { snapNear, resetLayout, PLAN_GRID } = await import('../js/planedit.js');
  const grid = { ...PLAN_GRID, modes: { grid: false, vertex: true, mid: true, centre: true } };
  const lum = { x: 2, y: 2, a: 0.4, b: 0.2, psi: 0 };
  // 1 px = 0.01 m: 30 px = 0.3 m, 20 px = 0.2 m
  assert.deepEqual(snapNear(2.25, 2, grid, 6, 4, [lum], 0.3, 0.2), { x: 2.2, y: 2, kind: 'mid', snapped: true });
  assert.equal(snapNear(2.45, 2.0, grid, 6, 4, [lum], 0.3, 0.2).snapped, false);
  assert.equal(snapNear(3.5, 1, grid, 6, 4, [lum], 0.3, 0.2), null);
  const gridOn = { ...PLAN_GRID };
  assert.equal(snapNear(3.51, 1.02, gridOn, 6, 4, [], 0.3, 0.2).kind, 'grid');
  const m = { groups: [{ id: 'g', kind: 'line', ts: [1], offs: { 0: { dx: 1 } } }, { id: 'h', kind: 'grid', xs: [1, 2] }] };
  const r = resetLayout(m, { groups: new Set(['g']), points: new Map() });
  assert.deepEqual(r.groups[0], { id: 'g', kind: 'line' });
  assert.equal(r.groups[1], m.groups[1]);
});
