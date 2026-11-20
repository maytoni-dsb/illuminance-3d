// Stage 2.1: the edits of the model by the page (types, groups) and the fields of a group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modelFromValues, roomValues, typeValues, applyRoomValues, applyTypeValues, withTypeFile, renameType, addType, removeType,
  addGroup, replaceGroup, removeGroup, duplicateGroup, ungroupGroup, formValues, lumCount, typeLetter, cleanModel, placementErrors,
} from '../js/model.js';
import { validateGroup, groupFieldValues, GROUP_FIELDS } from '../js/groupform.js';
import { groupPoints } from '../js/groups.js';
import { setLang } from '../js/i18n.js';
import { DEFAULTS } from '../js/ui.js';

setLang('ru');
const room = { L: 6, W: 4 };

test('types: add, values, file, name, remove only when unused', () => {
  let m = modelFromValues({ ...DEFAULTS });
  const r = addType(m);
  assert.equal(r.id, 't2');
  m = applyTypeValues(r.model, 't2', { phot: 'file', flux: 1234, cct: 4000, power: 9 });
  assert.deepEqual(typeValues(m.types[1]), { phot: 'cosine', flux: 1234, cct: 4000, power: 9 }); // no file: cosine
  m = withTypeFile(m, 't2', { name: 'a.ldt', text: 'x', set: 0 });
  m = applyTypeValues(m, 't2', { phot: 'file', flux: 1234, cct: 4000, power: 9 });
  assert.equal(m.types[1].photometry, 'file');
  assert.equal(withTypeFile(m, 't2', null).types[1].photometry, 'cosine');
  m = renameType(m, 't2', '  Downlight  ');
  assert.equal(m.types[1].name, 'Downlight');
  assert.equal(renameType(m, 't2', ' ').types[1].name, undefined);
  assert.equal(removeType(m, 't1'), null);                 // used by the grid
  assert.deepEqual(removeType(m, 't2').types.map((t) => t.id), ['t1']);
  assert.equal(removeType(modelFromValues(DEFAULTS), 't1'), null); // the last one
  assert.deepEqual([0, 1, 25, 26, 27, 701, 702].map(typeLetter), ['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('room values: the mounting heights equal to the room height follow it', () => {
  let m = modelFromValues({ ...DEFAULTS, H: 3 });
  m = addGroup(m, 'single', 't1').model;
  m = replaceGroup(m, 'g2', { ...m.groups[1], points: [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2, y: 2, hm: 2.5, psi: 0 }] });
  m = addGroup(m, 'circle', 't1').model;
  const v = { ...roomValues(m), H: 3.5, L: 7 };
  const n = applyRoomValues(m, v);
  assert.equal(n.room.H, 3.5);
  assert.equal(n.room.shape.L, 7);
  assert.deepEqual([n.groups[0].hm, n.groups[1].points[0].hm, n.groups[1].points[1].hm, n.groups[2].hm], [3.5, 3.5, 2.5, 3.5]);
  assert.deepEqual(roomValues(n), v);
  // the form of version 1 still shows a model whose first group is not a grid
  const f = formValues({ ...m, groups: [m.groups[1]] });
  assert.deepEqual([f.nx, f.ny, f.hm], [2, 1, 3]);
});

test('groups: add every kind inside the room, duplicate, ungroup, remove', () => {
  let m = modelFromValues({ ...DEFAULTS });
  for (const k of ['grid', 'line', 'lines', 'circle', 'single']) {
    const r = addGroup(m, k, 't1');
    m = r.model;
    assert.equal(m.groups.at(-1).id, r.id);
    assert.equal(m.groups.at(-1).kind, k);
  }
  assert.deepEqual(placementErrors(m), []);
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(m))), m);
  const d = duplicateGroup(m, 'g4', 0.5, 0.5);                 // the circle
  assert.equal(d.model.groups[4].id, d.id);
  const a = groupPoints(m.groups[3], room), b = groupPoints(d.model.groups[4], room);
  b.forEach((p, k) => assert.ok(Math.abs(p.x - a[k].x - 0.5) < 1e-12 && Math.abs(p.y - a[k].y - 0.5) < 1e-12));
  const u = ungroupGroup(m, 'g4');
  assert.equal(u.groups[3].kind, 'single');
  assert.equal(lumCount(u), lumCount(m));
  assert.equal(removeGroup(m, 'g1').groups.length, m.groups.length - 1);
  assert.equal(removeGroup(modelFromValues(DEFAULTS), 'g1'), null);
});

test('group fields: values, choices, errors and the limit of the room', () => {
  const line = { id: 'g2', type: 't1', kind: 'line', x0: 1, y0: 2, x1: 5, y1: 2, by: 'count', n: 3, step: 1, off: 0, hm: 3, psi: 0 };
  const ctx = { H: 3, others: 6 };
  const raw = (g, over = {}) => ({ ...Object.fromEntries(Object.entries(groupFieldValues(g)).map(([k, v]) => [k, v == null ? '' : String(v)])), ...over });
  let r = validateGroup(line, raw(line, { n: '7', x1: '5,5' }), ctx);
  assert.ok(r.ok);
  assert.equal(r.group.n, 7);
  assert.equal(r.group.x1, 5.5);
  r = validateGroup(line, raw(line, { by: 'step', step: '0' }), ctx);
  assert.ok(!r.ok && r.errors.step);
  r = validateGroup(line, raw(line, { by: 'step', step: '0.5', n: 'abc' }), ctx);   // n is hidden: not checked
  assert.ok(r.ok && r.group.by === 'step' && r.group.step === 0.5);
  r = validateGroup(line, raw(line, { hm: '3.2' }), ctx);
  assert.match(r.errors.hm, /0,9…3/);
  r = validateGroup(line, raw(line, { x1: '1' }), ctx);
  assert.ok(r.errors.x1);
  r = validateGroup(line, raw(line, { n: '495' }), ctx);
  assert.match(r.errors.n, /всего 501/);
  // a grid: its area all or nothing
  const grid = { id: 'g1', type: 't1', kind: 'grid', nx: 3, ny: 2, hm: 3, psi: 0 };
  r = validateGroup(grid, raw(grid, { ax0: '1' }), { H: 3, others: 0 });
  assert.ok(r.errors.ay0 && r.errors.ax1);
  r = validateGroup(grid, raw(grid, { ax0: '1', ay0: '0', ax1: '5', ay1: '4' }), { H: 3, others: 0 });
  assert.deepEqual(r.group.area, { x0: 1, y0: 0, x1: 5, y1: 4 });
  r = validateGroup(r.group, raw(r.group, { ax0: '', ay0: '', ax1: '', ay1: '' }), { H: 3, others: 0 });
  assert.equal(r.group.area, undefined);
  r = validateGroup(grid, raw(grid, { ax0: '5', ay0: '0', ax1: '1', ay1: '4' }), { H: 3, others: 0 });
  assert.ok(r.errors.ax1);
  r = validateGroup(grid, raw(grid, { psi: '200' }), { H: 3, others: 0 });
  assert.ok(r.errors.psi);
  // single luminaires: the point `at`
  const single = { id: 'g3', type: 't1', kind: 'single', points: [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2, y: 2, hm: 2.5, psi: 30 }] };
  assert.deepEqual(groupFieldValues(single, 1), { x: 2, y: 2, hm: 2.5, psi: 30 });
  r = validateGroup(single, { x: '2,5', y: '2', hm: '2.4', psi: '45' }, { H: 3, others: 0, at: 1 });
  assert.deepEqual(r.group.points, [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2.5, y: 2, hm: 2.4, psi: 45 }]);
  // every kind has its fields; the circle's orientation is a choice
  assert.deepEqual(Object.keys(GROUP_FIELDS), ['grid', 'line', 'lines', 'circle', 'single']);
  const circle = { id: 'g4', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 6, start: 0, orient: 'tangent', hm: 3, psi: 0 };
  r = validateGroup(circle, raw(circle, { orient: 'radial', r: '-1' }), { H: 3, others: 0 });
  assert.ok(r.errors.r);
  r = validateGroup(circle, raw(circle, { orient: 'radial' }), { H: 3, others: 0 });
  assert.equal(r.group.orient, 'radial');
});
