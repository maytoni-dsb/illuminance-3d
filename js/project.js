// Project: information about the project and its rooms (stage 7). Pure module: no DOM, tested in Node.
// A room keeps the form values, its name and the photometric file (name, text and lamp set), so the
// whole project can be saved to one file and opened again; results are not saved, they are
// recalculated. User-facing strings come from the dictionaries (js/i18n.js).

import { DEFAULTS, validateParams } from './ui.js';
import { t, raw } from './i18n.js';

/** Format tag and version of the project file. */
export const FILE_FORMAT = 'maytoni-lighting-calc';
export const FILE_VERSION = 1;

/** Fields of the stage "Project" in their order on the page (label and placeholder: info.<key>). */
export const INFO_FIELDS = Object.freeze([
  { key: 'name', kind: 'text', required: true },
  { key: 'description', kind: 'area' },
  { key: 'author', kind: 'text', required: true },
  { key: 'phone', kind: 'tel', required: true },
  { key: 'email', kind: 'email', required: true },
  { key: 'customer', kind: 'text', required: true },
].map((f) => Object.freeze({
  ...f,
  get label() { return t(`info.${f.key}.label`); },
  get placeholder() { return f.key === 'phone' ? t('info.phone.placeholder', { code: phoneCodes()[0] }) : t(`info.${f.key}.placeholder`); },
})));

/**
 * Phone masks by country code (stage 8). digits — the allowed numbers of digits after the code;
 * groups(d) — the digit groups of a national number (without the leading 0).
 *   +7  (Russia): 10 digits, 3 3 4 — +7 912 345 6789;
 *   +44 (United Kingdom): 10 digits; London and other 2x numbers 2 4 4 (+44 20 7946 0958), mobiles
 *       7x 4 6 (+44 7700 900123), the rest 3 3 4 (+44 113 496 0000);
 *   +49 (Germany): 6…11 digits, the length varies; mobiles 15x–17x and the area codes 30, 40, 69,
 *       89 are split off (+49 151 23456789, +49 30 12345678), else three digits (+49 211 1234567).
 */
export const PHONE = Object.freeze({
  '+7': { digits: [10, 10], groups: (d) => [3, 3, 4] },
  '+44': { digits: [10, 10], groups: (d) => (d[0] === '2' ? [2, 4, 4] : d[0] === '7' ? [4, 6] : [3, 3, 4]) },
  '+49': { digits: [6, 11], groups: (d) => (/^(30|40|69|89)/.test(d) ? [2, 9] : [3, 8]) },
});

/** Country codes offered by the language: the first is the default (ru: +7; en: +44, +49; de: +49, +44). */
export const phoneCodes = () => raw('info.phone.codes');

/** Country code of a stored or typed number, '' when it has none of PHONE. */
export function phoneCode(raw) {
  const s = String(raw ?? '').replace(/[^\d+]/g, '');
  return Object.keys(PHONE).sort((a, b) => b.length - a.length).find((c) => s.startsWith(c)) ?? '';
}

/**
 * Phone in the mask of a country code: «+7 123 456 7890», «+44 20 7946 0958», «+49 30 12345678».
 * Takes what is typed or pasted: the code (with or without +), a leading 0 or the Russian 8,
 * brackets, hyphens and spaces are dropped; the digits beyond the longest number are cut.
 * @param {string} raw
 * @param {string} [code] — the country code; by default the code of the number or of the language
 */
export function formatPhone(raw, code) {
  if (typeof code !== 'string' || !PHONE[code]) code = phoneCode(raw) || phoneCodes()[0]; // also as a map() callback
  const m = PHONE[code];
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  const cd = code.slice(1);
  if (s.replace(/[^\d+]/g, '').startsWith(code)) d = d.slice(cd.length);
  if (code === '+7' && d.length === 11 && /^[78]/.test(d)) d = d.slice(1); // 8 912 … or 7 912 …, also typed after «+7»
  else if (code !== '+7' && d.startsWith('0')) d = d.replace(/^0+/, ''); // the trunk prefix 0 of a national number
  d = d.slice(0, m.digits[1]);
  if (!d) return '';
  const out = [];
  let at = 0;
  for (const n of m.groups(d)) { if (at >= d.length) break; out.push(d.slice(at, at + n)); at += n; }
  if (at < d.length) out[out.length - 1] += d.slice(at);
  return `${code} ${out.join(' ')}`;
}

/** Problems of the project information: { key: message } for required fields left empty or wrong. */
export function infoErrors(info) {
  const e = {};
  for (const f of INFO_FIELDS) if (f.required && !String(info?.[f.key] ?? '').trim()) e[f.key] = t('info.err.empty');
  if (!e.phone) {
    const code = phoneCode(info.phone), m = PHONE[code];
    const n = m ? String(info.phone).slice(code.length).replace(/\D/g, '').length : 0;
    const formatted = m && formatPhone(info.phone, code) === String(info.phone).trim();
    if (!m || !formatted || n < m.digits[0] || n > m.digits[1]) {
      const c = code || phoneCodes()[0], mm = PHONE[c];
      e.phone = mm.digits[0] === mm.digits[1] ? t('info.err.phone', { n: mm.digits[0], code: c })
        : t('info.err.phoneRange', { min: mm.digits[0], max: mm.digits[1], code: c });
    }
  }
  if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(info.email).trim())) e.email = t('info.err.email');
  return e;
}

const emptyInfo = () => Object.fromEntries(INFO_FIELDS.map((f) => [f.key, '']));

let seq = 0;
const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Default name of a new room: «Room N» in the language, the first N not taken. */
export function nextRoomName(rooms) {
  const taken = new Set(rooms.map((r) => r.name.trim()));
  for (let n = rooms.length + 1; ; n++) if (!taken.has(t('project.roomName', { n }))) return t('project.roomName', { n });
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
  try { d = JSON.parse(text); } catch (e) { throw new Error(t('project.err.json')); }
  if (!d || d.format !== FILE_FORMAT) throw new Error(t('project.err.format'));
  if (!(d.version <= FILE_VERSION)) throw new Error(t('project.err.version', { v: d.version }));
  if (!Array.isArray(d.rooms) || !d.rooms.length) throw new Error(t('project.err.rooms'));
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
  const base = (p.info.name || t('project.fileName')).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || t('project.fileName');
  return `${base}.lcalc.json`;
}
