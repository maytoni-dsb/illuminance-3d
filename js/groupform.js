// Fields of the placement of luminaires (stage 2.1, the editor after DIALux): rows of an icon and up
// to three fields, the axis letter inside the field; the fields of the selected group, or of the
// next group to draw (`draft`: no geometry, it comes from the drawing). Pure module: no DOM,
// tested in Node (tests/groupform.test.mjs); js/groupui.js builds the rows. Tips and messages come
// from the dictionaries (gform.*, form.err.*).
//
// A field: { key, ax: letter in the field, unit: 'm' | '°' | 'pcs', min?, max?, gt?, int?, step,
// geo?: part of the drawn geometry (not in the draft) }; max may be a function of { H }.

import { HM_MIN, MAX_LUMINAIRES, parseNumber, formatNumber } from './ui.js';
import { groupCount, areaCentre, areaOf } from './groups.js';
import { t } from './i18n.js';

const C = (key, ax) => ({ key, ax, unit: 'm', min: -1000, max: 1000, step: 0.1, geo: true });
const HM = (key = 'hm') => ({ key, ax: 'Z', unit: 'm', min: HM_MIN, max: (c) => c.H, step: 0.1 });
const PSI = { key: 'psi', ax: 'Z', unit: '°', min: 0, max: 360, step: 15 };
const N = (key, ax, max = MAX_LUMINAIRES) => ({ key, ax, unit: 'pcs', int: true, min: 1, max, step: 1 });
const LEN = (key, ax) => ({ key, ax, unit: 'm', gt: 0, max: 1000, step: 0.1, geo: true });

/** Rows of every kind: { icon, tip, fields }. */
export const GROUP_ROWS = Object.freeze({
  single: [
    { icon: 'pos', tip: 'pos', fields: [C('x', 'X'), C('y', 'Y'), HM()] },
    { icon: 'rot', tip: 'rot', fields: [PSI] },
  ],
  grid: [
    { icon: 'count', tip: 'countXY', fields: [N('nx', 'X', 30), N('ny', 'Y', 30)] },
    { icon: 'size', tip: 'size', fields: [LEN('gw', 'X'), LEN('gh', 'Y')] },
    { icon: 'centre', tip: 'gridPos', fields: [C('gx', 'X'), C('gy', 'Y'), HM()] },
    { icon: 'rot', tip: 'rotEach', fields: [PSI] },
  ],
  line: [
    { icon: 'count', tip: 'countLen', fields: [N('n', 'N'), LEN('len', 'L')] },
    { icon: 'start', tip: 'start', fields: [C('x0', 'X'), C('y0', 'Y'), HM('hm')] },
    { icon: 'end', tip: 'end', fields: [C('x1', 'X'), C('y1', 'Y'), HM('hm1')] },
    { icon: 'rot', tip: 'rotLine', fields: [PSI] },
  ],
  circle: [
    { icon: 'count', tip: 'countR', fields: [N('n', 'N'), LEN('r', 'R')] },
    { icon: 'centre', tip: 'centre', fields: [C('cx', 'X'), C('cy', 'Y'), HM()] },
    { icon: 'rot', tip: 'rotCircle', fields: [PSI] },
  ],
});

/** Rows shown: of the group, or of the next group to draw (no geometry). */
export function rowsOf(kind, draft = false) {
  return GROUP_ROWS[kind].map((r) => ({ ...r, fields: draft ? r.fields.filter((f) => !f.geo) : r.fields })).filter((r) => r.fields.length);
}

/** Defaults of the next group to draw. */
export const DRAFT = Object.freeze({ single: { hm: null, psi: 0 }, grid: { nx: 2, ny: 2, hm: null, psi: 0 }, line: { n: 3, hm: null, hm1: null, psi: 0 }, circle: { n: 6, hm: null, psi: 0 } });

/**
 * Values the fields show. A group: its parameters (a grid: centre and size of its area, the room
 * when it has none; a line: its length; single luminaires: the point `at`). A draft: its values
 * (no height: the room height).
 */
export function fieldValues(g, ctx) {
  if (g.kind === 'single') {
    const p = g.points[Math.min(ctx.at ?? 0, g.points.length - 1)] ?? {};
    return { x: p.x, y: p.y, hm: p.hm, psi: p.psi };
  }
  const v = { ...g };
  if (g.kind === 'grid') {
    const a = areaCentre(g.area ?? { x0: 0, y0: 0, x1: ctx.L, y1: ctx.W });
    Object.assign(v, { gx: a.cx, gy: a.cy, gw: a.w, gh: a.h });
  }
  if (g.kind === 'line') v.len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
  return v;
}

/** Values of a draft: its own, the room height for an empty height. */
export const draftValues = (kind, d, ctx) => {
  const v = { ...DRAFT[kind], ...d };
  for (const k of ['hm', 'hm1']) if (k in v && v[k] == null) v[k] = ctx.H;
  return v;
};

function parseFields(fields, raw, ctx, errors) {
  const v = {};
  for (const f of fields) {
    const x = parseNumber(raw[f.key] ?? '');
    if (!Number.isFinite(x)) { errors[f.key] = t('form.err.number'); continue; }
    if (f.int && !Number.isInteger(x)) { errors[f.key] = t('form.err.int'); continue; }
    const max = typeof f.max === 'function' ? f.max(ctx) : f.max;
    const unit = f.unit === 'm' ? ` ${t('unit.m')}` : f.unit === '°' ? '°' : '';
    if (f.gt !== undefined && !(x > f.gt)) { errors[f.key] = t('form.err.rangeGt', { gt: formatNumber(f.gt), max: formatNumber(max), unit, note: '' }); continue; }
    if ((f.min !== undefined && x < f.min) || x > max) { errors[f.key] = t('form.err.range', { min: formatNumber(f.min), max: formatNumber(max), unit, note: '' }); continue; }
    v[f.key] = x;
  }
  return v;
}

/**
 * Validates the fields of a group and returns the edited group.
 * @param {Record<string, string|number>} raw — field values as typed
 * @param {{ H, L, W, others, at? }} ctx — room height and size, luminaires of the other groups
 *        (the limit of 500 counts the whole room), the point of a single group
 * @returns {{ ok, group, errors }}
 */
export function validateGroup(g, raw, ctx) {
  const errors = {};
  const fields = GROUP_ROWS[g.kind].flatMap((r) => r.fields);
  const v = parseFields(fields, raw, ctx, errors);
  let out = { ...g };
  const has = (k) => v[k] !== undefined;
  switch (g.kind) {
    case 'single': {
      const at = Math.min(ctx.at ?? 0, g.points.length - 1);
      out.points = g.points.map((p, k) => (k === at ? { x: v.x ?? p.x, y: v.y ?? p.y, hm: v.hm ?? p.hm, psi: v.psi ?? p.psi } : p));
      break;
    }
    case 'grid': {
      for (const k of ['nx', 'ny', 'hm', 'psi']) if (has(k)) out[k] = v[k];
      const cur = fieldValues(g, ctx);
      if (['gx', 'gy', 'gw', 'gh'].every(has)) {
        const same = ['gx', 'gy', 'gw', 'gh'].every((k) => Math.abs(v[k] - cur[k]) < 1e-9);
        if (!same || g.area) out.area = same && g.area ? g.area : areaOf(v.gx, v.gy, v.gw, v.gh);
      }
      break;
    }
    case 'line': {
      for (const k of ['n', 'hm', 'hm1', 'psi', 'x0', 'y0', 'x1', 'y1']) if (has(k)) out[k] = v[k];
      // the length moves the end point along the line (a new end point gives a new length)
      const cur = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
      if (has('len') && Math.abs(v.len - cur) > 1e-9 && out.x1 === g.x1 && out.y1 === g.y1) {
        const dx = out.x1 - out.x0, dy = out.y1 - out.y0, l = Math.hypot(dx, dy);
        const ux = l > 0 ? dx / l : 1, uy = l > 0 ? dy / l : 0;
        out.x1 = out.x0 + ux * v.len; out.y1 = out.y0 + uy * v.len;
      }
      if (out.x0 === out.x1 && out.y0 === out.y1 && !errors.x1) errors.x1 = t('gform.err.line');
      break;
    }
    case 'circle':
      for (const k of ['n', 'r', 'cx', 'cy', 'hm', 'psi']) if (has(k)) out[k] = v[k];
      break;
    default:
  }
  if (!Object.keys(errors).length) {
    const n = groupCount(out), total = n + (ctx.others ?? 0);
    if (total > 500) errors[{ grid: 'ny', line: 'n', circle: 'n', single: 'x' }[g.kind]] = t('gform.err.count', { max: MAX_LUMINAIRES, n, total });
  }
  return { ok: Object.keys(errors).length === 0, group: out, errors };
}

/** Validates the fields of the next group to draw: { ok, draft, errors }. */
export function validateDraft(kind, raw, ctx) {
  const errors = {};
  const v = parseFields(rowsOf(kind, true).flatMap((r) => r.fields), raw, ctx, errors);
  const draft = { ...DRAFT[kind], ...v };
  if (!errors.nx && !errors.ny && kind === 'grid' && draft.nx * draft.ny + (ctx.others ?? 0) > MAX_LUMINAIRES) errors.ny = t('gform.err.count', { max: MAX_LUMINAIRES, n: draft.nx * draft.ny, total: draft.nx * draft.ny + (ctx.others ?? 0) });
  if (!errors.n && (kind === 'line' || kind === 'circle') && draft.n + (ctx.others ?? 0) > MAX_LUMINAIRES) errors.n = t('gform.err.count', { max: MAX_LUMINAIRES, n: draft.n, total: draft.n + (ctx.others ?? 0) });
  return { ok: Object.keys(errors).length === 0, draft, errors };
}
