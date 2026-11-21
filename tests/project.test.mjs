// Stage 7: project model, project file, hot keys, decimal comma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createRoomState, nextRoomName, serializeProject, parseProject, projectFileName, FILE_FORMAT, formatPhone, infoErrors } from '../js/project.js';
import { missingLabels, denseCandidates } from '../js/planview.js';
import { hotkeyAction, HOTKEYS } from '../js/hotkeys.js';
import { toDecimal, DEFAULTS } from '../js/ui.js';
import { HELP } from '../js/help.js';
import { PARAMS } from '../js/ui.js';
import { INFO_FIELDS } from '../js/project.js';
import { formValues, applyFormValues, withFile, modelFile, lumCount, modelFromValues } from '../js/model.js';


test('rooms get the next free default name and copy the current room without its luminaires', () => {
  const p = createProject();
  assert.equal(p.rooms[0].name, 'Помещение 1');
  // a new project has no luminaires (21 Nov 2026)
  assert.deepEqual([p.rooms[0].model.types, p.rooms[0].model.groups], [[], []]);
  p.rooms[0].model = withFile(modelFromValues({ ...DEFAULTS, L: 8 }), { name: 'a.ldt', text: 'x', set: 1 });
  const r = createRoomState(p.rooms, p.rooms[0]);
  assert.equal(r.name, 'Помещение 2');
  assert.equal(formValues(r.model).L, 8);
  assert.deepEqual([r.model.types, r.model.groups], [[], []]);
  assert.notEqual(r.model.room, p.rooms[0].model.room);
  assert.equal(nextRoomName([{ name: 'Помещение 2' }, { name: 'Холл' }]), 'Помещение 3');
});

test('a project survives the file round trip; broken values become defaults', () => {
  const p = createProject();
  p.info.name = 'Офис'; p.info.email = 'a@b.c';
  const hall = createRoomState(p.rooms);
  hall.name = 'Холл';
  hall.model = withFile(modelFromValues({ ...DEFAULTS, phot: 'file', L: 12.5 }), { name: 'f.ldt', text: 'LDT', set: 2 });
  p.rooms.push(hall);
  p.active = hall.id;
  const text = serializeProject(p);
  assert.equal(JSON.parse(text).version, 2);
  const q = parseProject(text);
  assert.equal(q.info.name, 'Офис');
  assert.deepEqual(q.rooms.map((r) => r.name), ['Помещение 1', 'Холл']);
  assert.deepEqual(q.rooms.map((r) => r.model), p.rooms.map((r) => r.model));
  assert.equal(formValues(q.rooms[1].model).phot, 'file');
  assert.equal(q.active, q.rooms[1].id);
  const bad = JSON.parse(text);
  bad.rooms[0].room.shape.L = 'много'; bad.rooms[1].groups[0].ny = 999;
  const r = parseProject(JSON.stringify(bad));
  assert.equal(r.rooms[0].model.room.shape.L, DEFAULTS.L);
  assert.ok(lumCount(r.rooms[1].model) <= 500);
});

// ---- stage 2.0: the format of version 2 and the files of version 1 ----

/** A project file of version 1 as main writes it (js/project.js of main, serializeProject). */
function fileV1(rooms) {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, saved: '2026-11-19T10:00:00.000Z',
    info: { name: 'Офис', description: '', author: 'A', phone: '+7 912 345 6789', email: 'a@b.c', customer: 'C' },
    rooms, active: rooms.length - 1 }, null, 1);
}
const NORM = { source: 'sp52', name: 'Кабинеты', set: 'sp52', ref: '4.1', En: 300, hwp: 0.8, U0n: null };
const V1_ROOMS = [
  { name: 'Кабинет', values: { ...DEFAULTS, L: 7.2, W: 4.8, H: 3.1, hm: 2.85, nx: 4, ny: 3, psi: 90, En: 300, hwp: 0.8, U0n: 0.4, mf: 0.8, rhoC: 0.8, rhoW: 0.6, rhoF: 0.3, flux: 3600 },
    norm: NORM, file: null },
  { name: 'Холл', values: { ...DEFAULTS, phot: 'file', flux: 840, cct: 4000, power: 12, nx: 2, ny: 5 }, norm: null,
    file: { name: 'Focus.ldt', text: 'LDT text', set: 1 } },
];

test('a version 1 file opens: the grid becomes one group of one type, nothing is lost', () => {
  const p = parseProject(fileV1(V1_ROOMS));
  assert.equal(p.rooms.length, 2);
  assert.equal(p.active, p.rooms[1].id);
  assert.equal(p.info.phone, '+7 912 345 6789');
  for (const [k, r] of p.rooms.entries()) {
    const src = V1_ROOMS[k];
    assert.equal(r.name, src.name);
    assert.deepEqual(r.norm, src.norm);
    assert.deepEqual(formValues(r.model), src.values, r.name);   // the form shows the same values
    assert.deepEqual(modelFile(r.model), src.file);
    assert.equal(r.model.types.length, 1);
    assert.equal(r.model.groups.length, 1);
    assert.equal(r.model.groups[0].kind, 'grid');
    assert.equal(r.model.groups[0].type, r.model.types[0].id);
    assert.equal(r.model.room.shape.kind, 'rect');
  }
  assert.equal(lumCount(p.rooms[0].model), 12);
});

test('a version 1 file saved as version 2 and opened again is the same project', () => {
  const p = parseProject(fileV1(V1_ROOMS));
  const text = serializeProject(p);
  const d = JSON.parse(text);
  assert.equal(d.version, 2);
  assert.ok(d.rooms.every((r) => !('values' in r) && !('file' in r) && r.groups.length === 1));
  const q = parseProject(text);
  assert.deepEqual(q.info, p.info);
  assert.deepEqual(q.rooms.map(({ id, ...r }) => r), p.rooms.map(({ id, ...r }) => r));
  for (const [k, r] of q.rooms.entries()) assert.deepEqual(formValues(r.model), V1_ROOMS[k].values);
  // and once more: the second save writes the same rooms
  assert.deepEqual(JSON.parse(serializeProject(q)).rooms, d.rooms);
});

test('a version 2 room with several types and groups is read (stage 2.1); a broken one is refused', () => {
  const p0 = createProject();
  p0.rooms[0].model = modelFromValues(DEFAULTS);
  const d = JSON.parse(serializeProject(p0));
  d.rooms[0].types.push({ ...d.rooms[0].types[0], id: 't2' });
  d.rooms[0].groups.push({ id: 'g2', type: 't2', kind: 'circle', cx: 3, cy: 2, r: 1, n: 8, hm: 3, psi: 90 });
  const p = parseProject(JSON.stringify(d));
  assert.deepEqual(p.rooms[0].model.groups.map((g) => g.kind), ['grid', 'circle']);
  assert.equal(JSON.parse(serializeProject(p)).rooms[0].groups[1].psi, 90);
  d.rooms[0].groups[1].n = 495;
  assert.throws(() => parseProject(JSON.stringify(d)), /больше 500/);
  const e = JSON.parse(serializeProject(p0));
  e.rooms[0].types = 'x';
  assert.throws(() => parseProject(JSON.stringify(e)), /повреждено/);
  const f = JSON.parse(serializeProject(createProject()));
  f.version = 3;
  assert.throws(() => parseProject(JSON.stringify(f)), /более новой версией/);
});

test('not a project: clear messages', () => {
  assert.throws(() => parseProject('{'), /не файл проекта/);
  assert.throws(() => parseProject('{"format":"x"}'), /не файл проекта/);
  assert.throws(() => parseProject(JSON.stringify({ format: FILE_FORMAT, version: 99, rooms: [{}] })), /новой версией/);
  assert.throws(() => parseProject(JSON.stringify({ format: FILE_FORMAT, version: 1, rooms: [] })), /нет помещений/);
});

test('file name from the project name', () => {
  assert.equal(projectFileName({ info: { name: 'Офис: 3/4 "этаж"' } }), 'Офис 3 4 этаж.lcalc.json');
  assert.equal(projectFileName({ info: { name: '' } }), 'Проект.lcalc.json');
});

test('hot keys', () => {
  assert.deepEqual(Object.keys(HOTKEYS), ['F1', 'F2', 'F3', 'F4', 'F5', 'F9', 'F10']);
  assert.equal(hotkeyAction({ key: 'F2' }), 'plan');
  assert.equal(hotkeyAction({ key: 'F5', ctrlKey: true }), null); // Ctrl+F5 stays the browser's
  assert.equal(hotkeyAction({ key: 's', ctrlKey: true }), 'save');
  assert.equal(hotkeyAction({ key: 'x', code: 'KeyS', metaKey: true }), 'save'); // another keyboard layout
  assert.equal(hotkeyAction({ key: 'a' }), null);
});

test('decimal comma and help for every field', () => {
  assert.equal(toDecimal('2.75'), '2,75');
  for (const p of PARAMS) if (p.kind !== 'choice') assert.ok(HELP[`f:${p.key}`], p.key);
  for (const f of INFO_FIELDS) assert.ok(HELP[`f:${f.key}`], f.key);
  for (const k of ['stage1', 'stage2', 'stage3', 'room', 'refl', 'norm', 'grid', 'file', 'results', 'view']) {
    assert.ok(HELP[k] && !/будет добавлен/.test(HELP[k].text), k);
  }
});

test('phone mask «+7 123 456 7890»: typed or pasted in any common form', () => {
  for (const x of ['+7 912 345 6789', '+79123456789', '8 (912) 345-67-89', '9123456789', '7-912-345-67-89', '+7 (912) 345-67-89 доб.'])
    assert.equal(formatPhone(x), '+7 912 345 6789', x);
  assert.deepEqual(['', '9', '+7 91', '+7 9123', '+7 912 3456'].map(formatPhone), ['', '+7 9', '+7 91', '+7 912 3', '+7 912 345 6']);
  assert.equal(formatPhone('+7 912 345 67890000'), '+7 912 345 6789');
  assert.equal(formatPhone('+7 891 234 56789'), '+7 912 345 6789'); // «89123456789» typed digit by digit
});

test('required project information: all but the description', () => {
  const ok = { name: 'Офис', description: '', author: 'А. Б.', phone: '+7 912 345 6789', email: 'a@b.ru', customer: 'ООО' };
  assert.deepEqual(infoErrors(ok), {});
  assert.deepEqual(Object.keys(infoErrors({})).sort(), ['author', 'customer', 'email', 'name', 'phone']);
  assert.ok(infoErrors({ ...ok, phone: '+7 912 345' }).phone);
  assert.ok(infoErrors({ ...ok, email: 'a@b' }).email);
});

test('on-screen isolines: a value left without a label gets its least crowded spot', () => {
  const pts = new Float64Array([0, 0, 100, 0, 200, 0]);
  const spare = new Map([[300, denseCandidates(pts, false, 14).map((c) => ({ ...c, level: 300 }))]]);
  const taken = [[100, 0]];
  const out = missingLabels(spare, new Set(), taken, () => true, 26, 14);
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].x - 100) >= 26);
  assert.equal(missingLabels(spare, new Set([300]), taken, () => true, 26, 14).length, 0);
  assert.equal(missingLabels(spare, new Set(), taken, () => false, 26, 14).length, 0); // not on the screen: nothing
  assert.equal(denseCandidates(new Float64Array([0, 0, 3, 4]), false, 14).length, 1); // a tiny line still has a spot
});
