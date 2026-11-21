// Stage 2.1: the edits of the model by the page (types, groups) and the fields of a group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modelFromValues, roomValues, typeValues, applyRoomValues, applyTypeValues, withTypeFile, renameType, addType, removeType,
  addGroup, addPoint, replaceGroup, removeGroup, duplicateGroup, ungroupGroup, formValues, lumCount, typeColorOf, setTypeColor, duplicateType, freeColors, TYPE_COLORS, cleanModel, placementErrors,
} from '../js/model.js';
import { validateGroup, validateDraft, fieldValues, draftValues, rowsOf, GROUP_ROWS } from '../js/groupform.js';
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
});

test('types: a colour of their own, a copy for another lamp set (21 Nov 2026)', () => {
  let m = modelFromValues(DEFAULTS);
  assert.equal(typeColorOf(m, 0), TYPE_COLORS[0]);          // no colour stored: the palette by place
  m = setTypeColor(m, 't1', '#1971C2');
  assert.equal(m.types[0].color, '#1971c2');
  assert.equal(setTypeColor(m, 't1', 'red'), m);            // not a colour: unchanged
  m = addType(m).model;                                     // the first colour nobody shows
  assert.equal(m.types[1].color, TYPE_COLORS[0]);
  m = renameType(m, 't1', 'Downlight');
  m = withTypeFile(m, 't1', { name: 'a.ldt', text: 'x', set: 0 });
  const d = duplicateType(m, 't1');
  assert.deepEqual(d.model.types.map((t) => t.id), ['t1', d.id, 't2']);
  const copy = d.model.types[1];
  assert.equal(copy.name, undefined);
  assert.deepEqual(copy.file, m.types[0].file);
  assert.equal(copy.color, TYPE_COLORS[2]);
  assert.equal(duplicateType(m, 'nope'), null);
  // the card offers the colours no other type shows
  assert.deepEqual(freeColors(d.model, 't1'), TYPE_COLORS.filter((c) => c !== TYPE_COLORS[0] && c !== TYPE_COLORS[2]));
  // kept by a project file
  assert.equal(cleanModel(JSON.parse(JSON.stringify(d.model))).types[1].color, TYPE_COLORS[2]);
  assert.equal(cleanModel({ ...d.model, types: [{ ...d.model.types[0], color: 'blue' }, ...d.model.types.slice(1)] }).types[0].color, undefined);
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

test('groups drawn on the plan: every kind with the draft; single luminaires one by one', () => {
  let m = modelFromValues({ ...DEFAULTS });
  let r = addGroup(m, 'grid', 't1', { x0: 4, y0: 3, x1: 1, y1: 1 }, { nx: 3, ny: 2, hm: 2.8, psi: 90 });
  m = r.model;
  assert.deepEqual(m.groups.at(-1), { id: 'g2', type: 't1', kind: 'grid', nx: 3, ny: 2, hm: 2.8, psi: 90, area: { x0: 1, y0: 1, x1: 4, y1: 3 } });
  m = addGroup(m, 'line', 't1', { x0: 1, y0: 2, x1: 5, y1: 2 }, { n: 5 }).model;
  assert.deepEqual([m.groups.at(-1).n, m.groups.at(-1).hm, m.groups.at(-1).hm1], [5, 3, 3]);
  m = addGroup(m, 'circle', 't1', { cx: 3, cy: 2, r: 1.2 }, { n: 8, psi: 90 }).model;
  r = addGroup(m, 'single', 't1', { x: 1.5, y: 1.5 }, { hm: 2.5 });
  m = addPoint(r.model, r.id, 2.5, 1.5, { hm: 2.5, psi: 45 });
  assert.deepEqual(m.groups.at(-1).points, [{ x: 1.5, y: 1.5, hm: 2.5, psi: 0 }, { x: 2.5, y: 1.5, hm: 2.5, psi: 45 }]);
  assert.deepEqual(placementErrors(m), []);
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(m))), m);
  const d = duplicateGroup(m, 'g4', 0.5, 0.5);
  assert.equal(d.model.groups[4].id, d.id);
  assert.equal(lumCount(ungroupGroup(m, 'g4')), lumCount(m));
  assert.equal(removeGroup(m, 'g1').groups.length, m.groups.length - 1);
});

test('fields of a group: rows by kind, values, the grid as centre and size, the line length', () => {
  assert.deepEqual(Object.keys(GROUP_ROWS), ['single', 'grid', 'line', 'circle']);
  assert.deepEqual(rowsOf('line', true).flatMap((r) => r.fields.map((f) => f.key)), ['n', 'hm', 'hm1', 'psi']);
  assert.deepEqual(rowsOf('grid', true).flatMap((r) => r.fields.map((f) => f.key)), ['nx', 'ny', 'hm', 'psi']);
  const ctx = { H: 3, L: 6, W: 4, others: 6 };
  const raw = (g, over = {}, c = ctx) => ({ ...Object.fromEntries(Object.entries(fieldValues(g, c)).map(([k, v]) => [k, String(v)])), ...over });
  // a grid without an area shows the room; unchanged it keeps following the room
  const grid = { id: 'g1', type: 't1', kind: 'grid', nx: 3, ny: 2, hm: 3, psi: 0 };
  assert.deepEqual([fieldValues(grid, ctx).gx, fieldValues(grid, ctx).gw], [3, 6]);
  let r = validateGroup(grid, raw(grid, { nx: '4' }), ctx);
  assert.ok(r.ok && r.group.nx === 4 && r.group.area === undefined);
  r = validateGroup(grid, raw(grid, { gx: '2', gw: '3' }), ctx);
  assert.deepEqual(r.group.area, { x0: 0.5, y0: 0, x1: 3.5, y1: 4 });
  r = validateGroup(grid, raw(grid, { gw: '0' }), ctx);
  assert.ok(!r.ok && r.errors.gw);
  // a line: the length moves the end point; a new end point gives a new length
  const line = { id: 'g2', type: 't1', kind: 'line', x0: 1, y0: 1, x1: 4, y1: 5, n: 3, hm: 3, hm1: 3, psi: 0 };
  assert.equal(fieldValues(line, ctx).len, 5);
  r = validateGroup(line, raw(line, { len: '10' }), ctx);
  assert.deepEqual([r.group.x1, r.group.y1], [7, 9]);
  r = validateGroup(line, raw(line, { x1: '1', y1: '3' }), ctx);
  assert.deepEqual([r.group.x1, r.group.y1], [1, 3]);
  r = validateGroup(line, raw(line, { x1: '1', y1: '1' }), ctx);
  assert.ok(r.errors.x1);
  r = validateGroup(line, raw(line, { hm1: '3.2' }), ctx);
  assert.match(r.errors.hm1, /0,9…3/);
  r = validateGroup(line, raw(line, { n: '495' }), ctx);
  assert.match(r.errors.n, /всего 501/);
  // a circle, single luminaires
  const circle = { id: 'g3', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 6, hm: 3, psi: 90 };
  assert.ok(validateGroup(circle, raw(circle, { r: '-1' }), ctx).errors.r);
  assert.equal(validateGroup(circle, raw(circle, { psi: '0' }), ctx).group.psi, 0);
  const single = { id: 'g4', type: 't1', kind: 'single', points: [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2, y: 2, hm: 2.5, psi: 30 }] };
  assert.deepEqual(fieldValues(single, { ...ctx, at: 1 }), { x: 2, y: 2, hm: 2.5, psi: 30 });
  r = validateGroup(single, { x: '2,5', y: '2', hm: '2.4', psi: '45' }, { ...ctx, at: 1 });
  assert.deepEqual(r.group.points, [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2.5, y: 2, hm: 2.4, psi: 45 }]);
});

test('fields of the next group to draw: no geometry, the room height by default, the limit', () => {
  const ctx = { H: 3, L: 6, W: 4, others: 490 };
  assert.deepEqual(draftValues('line', {}, ctx), { n: 3, hm: 3, hm1: 3, psi: 0 });
  let r = validateDraft('line', { n: '5', hm: '2.8', hm1: '2.6', psi: '90' }, ctx);
  assert.deepEqual(r.draft, { n: 5, hm: 2.8, hm1: 2.6, psi: 90 });
  r = validateDraft('grid', { nx: '4', ny: '3', hm: '3', psi: '0' }, ctx);
  assert.ok(!r.ok && r.errors.ny);
  r = validateDraft('single', { hm: '0.5', psi: '0' }, ctx);
  assert.ok(r.errors.hm);
});
