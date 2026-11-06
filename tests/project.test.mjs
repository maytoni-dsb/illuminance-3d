// Stage 7: project model, project file, hot keys, decimal comma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createRoomState, nextRoomName, serializeProject, parseProject, projectFileName, FILE_FORMAT } from '../js/project.js';
import { hotkeyAction, HOTKEYS } from '../js/hotkeys.js';
import { toComma, DEFAULTS } from '../js/ui.js';
import { HELP } from '../js/help.js';
import { PARAMS } from '../js/ui.js';
import { INFO_FIELDS } from '../js/project.js';

test('rooms get the next free default name and copy the current room', () => {
  const p = createProject();
  assert.equal(p.rooms[0].name, 'Помещение 1');
  p.rooms[0].values.L = 8;
  p.rooms[0].file = { name: 'a.ldt', text: 'x', set: 1 };
  const r = createRoomState(p.rooms, p.rooms[0]);
  assert.equal(r.name, 'Помещение 2');
  assert.equal(r.values.L, 8);
  assert.deepEqual(r.file, p.rooms[0].file);
  assert.notEqual(r.file, p.rooms[0].file);
  assert.equal(nextRoomName([{ name: 'Помещение 2' }, { name: 'Холл' }]), 'Помещение 3');
});

test('a project survives the file round trip; broken values become defaults', () => {
  const p = createProject();
  p.info.name = 'Офис'; p.info.email = 'a@b.c';
  p.rooms.push({ ...createRoomState(p.rooms), name: 'Холл', file: { name: 'f.ldt', text: 'LDT', set: 2 } });
  p.rooms[1].values = { ...p.rooms[1].values, phot: 'file', L: 12.5 };
  p.active = p.rooms[1].id;
  const q = parseProject(serializeProject(p));
  assert.equal(q.info.name, 'Офис');
  assert.deepEqual(q.rooms.map((r) => r.name), ['Помещение 1', 'Холл']);
  assert.equal(q.rooms[1].values.L, 12.5);
  assert.equal(q.rooms[1].values.phot, 'file');
  assert.deepEqual(q.rooms[1].file, { name: 'f.ldt', text: 'LDT', set: 2 });
  assert.equal(q.active, q.rooms[1].id);
  const bad = JSON.parse(serializeProject(p));
  bad.rooms[0].values.L = 'много'; bad.rooms[0].values.ny = 999;
  const r = parseProject(JSON.stringify(bad));
  assert.equal(r.rooms[0].values.L, DEFAULTS.L);
  assert.ok(r.rooms[0].values.nx * r.rooms[0].values.ny <= 500);
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
  assert.equal(hotkeyAction({ key: 'ы', metaKey: true }), 'save');
  assert.equal(hotkeyAction({ key: 'a' }), null);
});

test('decimal comma and help for every field', () => {
  assert.equal(toComma('2.75'), '2,75');
  for (const p of PARAMS) if (p.kind !== 'choice') assert.ok(HELP[`f:${p.key}`], p.key);
  for (const f of INFO_FIELDS) assert.ok(HELP[`f:${f.key}`], f.key);
  for (const k of ['stage1', 'stage2', 'stage3', 'room', 'refl', 'norm', 'grid', 'file', 'results', 'view']) {
    assert.ok(HELP[k] && !/будет добавлен/.test(HELP[k].text), k);
  }
});
