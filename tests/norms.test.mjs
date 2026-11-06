// Stage 7: the codifier of norms — data read from СП 52.13330.2016 (Л.1) and EN 12464-1:2021 (9–61).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORM_SETS, rowOf, searchNorms, normFromRow, normMatches, normSource, applicable } from '../js/norms.js';
import { validateParams, DEFAULTS } from '../js/ui.js';

const [sp, en] = NORM_SETS;
const all = (set) => set.sections.flatMap((s) => s.rows.map(rowOf));

test('sets, sections and rows are complete and sane', () => {
  assert.equal(sp.sections.length, 26); // headings of table Л.1 (with medical subsections)
  assert.deepEqual(en.sections.map((s) => Number(s.title.match(/^Table (\d+)/)[1])), Array.from({ length: 53 }, (_, k) => k + 9));
  for (const set of NORM_SETS) {
    const rows = all(set);
    assert.ok(rows.length > 230, set.id);
    const refs = new Set();
    for (const r of rows) {
      assert.ok(r.E > 0 && r.E <= 5000, `${set.id} ${r.ref} E`);
      assert.ok(r.U0 == null || (r.U0 >= 0.1 && r.U0 <= 1), `${set.id} ${r.ref} U0`);
      assert.ok(r.z == null || r.z === 0 || r.z === 0.8 || r.plane.startsWith('Г'), `${set.id} ${r.ref} plane`);
      assert.ok(r.name.length > 2 && !/\d{3} \d|- - -/.test(r.name), `${set.id} ${r.ref} name: ${r.name}`);
      if (set.id === 'en12464') { assert.ok(!refs.has(r.ref), r.ref); refs.add(r.ref); }
    }
  }
});

test('known rows', () => {
  const s = Object.fromEntries(all(sp).map((r) => [r.ref, r]));
  assert.deepEqual([s['1'].E, s['1'].U0, s['1'].z], [500, 0.6, 0.8]);
  assert.deepEqual([s['12'].E, s['12'].z], [200, 0]);
  assert.deepEqual([s['190'].E, s['190'].z], [200, 0]);
  assert.equal(s['196а'].U0, 0.4);
  assert.match(s['88б'].name, /^Помещения для подготовки товаров к продаже: помещения нарезки тканей/);
  const e = Object.fromEntries(all(en).map((r) => [r.ref, r]));
  assert.deepEqual([e['34.2'].E, e['34.2'].U0, e['34.2'].z], [500, 0.6, 0.8]);
  assert.deepEqual([e['9.1'].E, e['9.1'].z], [100, 0]); // at floor level
  assert.equal(e['44.4'].z, null); // boards: vertical
  assert.equal(e['59.2'].E, 5000);
  assert.equal(e['19.2.1'].name, 'Winding: large coils');
  assert.equal(e['10.7'].note, '4 000 K ≤ Tcp ≤ 5 000 K');
});

test('search: words in any order, ё = е, numbers', () => {
  const r = searchNorms(sp, 'жилые КОМНАТЫ');
  assert.ok(r.some((s) => s.rows.some((x) => x.ref === '190')));
  assert.equal(searchNorms(sp, '196а').flatMap((s) => s.rows)[0].ref, '196а');
  assert.ok(searchNorms(en, 'corridor').flatMap((s) => s.rows).length >= 5);
  assert.equal(searchNorms(en, 'zzzz').length, 0);
  assert.equal(searchNorms(sp, '').reduce((a, s) => a + s.rows.length, 0), all(sp).length);
});

test('a chosen row fills the form and names its source; editing makes it the user\'s', () => {
  const row = all(sp).find((r) => r.ref === '1');
  const n = normFromRow(sp, row);
  // no-break spaces keep «СП 52…», «табл. Л.1», «№ 1» together
  assert.equal(n.source, 'СП\u00a052.13330.2016, табл.\u00a0Л.1, №\u00a01');
  assert.equal(normSource(n), `Установлено по СП\u00a052.13330.2016, табл.\u00a0Л.1, №\u00a01: ${row.name}`);
  const e = normFromRow(en, all(en).find((r) => r.ref === '12.1'));
  assert.ok(normSource(e).startsWith('Установлено по EN\u00a012464-1:2021, ref.\u00a0no.\u00a012.1: '));
  const v = validateParams({ ...DEFAULTS, En: n.En, hwp: n.hwp, U0n: n.U0n }).values;
  assert.ok(normMatches(n, v));
  assert.ok(!normMatches(n, { ...v, En: 400 }));
  assert.equal(normSource(null), 'Задано пользователем');
  const free = all(sp).find((r) => r.U0 == null && applicable(r));
  const v2 = validateParams({ ...DEFAULTS, En: free.E, hwp: free.z, U0n: '' });
  assert.ok(v2.ok && v2.values.U0n === null && normMatches(normFromRow(sp, free), v2.values));
  assert.ok(!applicable(all(en).find((r) => r.ref === '44.4')));
});
