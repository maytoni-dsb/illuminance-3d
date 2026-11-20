// Stage 2.1: the plan editor — picking, selection, snapping, moving within the walls, deleting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planItems, pickAt, selectionOf, combine, boxSelection, selectedItems, snapValue, clampDelta, dragDelta,
  moveSelection, deleteSelection, emptySelection, isEmpty, isSelected, cleanPlanGrid, PLAN_GRID,
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

test('a rectangle selects single luminaires inside and groups wholly inside', () => {
  const items = planItems(model(), size);
  let s = boxSelection(items, 0, 0, 3.2, 4);                    // the left half: two grid columns, one single
  assert.ok(!s.groups.has('g1'));
  assert.deepEqual([...s.points.get('g2')], [0]);
  s = boxSelection(items, 6, 4, 0.8, 0.8);                      // the whole grid, the second single
  assert.ok(s.groups.has('g1'));
  assert.deepEqual([...s.points.get('g2')], [1]);
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
  // everything: the last luminaire stays
  const all = combine(selectionOf({ group: 'g1', kind: 'grid' }), { groups: new Set(), points: new Map([['g2', new Set([0, 1])]]) });
  assert.equal(deleteSelection(m, all), null);
});

test('the plan grid is kept in the room and cleaned when read', () => {
  const m = model();
  assert.deepEqual(planGrid(m), PLAN_GRID);
  const withGrid = { ...m, plan: { sx: 0.6, sy: 0.3, ox: 0.1, oy: 0, snap: false } };
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(withGrid))).plan, withGrid.plan);
  assert.deepEqual(cleanPlanGrid({ sx: -1, sy: 'a', ox: 2, snap: 1 }), { sx: 0.1, sy: 0.1, ox: 2, oy: 0, snap: true });
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
