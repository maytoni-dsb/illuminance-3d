// Stage 7: the report — pagination, contents, typography, vector plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReport, nodeId, typo, num, FRAME, lumTypes } from '../js/report.js';
import { planScale, planBox, roomPlanSvg, isolinePlanSvg, colorScaleSvg, niceStep } from '../js/reportsvg.js';
import { prepareRoom, summaryRows, polarOf, lampKit } from '../js/reportui.js';
import { fmtLux } from '../js/planview.js';
import { createCalc } from '../js/calc.js';
import { parsePhotometryFile, luminaireShape } from '../js/photfile.js';
import { createPhotometry } from '../js/photometry.js';
import { DEFAULTS, faceRho, ceilingDrop } from '../js/ui.js';

const ldt = 'Focus-LED-TR032-2-12W3K-S-B.ldt';
const table = parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${ldt}`, import.meta.url), 'latin1'), ldt);
const file = { table, phot: createPhotometry({ type: 'file', table }), shape: luminaireShape(table), key: 'k', set: 0 };

function roomData(id, name, v) {
  const params = { L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, flux: v.flux, hc: ceilingDrop(v.H, v.hm, table.luminaire.height), psi: 0,
    phot: 'file', table, fileKey: 'k', rho: faceRho(v), hwp: v.hwp };
  return { id, name, values: v, file, params, key: id, result: createCalc().run(params) };
}
const v1 = { ...DEFAULTS, phot: 'file', flux: 840, nx: 4, ny: 2, hwp: 0.8 };
const rooms = [prepareRoom(roomData('a', 'Офис', v1)), prepareRoom(roomData('b', 'Холл', { ...v1, L: 4, W: 3, hwp: 0 }))];
rooms.forEach((r) => { r.images = { real: 'data:,', falseColor: 'data:,' }; });

test('pages, contents and page numbers', () => {
  const b = buildReport({ info: { name: 'Проект' }, rooms });
  // title, contents, then per room: summary, one page per plane, illustrations
  const per = rooms.map((r) => 1 + Math.ceil(r.planes.length / 2) + 1); // two planes a page
  // title, contents, list of luminaires, summary of results, then the rooms
  assert.equal(b.pages.length, 4 + per[0] + per[1]);
  assert.deepEqual(b.toc.slice(0, 2).map((t) => [t.title, t.page]), [['Перечень светильников', 3], ['Сводная таблица результатов', 4]]);
  assert.equal(b.toc[2].page, 5);
  assert.equal(b.toc[3].page, 5 + per[0]);
  assert.deepEqual(b.toc[2].secs.map((s) => s.page), [5, 6, 6 + Math.ceil(rooms[0].planes.length / 2)]);
  assert.ok(!/roomsub|hyphens:auto|Suisse/.test(b.html));
  assert.ok(!/ё/i.test(b.html)); // «е» throughout
  assert.equal((b.html.match(/class="rhl"/g) ?? []).length, b.pages.length - 1); // the logo on every page after the title
  for (let n = 1; n <= b.pages.length; n++) assert.ok(b.html.includes(`id="pg-${n}"`));
  assert.ok(b.html.includes('class="tt">Офис</span>'));
});

test('switched-off nodes leave the report and the numbers follow', () => {
  const off = new Set([nodeId.toc, nodeId.lumlist, nodeId.restable, nodeId.summary('a'), nodeId.room('b'), nodeId.plane('a', rooms[0].planes[0].key)]);
  const b = buildReport({ info: {}, rooms, include: (id) => !off.has(id) });
  assert.equal(b.pages.length, 1 + Math.ceil((rooms[0].planes.length - 1) / 2) + 1);
  assert.ok(!b.html.includes('Холл'));
  assert.ok(b.html.includes('Светотехнический расчет'));
  assert.ok(b.html.includes('class="roomhead"')); // the room heading moves to its first page
});

test('list of luminaires and summary of results: a line per room, Г-0,0 and Г-0,8', () => {
  const b = buildReport({ info: {}, rooms });
  const lum = b.html.slice(b.html.indexOf('class="lum"'), b.html.indexOf('</table>', b.html.indexOf('class="lum"')));
  assert.equal((lum.match(/<tr>/g) ?? []).length, 1 + rooms.length); // header + rooms, no totals
  assert.ok(lum.includes('Комплектация') && !b.html.includes('Всего'));
  const res = b.html.slice(b.html.indexOf('class="sumres"'), b.html.indexOf('</table>', b.html.indexOf('class="sumres"')));
  assert.equal((res.match(/>Г-0,0\*?</g) ?? []).length, rooms.length);
  assert.equal((res.match(/>Г-0,8\*?</g) ?? []).length, rooms.length);
});

test('every isoline value is labelled at least once', () => {
  const r = rooms[0];
  for (const pl of r.planes) {
    const svg = isolinePlanSvg({ ...r, n: 50, sets: pl.sets, gost: pl.gost });
    const labels = [...svg.matchAll(/rotate\([^)]*\)"><rect[^>]*\/><text[^>]*>([^<]+)</g)].map((m) => m[1]);
    for (const set of pl.sets) if (set.lines.length) assert.ok(labels.includes(fmtLux(set.level)), `${pl.name}: ${set.level}`);
  }
});

test('polar diagram: rings in a round step, legend with Imax', () => {
  assert.deepEqual([0.3, 7, 13, 240, 1100].map(niceStep), [0.5, 10, 20, 250, 2000]);
  const p = polarOf(file.phot);
  assert.match(p.legend, /C0–180.*C90–270.*I<sub>max<\/sub>\u00a0=\u00a0[\d\u202f]+\u00a0кд\/клм/);
  const rings = [...p.svg.matchAll(/<text x="1.2"[^>]*>([\d,]+)</g)].map((m) => Number(m[1].replace(',', '.')));
  const step = rings[0];
  rings.forEach((v, k) => assert.ok(Math.abs(v - step * (k + 1)) < 1e-9));
  assert.ok(rings.at(-1) >= p.peak && rings.at(-1) - step < p.peak);
});

test('typography of user text', () => {
  assert.equal(typo('Расчёт "по норме" - для А и Б'), 'Расчёт «по\u00a0норме»\u00a0— для А\u00a0и\u00a0Б');
  assert.equal(typo('<b>'), '&lt;b&gt;');
  assert.equal(num(12345.67, 1), '12 345,7');
  assert.equal(num(1234), '1234');
  assert.equal(num(-0.5, 2), '−0,5');
});

test('plans: drafting scale that fits, valid SVG in millimetres', () => {
  assert.equal(planScale(6, 4, 149, 99), 50);
  assert.equal(planScale(6, 4, 160, 110), 40);
  assert.equal(planScale(50, 50, 160, 160), 400);
  const r = rooms[0], n = planScale(r.L, r.W, FRAME.w - 17, 83);
  const s = roomPlanSvg({ ...r, n });
  const box = planBox(r.L, r.W, n, true);
  assert.ok(s.startsWith('<svg') && s.includes(`width="${Math.round(box.w * 100) / 100}mm"`));
  assert.equal((s.match(/<ellipse|<rect x="-/g) ?? []).length >= r.xs.length * r.ys.length, true);
  assert.ok(s.includes('>6000<') && s.includes('>4000<')); // overall dimensions in mm
  const pl = r.planes[0];
  const p = isolinePlanSvg({ ...r, n, sets: pl.sets, gost: pl.gost });
  assert.ok(p.includes('clipPath') && (p.match(/<circle/g) ?? []).length > 0);
  assert.ok(!/NaN|undefined/.test(s + p));
  assert.equal((colorScaleSvg(165).match(/<rect/g) ?? []).length, 28);
});

test('summary tables', () => {
  const { roomRows, normRows, lumRows } = summaryRows({ ...v1 }, file);
  assert.equal(roomRows.length, 3);
  assert.equal(Object.fromEntries(roomRows)['Длина × ширина × высота'], '6\u00a0×\u00a04\u00a0×\u00a03\u00a0м');
  assert.equal(Object.fromEntries(normRows)['Норма'], 'Задано пользователем');
  assert.match(Object.fromEntries(normRows)['Освещенность Ē'], /^200\u00a0лк Г\u20110,8$/);
  const sp = summaryRows({ ...v1 }, file, { set: 'sp52', ref: '155', name: 'Площади для посетителей в зале обслуживания' }).normRows[0];
  assert.deepEqual(sp, ['СП\u00a052.13330.2016 (табл.\u00a0Л.1)', '№\u00a0155: Площади для посетителей в зале обслуживания']);
  assert.deepEqual(lumRows.map((r) => r[0]), ['Производитель', 'Артикул', 'Количество', 'Световой поток', 'Цветовая температура', 'Мощность', 'CRI', 'Размеры', 'Высота установки', 'Фотометрический центр']);
  const lum = Object.fromEntries(lumRows);
  assert.match(lum['Производитель'], /MAYTONI/);
  assert.match(lum['Размеры'], /мм$/);
  assert.match(lum['Количество'], /=\u00a08\u00a0шт/);
  assert.equal(lampKit({ lampSets: [{ type: 'LED / 7190' }] }), 'LED / 7190');
  assert.equal(lampKit({ lampSets: [{ type: 'LED' }] }), '');
  assert.equal(lampKit({ lampSets: [{ type: '1 x E27 max 60W' }] }), '1 x E27 max 60W');
  const none = Object.fromEntries(summaryRows({ ...v1, phot: 'cosine' }, null).lumRows);
  assert.equal(none['CRI'], '—');
});
