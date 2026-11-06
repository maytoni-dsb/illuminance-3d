// Stage 7: the report — pagination, contents, typography, vector plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReport, nodeId, typo, num, FRAME } from '../js/report.js';
import { planScale, planBox, roomPlanSvg, isolinePlanSvg, colorScaleSvg } from '../js/reportsvg.js';
import { prepareRoom, summaryRows } from '../js/reportui.js';
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
  const per = rooms.map((r) => 1 + r.planes.length + 1);
  assert.equal(b.pages.length, 2 + per[0] + per[1]);
  assert.equal(b.toc[0].page, 3);
  assert.equal(b.toc[1].page, 3 + per[0]);
  assert.deepEqual(b.toc[0].secs.map((s) => s.page), [3, 4, 3 + rooms[0].planes.length + 1]);
  for (let n = 1; n <= b.pages.length; n++) assert.ok(b.html.includes(`id="pg-${n}"`));
  assert.ok(b.html.includes('class="tt">Офис</span>'));
});

test('switched-off nodes leave the report and the numbers follow', () => {
  const off = new Set([nodeId.toc, nodeId.summary('a'), nodeId.room('b'), nodeId.plane('a', rooms[0].planes[0].key)]);
  const b = buildReport({ info: {}, rooms, include: (id) => !off.has(id) });
  assert.equal(b.pages.length, 1 + (rooms[0].planes.length - 1) + 1);
  assert.ok(!b.html.includes('Холл'));
  assert.ok(b.html.includes('Светотехнический расчёт'));
  assert.ok(b.html.includes('class="roomhead"')); // the room heading moves to its first page
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
  const { roomRows, lumRows } = summaryRows({ ...v1 }, file);
  assert.equal(roomRows.length, 8);
  const lum = Object.fromEntries(lumRows);
  assert.match(lum['Производитель'], /MAYTONI/);
  assert.match(lum['Размеры'], /мм$/);
  assert.match(lum['Количество'], /=\u00a08\u00a0шт/);
  const none = Object.fromEntries(summaryRows({ ...v1, phot: 'cosine' }, null).lumRows);
  assert.equal(none['CRI'], '—');
});
