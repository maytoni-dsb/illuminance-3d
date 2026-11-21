// Stage 2.1: the report of a room with several luminaire types — the list of luminaires by type,
// the summary of the room and the luminaires on its plans at their own positions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareRoom } from '../js/reportui.js';
import { buildReport } from '../js/report.js';
import { createCalc } from '../js/calc.js';
import { modelFromValues, addType, addGroup, calcParams, formValues, typeValues } from '../js/model.js';
import { setLang } from '../js/i18n.js';
import { DEFAULTS } from '../js/ui.js';

setLang('ru');

test('a room with two types: a line per type, the summary rows, the marks of the plan', () => {
  let m = modelFromValues({ ...DEFAULTS });
  m = addType(m).model;
  m = addGroup(m, 'circle', 't2').model;
  const params = { ...calcParams(m), checks: false };
  const result = createCalc().run(params);
  const types = [
    { id: 't1', color: '#e8590c', name: 'Тип 1', file: null, values: typeValues(m.types[0]), count: 6, hm: Array(6).fill(3) },
    { id: 't2', color: '#1971c2', name: 'Тип 2', file: null, values: typeValues(m.types[1]), count: 6, hm: Array(6).fill(3) },
  ];
  const r = prepareRoom({ id: 'a', name: 'Офис', values: formValues(m), file: null, params, key: 'k', result, norm: null, types, grid: false });
  assert.equal(r.lums.length, 2);
  assert.deepEqual(r.lums.map((l) => [l.color, l.article, l.count]), [['#e8590c', 'Тип 1', 6], ['#1971c2', 'Тип 2', 6]]);
  assert.equal(r.marks.length, 12);
  assert.deepEqual(r.xs, []);
  assert.equal(r.polar, null);
  assert.deepEqual(r.lumRows.map((x) => x[0].replace(/<[^>]+>/g, '')), ['Тип 1', 'Тип 2', 'Количество', 'Высота установки']);
  assert.match(r.lumRows[1][0], /background:#1971c2/);
  const { html } = buildReport({ info: { name: 'Т' }, rooms: [r] });
  assert.match(html, /<h3>Светильники<\/h3>/);
  // the list of luminaires: a line per type, the room named once
  const list = html.slice(html.indexOf('<table class="lum">'), html.indexOf('</table>', html.indexOf('<table class="lum">')));
  assert.equal((list.match(/<tr>/g) ?? []).length, 3);
  assert.equal((list.match(/Офис/g) ?? []).length, 1);
  // the plan and the list tell the types by colour, no letters (21 Nov 2026)
  assert.ok(/stroke="#1971c2"/.test(html));
  assert.ok(!/>B<\/text>/.test(html));
});

test('one grid of one type: the report of version 1', () => {
  const m = modelFromValues({ ...DEFAULTS });
  const params = { ...calcParams(m), checks: false };
  const result = createCalc().run(params);
  const v = formValues(m);
  const a = prepareRoom({ id: 'a', name: 'Офис', values: v, file: null, params, key: 'k', result, norm: null });
  const b = prepareRoom({ id: 'a', name: 'Офис', values: v, file: null, params, key: 'k', result, norm: null,
    types: [{ id: 't1', color: '#e8590c', name: 'Тип 1', file: null, values: typeValues(m.types[0]), count: 6, hm: Array(6).fill(3) }], grid: true });
  assert.deepEqual(b.lumRows, a.lumRows);
  assert.deepEqual([b.xs, b.ys], [a.xs, a.ys]);
  assert.equal(b.marks, null);
  assert.equal(b.lums[0].color, '');
});
