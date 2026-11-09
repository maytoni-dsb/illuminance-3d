// Project: information about the project and its rooms (stage 7). Pure module: no DOM, tested in Node.
// A room keeps the form values, its name and the photometric file (name, text and lamp set), so the
// whole project can be saved to one file and opened again; results are not saved, they are
// recalculated. User-facing strings are in Russian.

import { DEFAULTS, validateParams } from './ui.js';

/** Format tag and version of the project file. */
export const FILE_FORMAT = 'maytoni-lighting-calc';
export const FILE_VERSION = 1;

/** Fields of the stage «Проект» in their order on the page. */
export const INFO_FIELDS = Object.freeze([
  { key: 'name', label: 'Название проекта', kind: 'text', placeholder: 'Например, «Офис на Лесной, 3 этаж»', required: true },
  { key: 'description', label: 'Описание проекта', kind: 'area', placeholder: 'Что освещаем и для чего' },
  { key: 'author', label: 'Исполнитель', kind: 'text', placeholder: 'Фамилия, имя; организация', required: true },
  { key: 'phone', label: 'Телефон', kind: 'tel', placeholder: '+7 123 456 7890', required: true },
  { key: 'email', label: 'Эл. почта', kind: 'email', placeholder: 'name@example.com', required: true },
  { key: 'customer', label: 'Заказчик', kind: 'text', placeholder: 'Организация или частное лицо', required: true },
]);

/**
 * Phone in the mask «+7 123 456 7890». Takes what is typed or pasted: «+7 …», «8 (912) 345-67-89»,
 * «9123456789» — the country code and separators are dropped, at most 10 digits are kept.
 */
export function formatPhone(raw) {
  const s = String(raw ?? '').trim();
  let d = s.startsWith('+7') ? s.slice(2).replace(/\D/g, '') : s.replace(/\D/g, '');
  if (d.length === 11 && /^[78]/.test(d)) d = d.slice(1); // 8 912 … or 7 912 …, also typed after «+7»
  d = d.slice(0, 10);
  if (!d) return '';
  return `+7 ${d.slice(0, 3)}${d.length > 3 ? ` ${d.slice(3, 6)}` : ''}${d.length > 6 ? ` ${d.slice(6)}` : ''}`;
}

/** Problems of the project information: { key: message } for required fields left empty or wrong. */
export function infoErrors(info) {
  const e = {};
  for (const f of INFO_FIELDS) if (f.required && !String(info?.[f.key] ?? '').trim()) e[f.key] = 'Заполните поле';
  if (!e.phone && !/^\+7 \d{3} \d{3} \d{4}$/.test(info.phone)) e.phone = 'Номер из 10 цифр после +7';
  if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(info.email).trim())) e.email = 'Адрес вида name@example.com';
  return e;
}

const emptyInfo = () => Object.fromEntries(INFO_FIELDS.map((f) => [f.key, '']));

let seq = 0;
const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Default name of a new room: «Помещение N», the first N not taken. */
export function nextRoomName(rooms) {
  const taken = new Set(rooms.map((r) => r.name.trim()));
  for (let n = rooms.length + 1; ; n++) if (!taken.has(`Помещение ${n}`)) return `Помещение ${n}`;
}

/**
 * A new room. Without `from` it gets the defaults; with it, a copy of that room's values and file
 * (a new room usually has the same luminaire and norms as the one before).
 */
export function createRoomState(rooms = [], from = null) {
  return {
    id: newId(),
    name: nextRoomName(rooms),
    values: { ...(from ? from.values : DEFAULTS) },
    file: from?.file ? { ...from.file } : null,
    norm: from?.norm ? { ...from.norm } : null, // the codifier row of the norms, null — set by the user
  };
}

/** A new project with one room. */
export function createProject() {
  const room = createRoomState([]);
  return { info: emptyInfo(), rooms: [room], active: room.id };
}

/** Values of a saved room checked against the form rules; invalid or missing ones become defaults. */
function cleanValues(v) {
  const raw = { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
  const r = validateParams(raw);
  if (r.ok) return { ...r.values, phot: raw.phot === 'file' ? 'file' : 'cosine' };
  // drop the fields with errors one by one and keep the rest
  const fixed = { ...raw };
  for (const k of Object.keys(r.errors)) fixed[k] = DEFAULTS[k];
  const r2 = validateParams(fixed);
  return r2.ok ? r2.values : { ...DEFAULTS };
}

/** The project as a JSON string for the file. */
export function serializeProject(p) {
  return JSON.stringify({
    format: FILE_FORMAT, version: FILE_VERSION, saved: new Date().toISOString(),
    info: { ...emptyInfo(), ...p.info },
    rooms: p.rooms.map((r) => ({ name: r.name, values: r.values, norm: r.norm ?? null, file: r.file ? { name: r.file.name, text: r.file.text, set: r.file.set ?? 0 } : null })),
    active: Math.max(0, p.rooms.findIndex((r) => r.id === p.active)),
  }, null, 1);
}

/**
 * Reads a project file. Throws an Error with a message for the user when it is not a project.
 * @param {string} text
 */
export function parseProject(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('Файл не читается: это не файл проекта.'); }
  if (!d || d.format !== FILE_FORMAT) throw new Error('Это не файл проекта расчета освещения.');
  if (!(d.version <= FILE_VERSION)) throw new Error(`Файл сохранен более новой версией программы (${d.version}).`);
  if (!Array.isArray(d.rooms) || !d.rooms.length) throw new Error('В файле проекта нет помещений.');
  const rooms = [];
  for (const r of d.rooms) {
    const file = r.file && typeof r.file.text === 'string' && typeof r.file.name === 'string'
      ? { name: r.file.name, text: r.file.text, set: Number.isInteger(r.file.set) ? r.file.set : 0 } : null;
    const values = cleanValues(r.values);
    if (!file) values.phot = 'cosine';
    const n = r.norm;
    const norm = n && typeof n.source === 'string' && Number.isFinite(n.En) ? { source: n.source, name: typeof n.name === 'string' ? n.name : '', set: String(n.set ?? ''), ref: String(n.ref ?? ''), En: n.En, hwp: n.hwp, U0n: n.U0n ?? null } : null;
    rooms.push({ id: newId(), name: String(r.name ?? '').trim() || nextRoomName(rooms), values, file, norm });
  }
  const info = emptyInfo();
  for (const f of INFO_FIELDS) if (typeof d.info?.[f.key] === 'string') info[f.key] = d.info[f.key];
  const a = Number.isInteger(d.active) && d.active >= 0 && d.active < rooms.length ? d.active : 0;
  return { info, rooms, active: rooms[a].id };
}

/** File name for saving: the project name without characters that file systems refuse. */
export function projectFileName(p) {
  const base = (p.info.name || 'Проект').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Проект';
  return `${base}.lcalc.json`;
}
