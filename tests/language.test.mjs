// Stage 8: languages of the interface and the report — the dictionaries, the formats of the
// languages and the rule that the code has no Russian text outside the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTS, LANG_IDS, setLang, getLang, t, pickLang, planeName, planeCode, formatNumber, num, foldText } from '../js/i18n.js';
import { parseNumber, validateParams, DEFAULTS } from '../js/ui.js';
import { formatPhone, infoErrors, phoneCode, nextRoomName, INFO_FIELDS } from '../js/project.js';
import { normSets, normSource, normFromRow, rowOf, NORM_SETS } from '../js/norms.js';
import { HELP, HELP_KEYS } from '../js/help.js';
import { buildReport, typo } from '../js/report.js';
import { prepareRoom, summaryRows } from '../js/reportui.js';
import { createCalc } from '../js/calc.js';
import { faceRho, ceilingDrop } from '../js/ui.js';
import { parsePhotometryFile } from '../js/photfile.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const CYR = /[Ѐ-ӿ]/;

// ---- the dictionaries ----

/** Leaves of a dictionary: path → value. */
function leaves(o, path = '', out = new Map()) {
  if (typeof o === 'string' || typeof o === 'function' || Array.isArray(o)) { out.set(path, o); return out; }
  if (o && typeof o === 'object') {
    const plural = Object.keys(o).length && Object.keys(o).every((k) => ['one', 'few', 'many', 'other'].includes(k));
    if (plural) { out.set(path, o); return out; }
    for (const [k, v] of Object.entries(o)) leaves(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}
const holes = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const kind = (v) => (typeof v === 'function' ? 'function' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'plural' : 'string');

test('dictionaries: the same keys in every language, the same placeholders', () => {
  assert.deepEqual(LANG_IDS, ['ru', 'en', 'de']);
  const ru = leaves(DICTS.ru);
  for (const id of ['en', 'de']) {
    const d = leaves(DICTS[id]);
    const skip = (k) => k.startsWith('meta.');
    assert.deepEqual([...d.keys()].filter((k) => !skip(k)).sort(), [...ru.keys()].filter((k) => !skip(k)).sort(), id);
    for (const [k, v] of ru) {
      if (skip(k)) continue;
      const w = d.get(k);
      // a plain string may become a function of the parameters (phone placeholder), not the reverse
      if (!(kind(v) === 'string' && kind(w) === 'function')) assert.equal(kind(w), kind(v), `${id} ${k}`);
      if (kind(v) === 'array' && k !== 'info.phone.codes') assert.equal(w.length, v.length, `${id} ${k}`);
      if (kind(v) === 'string' && kind(w) === 'string') assert.deepEqual(holes(w), holes(v), `${id} ${k}`);
      if (kind(v) === 'plural') {
        const all = (p) => new Set(Object.values(p).flatMap((s) => [...holes(s)]));
        assert.deepEqual(all(w), all(v), `${id} ${k}`);
        assert.ok(w.one && w.other, `${id} ${k}: one and other`);
      }
    }
    for (const m of ['locale', 'decimal', 'group', 'plane', 'vplane', 'quotes', 'units', 'label', 'name']) assert.ok(DICTS[id].meta[m] != null, `${id} meta.${m}`);
  }
});

test('dictionaries: every key used by the code exists', () => {
  const files = ['index.html', ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js') && !f.startsWith('lang-')).map((f) => `js/${f}`)];
  const keys = new Set();
  for (const f of files) {
    const s = readFileSync(join(root, f), 'utf8');
    for (const m of s.matchAll(/\b(?:t|tr|raw)\(\s*'([\w:]+\.[\w.:]+)'/g)) keys.add(m[1]);
    for (const m of s.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) keys.add(m[1]);
    for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) keys.add(p.split(':')[1]?.trim() ?? '');
  }
  for (const k of [...keys]) if (!k.includes('.')) keys.delete(k); // examples in comments
  // keys built from parts
  for (let i = 0; i < 6; i++) keys.add(`face.${i}`);
  for (const k of HELP_KEYS) { keys.add(`help.topics.${k}.title`); keys.add(`help.topics.${k}.text`); }
  for (const f of INFO_FIELDS) { keys.add(`info.${f.key}.label`); keys.add(`info.${f.key}.placeholder`); }
  for (const s of NORM_SETS) for (const p of ['title', 'ref', 'head', 'source', 'doc', 'row', 'note']) keys.add(`norms.${s.id}.${p}`);
  for (const id of LANG_IDS) {
    const has = (k) => k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), DICTS[id]) !== undefined;
    for (const k of keys) assert.ok(has(k), `${id}: ${k}`);
  }
});

test('dictionaries: Russian only in the Russian one and in the names of SP 52 (kept in its language)', () => {
  for (const id of ['en', 'de']) {
    for (const [k, v] of leaves(DICTS[id])) {
      const texts = typeof v === 'string' ? [v] : kind(v) === 'plural' ? Object.values(v) : kind(v) === 'array' ? v.map(String) : [];
      for (const s of texts) if (CYR.test(s)) assert.ok(k.startsWith('norms.sp52.'), `${id} ${k}: ${s}`);
    }
  }
});

// ---- no Russian in the code ----

/** Files with Russian data (spec, stage 8): the dictionary, the table of SP 52 and its parser, fixtures. */
const DATA = ['js/lang-ru.js', 'js/norms-data.js', 'scripts/build-norms.py', 'scripts/norms-sp52.py'];

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === '.git' || n === 'node_modules' || n === 'fonts') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(relative(root, p).replace(/\\/g, '/'));
  }
  return out;
}

test('code: no Russian outside the data (identifiers, comments, markup)', () => {
  const bad = [];
  for (const f of walk(root)) {
    if (DATA.includes(f) || f.startsWith('tests/fixtures/') || !/\.(js|mjs|html|css|md|m|py|json)$/.test(f)) continue;
    const lines = readFileSync(join(root, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (!CYR.test(l)) return;
      if (f === 'js/lang-en.js' || f === 'js/lang-de.js') {
        // the names of SP 52 (norms.sp52) are data; comments are not
        if (/^\s*\/\//.test(l)) bad.push(`${f}:${i + 1}`);
        return;
      }
      if (f.startsWith('tests/')) {
        // tests may expect the Russian texts of the Russian version, in string literals only
        if (/^\s*\/\//.test(l) || /\btest\(\s*'[^']*[Ѐ-ӿ]/.test(l) || /\/\/[^'"`]*[Ѐ-ӿ][^'"`]*$/.test(l)) bad.push(`${f}:${i + 1}`);
        return;
      }
      bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

// ---- choice of the language ----

test('language of the browser: the first of ru, en, de; English otherwise', () => {
  assert.equal(pickLang(['de-AT', 'en-US']), 'de');
  assert.equal(pickLang(['fr-FR', 'ru-RU']), 'ru');
  assert.equal(pickLang(['fr-FR', 'it']), 'en');
  assert.equal(pickLang([]), 'en');
  assert.equal(pickLang(['EN_gb']), 'en');
  assert.equal(getLang(), 'ru'); // Node: Russian, as the tests of the earlier stages expect
});

// ---- formats ----

test('numbers, planes and plurals by language', () => {
  try {
    setLang('ru');
    assert.equal(formatNumber(0.25), '0,25');
    assert.equal(planeName(0.8), 'Г-0,8');
    assert.equal(planeName(0), 'Г-0,0');
    assert.equal(planeCode('V-1.0'), 'В-1,0');
    assert.equal(num(12345.6, 1), '12\u202f345,6');
    assert.equal(t('app.roomsN', { n: 21 }), '21 помещение');
    assert.equal(t('app.roomsN', { n: 3 }), '3 помещения');
    assert.equal(t('app.roomsN', { n: 11 }), '11 помещений');
    setLang('en');
    assert.equal(formatNumber(0.25), '0.25');
    assert.equal(planeName(0.8), 'H-0.8');
    assert.equal(planeName(1.25), 'H-1.25');
    assert.equal(planeCode('V'), 'V');
    assert.equal(num(12345.6, 1), '12,345.6');
    assert.equal(num(1234), '1234');
    assert.equal(t('app.roomsN', { n: 1 }), '1 room');
    assert.equal(t('app.roomsN', { n: 2 }), '2 rooms');
    assert.equal(parseNumber('H-0.8'), 0.8);
    assert.equal(parseNumber('0,8'), 0.8); // a comma is still read
    assert.equal(typo('A "quoted" word - and 5 lx'), 'A\u00a0“quoted” word\u00a0— and 5\u00a0lx');
    assert.match(validateParams({ ...DEFAULTS, L: '51' }).errors.L, /^Allowed 1…50 m$/);
    setLang('de');
    assert.equal(formatNumber(0.25), '0,25');
    assert.equal(planeName(0.8), 'H-0,8');
    assert.equal(planeCode('H-0.0'), 'H-0,0');
    assert.equal(num(12345), '12.345');
    assert.equal(t('app.roomsN', { n: 1 }), '1 Raum');
    assert.equal(t('app.roomsN', { n: 5 }), '5 Räume');
    assert.equal(typo('Ein "Büro" - 3 m'), 'Ein „Büro“\u00a0— 3\u00a0m');
    assert.match(validateParams({ ...DEFAULTS, nx: '2,5' }).errors.nx, /ganze Zahl/);
  } finally { setLang('ru'); }
});

test('search folds letters with diacritics and keeps positions', () => {
  assert.equal(foldText('Ёлка Über — x'), 'елка uber - x');
  assert.equal(foldText('Ёлка').length, 4);
});

// ---- phone masks ----

test('phone masks: +7 in Russian; +44 and +49 in English and German', () => {
  try {
    setLang('en');
    assert.equal(formatPhone('020 7946 0958'), '+44 20 7946 0958');
    assert.equal(formatPhone('+44 (0)20 7946-0958'), '+44 20 7946 0958');
    assert.equal(formatPhone('07700 900123'), '+44 7700 900123');
    assert.equal(formatPhone('0113 496 0000'), '+44 113 496 0000');
    assert.equal(formatPhone('030 12345678', '+49'), '+49 30 12345678');
    assert.equal(formatPhone('+49 151 2345 6789'), '+49 151 23456789');
    assert.equal(formatPhone('0211 1234567', '+49'), '+49 211 1234567');
    assert.equal(formatPhone('+7 912 345 67 89'), '+7 912 345 6789'); // a number of another country stays readable
    assert.equal(phoneCode('+49 30 1'), '+49');
    const ok = { name: 'Office', description: '', author: 'A. B.', email: 'a@b.uk', customer: 'Ltd' };
    assert.deepEqual(infoErrors({ ...ok, phone: '+44 20 7946 0958' }), {});
    assert.deepEqual(infoErrors({ ...ok, phone: '+49 30 123456' }), {});
    assert.match(infoErrors({ ...ok, phone: '+44 20 7946' }).phone, /10 digits after \+44/);
    assert.match(infoErrors({ ...ok, phone: '+49 30 12' }).phone, /6–11 digits after \+49/);
    assert.equal(INFO_FIELDS.find((f) => f.key === 'phone').placeholder, '+44 20 7946 0958');
    setLang('de');
    assert.equal(formatPhone('030 12345678'), '+49 30 12345678');
    assert.equal(INFO_FIELDS.find((f) => f.key === 'phone').placeholder, '+49 30 12345678');
    assert.equal(nextRoomName([{ name: 'Raum 1' }]), 'Raum 2');
  } finally { setLang('ru'); }
});

// ---- norms ----

test('norms: SP 52 in Russian, EN 12464-1 in English and German; a norm of the other set keeps its names', () => {
  const [sp, en] = NORM_SETS;
  const spRow = rowOf(sp.sections[0].rows[0]);
  const spNorm = normFromRow(sp, spRow);
  const enNorm = normFromRow(en, rowOf(en.sections[3].rows[0]));
  try {
    assert.deepEqual(normSets().map((s) => s.id), ['sp52']);
    setLang('en');
    assert.deepEqual(normSets().map((s) => s.id), ['en12464']);
    // the document and the room name stay Russian, the words around them are English
    assert.equal(normSource(spNorm), `Set by СП\u00a052.13330.2016, table\u00a0Л.1, no.\u00a01: ${spRow.name}`);
    assert.ok(normSource(enNorm).startsWith('Set by EN\u00a012464-1:2021, ref.\u00a0no.\u00a0'));
    assert.equal(normSource(null), 'Set by the user');
    setLang('de');
    assert.deepEqual(normSets().map((s) => s.id), ['en12464']);
    assert.ok(normSource(enNorm).startsWith('Festgelegt nach EN\u00a012464-1:2021, Ref.-Nr.\u00a0'));
    setLang('ru');
    // and the other way round: EN 12464-1 in the Russian version
    assert.ok(normSource(enNorm).startsWith('Установлено по EN\u00a012464-1:2021, ref.\u00a0no.\u00a0'));
  } finally { setLang('ru'); }
});

// ---- the report and the help without Russian ----

test('report, help and messages in English and German have no Russian text', () => {
  const ldt = 'Focus-LED-TR032-2-12W3K-S-B.ldt';
  const table = parsePhotometryFile(readFileSync(new URL(`./fixtures/photometry/${ldt}`, import.meta.url), 'latin1'), ldt);
  const v = { ...DEFAULTS, L: 4, W: 3, H: 3, nx: 2, ny: 2, hm: 3, hwp: 0.8, phot: 'cosine', flux: 2000 };
  const params = { L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, flux: v.flux, hc: ceilingDrop(v.H, v.hm), psi: 0, phot: 'cosine', rho: faceRho(v), hwp: v.hwp };
  const result = createCalc().run(params);
  try {
    for (const id of ['en', 'de']) {
      setLang(id);
      const room = prepareRoom({ id: 'a', name: 'Office', values: v, file: null, params, key: 'k', result, norm: null });
      const b = buildReport({ info: { name: 'Project', author: 'A', phone: '+44 20 7946 0958', email: 'a@b.uk', customer: 'C' }, rooms: [room] });
      assert.ok(!CYR.test(b.html), `${id}: report`);
      assert.ok(b.html.includes(`<html lang="${id}">`));
      assert.ok(b.html.includes(planeName(0.8)));
      for (const k of HELP_KEYS) assert.ok(!CYR.test(HELP[k].title + HELP[k].text), `${id}: help ${k}`);
      const rows = summaryRows(v, { table, set: 0 }, null, 2.9);
      assert.ok(!CYR.test(JSON.stringify(rows)), `${id}: summary rows`);
      assert.throws(() => parsePhotometryFile('', 'x.ldt'), (e) => !CYR.test(e.message));
      assert.ok(!CYR.test(result.checks3 ? '' : 'ok'));
    }
  } finally { setLang('ru'); }
});
