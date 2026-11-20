// Fields of a luminaire group in the form (stage 2.1) and their validation. Pure module: no DOM,
// tested in Node (tests/groupform.test.mjs); js/groupui.js builds the fields from these lists.
// Labels and messages come from the dictionaries (gform.<key>, form.err.*).
//
// A field: { key, unit: 'm' | '°' | 'pcs', min?, max?, gt?, int?, step, optional?, when?(g) }; max may
// be a function of the context { H, L, W }. Choices (by, orient) are segmented buttons: { key,
// choice: [values] }. The fields of the single luminaires edit one point of the list (`at`).

import { HM_MIN, MAX_LUMINAIRES, parseNumber, formatNumber } from './ui.js';
import { groupCount } from './groups.js';
import { t } from './i18n.js';

const COORD = { unit: 'm', min: -1000, max: 1000, step: 0.1 };
const HM = { key: 'hm', unit: 'm', min: HM_MIN, max: (c) => c.H, step: 0.1 };
const PSI = { key: 'psi', unit: '°', min: 0, max: 360, step: 15 };
const COUNT = { unit: 'pcs', int: true, min: 1, max: MAX_LUMINAIRES, step: 1 };
const LINE = [
  { key: 'x0', ...COORD }, { key: 'y0', ...COORD }, { key: 'x1', ...COORD }, { key: 'y1', ...COORD },
  { key: 'by', choice: ['count', 'step'] },
  { key: 'n', ...COUNT, when: (g) => g.by !== 'step' },
  { key: 'step', unit: 'm', gt: 0, max: 100, step: 0.1, when: (g) => g.by === 'step' },
  { key: 'off', unit: 'm', min: 0, max: 100, step: 0.1 },
];

/** Fields of every kind of group, in the order of the form. */
export const GROUP_FIELDS = Object.freeze({
  grid: [
    { key: 'nx', ...COUNT, max: 30 }, { key: 'ny', ...COUNT, max: 30 }, HM, { ...PSI, max: 180, step: 90 },
    // the area of the grid: all four empty — the whole room
    { key: 'ax0', ...COORD, optional: true }, { key: 'ay0', ...COORD, optional: true },
    { key: 'ax1', ...COORD, optional: true }, { key: 'ay1', ...COORD, optional: true },
  ],
  line: [...LINE, HM, PSI],
  lines: [...LINE, { key: 'rows', ...COUNT }, { key: 'gap', unit: 'm', min: -100, max: 100, step: 0.1 }, HM, PSI],
  circle: [
    { key: 'cx', ...COORD }, { key: 'cy', ...COORD }, { key: 'r', unit: 'm', gt: 0, max: 100, step: 0.1 },
    { key: 'n', ...COUNT }, { key: 'start', unit: '°', min: 0, max: 360, step: 15 },
    { key: 'orient', choice: ['tangent', 'radial', 'fixed'] }, HM, PSI,
  ],
  single: [{ key: 'x', ...COORD }, { key: 'y', ...COORD }, HM, PSI],
});

const AREA = ['ax0', 'ay0', 'ax1', 'ay1'];

/**
 * The values a group shows in its fields (numbers and choices); a single luminaire group shows the
 * point `at`.
 */
export function groupFieldValues(g, at = 0) {
  if (g.kind === 'single') { const p = g.points[Math.min(at, g.points.length - 1)] ?? {}; return { x: p.x, y: p.y, hm: p.hm, psi: p.psi }; }
  const v = { ...g };
  if (g.kind === 'grid') {
    const a = g.area;
    Object.assign(v, a ? { ax0: a.x0, ay0: a.y0, ax1: a.x1, ay1: a.y1 } : { ax0: null, ay0: null, ax1: null, ay1: null });
  }
  return v;
}

/** The fields shown for the group values (their `when`). */
export const visibleFields = (kind, v) => GROUP_FIELDS[kind].filter((f) => !f.when || f.when(v));

/**
 * Validates the fields of a group and returns the edited group.
 * @param {object} g — the group as it is
 * @param {Record<string, string|number|null>} raw — field values (strings as typed, or numbers)
 * @param {{ H: number, others: number, at?: number }} ctx — room height, number of luminaires of
 *        the other groups (the limit of 500 counts the whole room), the point of a single group
 * @returns {{ ok: boolean, group: object, errors: Record<string, string> }}
 */
export function validateGroup(g, raw, ctx) {
  const fields = GROUP_FIELDS[g.kind];
  const v = {}, errors = {};
  for (const f of fields) if (f.choice) v[f.key] = f.choice.includes(raw[f.key]) ? raw[f.key] : (g[f.key] ?? f.choice[0]);
  for (const f of fields) {
    if (f.choice) continue;
    if (f.when && !f.when(v)) continue;
    const s = raw[f.key];
    if (f.optional && (s == null || String(s).trim() === '')) { v[f.key] = null; continue; }
    const x = parseNumber(s ?? '');
    if (!Number.isFinite(x)) { errors[f.key] = t('form.err.number'); continue; }
    if (f.int && !Number.isInteger(x)) { errors[f.key] = t('form.err.int'); continue; }
    const max = typeof f.max === 'function' ? f.max(ctx) : f.max;
    const unit = f.unit === 'm' ? ` ${t('unit.m')}` : f.unit === '°' ? '°' : '';
    if (f.gt !== undefined && !(x > f.gt)) { errors[f.key] = t('form.err.rangeGt', { gt: formatNumber(f.gt), max: formatNumber(max), unit, note: '' }); continue; }
    if ((f.min !== undefined && x < f.min) || x > max) {
      errors[f.key] = t('form.err.range', { min: formatNumber(f.min), max: formatNumber(max), unit, note: '' });
      continue;
    }
    v[f.key] = x;
  }
  let out;
  if (g.kind === 'single') {
    const at = Math.min(ctx.at ?? 0, g.points.length - 1);
    out = { ...g, points: g.points.map((p, k) => (k === at ? { x: v.x ?? p.x, y: v.y ?? p.y, hm: v.hm ?? p.hm, psi: v.psi ?? p.psi } : p)) };
  } else {
    out = { ...g };
    for (const f of fields) if (v[f.key] !== undefined && !AREA.includes(f.key)) out[f.key] = v[f.key];
  }
  if (g.kind === 'grid') {
    const a = AREA.map((k) => v[k]);
    const empty = a.every((x) => x === null);
    if (empty) delete out.area;
    else if (a.some((x) => x === null)) { for (const k of AREA) if (v[k] === null) errors[k] = t('gform.err.area'); }
    else if (a.every((x) => x !== undefined)) {
      if (!(a[2] > a[0])) errors.ax1 = t('gform.err.areaX');
      else if (!(a[3] > a[1])) errors.ay1 = t('gform.err.areaY');
      else out.area = { x0: a[0], y0: a[1], x1: a[2], y1: a[3] };
    }
  }
  if (g.kind === 'line' || g.kind === 'lines') {
    if (out.x0 === out.x1 && out.y0 === out.y1 && !errors.x1) errors.x1 = t('gform.err.line');
  }
  if (g.kind === 'lines' && out.gap === 0 && !errors.gap) errors.gap = t('gform.err.gap');
  // the limit of the room: this group and all the others
  if (!Object.keys(errors).length) {
    const n = groupCount(out), total = n + (ctx.others ?? 0);
    if (total > MAX_LUMINAIRES) {
      const key = { grid: 'ny', line: out.by === 'step' ? 'step' : 'n', lines: 'rows', circle: 'n', single: 'x' }[g.kind];
      errors[key] = t('gform.err.count', { max: MAX_LUMINAIRES, n, total });
    }
  }
  return { ok: Object.keys(errors).length === 0, group: out, errors };
}
