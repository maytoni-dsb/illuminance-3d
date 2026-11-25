// Fields of the placement of luminaires (stage 2.1; the interface pass of 21 Nov 2026): rows of an
// icon and up to three fields, the axis letter inside the field, and an extra control of the row
// (the ways of spacing, "fit to the room", the measure of a circle); the fields of the selected
// group only — the next group takes the values of the last one drawn. Pure module: no DOM,
// tested in Node (tests/groupform.test.mjs); js/groupui.js builds the rows. Tips and messages come
// from the dictionaries (gform.*, form.err.*).
//
// A field: { key, ax: letter in the field, unit: 'm' | '°' | 'pcs', min?, max?, gt?, int?, step,
// geo?: part of the drawn geometry (not in the draft) }; max may be a function of { H }.

import { HM_MIN, MAX_LUMINAIRES, parseNumber, formatNumber } from './ui.js';
import { groupCount, areaCentre, areaOf, normArc, tiltOf } from './groups.js';
import { t } from './i18n.js';

const C = (key, ax) => ({ key, ax, unit: 'm', min: -1000, max: 1000, step: 0.1, geo: true });
const HM = (key = 'hm') => ({ key, ax: 'Z', unit: 'm', min: HM_MIN, max: (c) => c.H, step: 0.1 });
const PSI = { key: 'psi', ax: 'Z', unit: '°', min: 0, max: 360, step: 15 };
const N = (key, ax, max = MAX_LUMINAIRES) => ({ key, ax, unit: 'pcs', int: true, min: 1, max, step: 1 });
const LEN = (key, ax) => ({ key, ax, unit: 'm', gt: 0, max: 1000, step: 0.1, geo: true });
const ANG = (key, ax) => ({ key, ax, unit: '°', min: -720, max: 720, step: 15 });
// the tilt about the luminaire's own X (C0) and Y (C90) axes (stage 2.1a, 25 Nov 2026): −90…90°
const TILT = (key, ax) => ({ key, ax, unit: '°', min: -90, max: 90, step: 15 });
const ROT = (tip) => ({ icon: 'rot', tip, fields: [TILT('tx', 'X'), TILT('ty', 'Y'), PSI] });

/**
 * Rows of every kind: { icon, tip, fields, extra? } — extra: 'mx' | 'my' | 'm' (the ways of spacing
 * along X, Y, the line), 'fit' (the grid over the room), 'measure' (radius, diameter or length).
 */
export const GROUP_ROWS = Object.freeze({
  single: [
    { icon: 'pos', tip: 'pos', fields: [C('x', 'X'), C('y', 'Y'), HM()] },
    ROT('rot'),
  ],
  grid: [
    { icon: 'count', tip: 'countX', fields: [N('nx', 'X', 30)], extra: 'mx' },
    { icon: null, tip: 'countY', fields: [N('ny', 'Y', 30)], extra: 'my' },
    { icon: 'size', tip: 'size', fields: [LEN('gw', 'X'), LEN('gh', 'Y')], extra: 'fit' },
    { icon: 'centre', tip: 'gridPos', fields: [C('gx', 'X'), C('gy', 'Y'), HM()] },
    ROT('rotEach'),
  ],
  line: [
    { icon: 'count', tip: 'count', fields: [N('n', 'N')], extra: 'm' },
    { icon: 'start', tip: 'start', fields: [C('x0', 'X'), C('y0', 'Y'), HM('hm')] },
    { icon: 'end', tip: 'end', fields: [C('x1', 'X'), C('y1', 'Y'), HM('hm1')] },
    ROT('rotLine'),
  ],
  circle: [
    { icon: 'count', tip: 'countArc', fields: [N('n', 'N'), ANG('a0', 'α₁'), ANG('a1', 'α₂')] },
    { icon: 'size', tip: 'measure', fields: [LEN('sz', 'R')], extra: 'measure' },
    { icon: 'centre', tip: 'centre', fields: [C('cx', 'X'), C('cy', 'Y'), HM()] },
    ROT('rotCircle'),
  ],
});

/** The measure of a circle (21 Nov 2026): radius, diameter, length of the circle or the arc. */
export const MEASURES = Object.freeze(['r', 'd', 'p']);
const measureOf = (g, m) => (m === 'd' ? 2 * g.r : m === 'p' ? g.r * ((g.a1 ?? 360) - (g.a0 ?? 0)) * Math.PI / 180 : g.r);
const radiusOf = (g, m, v) => (m === 'd' ? v / 2 : m === 'p' ? v / (((g.a1 ?? 360) - (g.a0 ?? 0)) * Math.PI / 180) : v);

/** Rows shown: of the group, or of the next group to draw (no geometry). */
export function rowsOf(kind, draft = false) {
  return GROUP_ROWS[kind].map((r) => ({ ...r, fields: draft ? r.fields.filter((f) => !f.geo) : r.fields })).filter((r) => r.fields.length);
}

/** Defaults of the next group to draw. */
export const DRAFT = Object.freeze({ single: { hm: null, psi: 0, tx: 0, ty: 0 }, grid: { nx: 2, ny: 2, hm: null, psi: 0, tx: 0, ty: 0 }, line: { n: 3, hm: null, hm1: null, psi: 0, tx: 0, ty: 0 }, circle: { n: 6, hm: null, psi: 0, tx: 0, ty: 0 } });

/** The selection of a grid over the whole room (it gets "Pick the count"). */
export const gridOverRoom = (g, L, W) => g.kind === 'grid' && (!g.area || (Math.abs(g.area.x0) < 1e-9 && Math.abs(g.area.y0) < 1e-9 && Math.abs(g.area.x1 - L) < 1e-9 && Math.abs(g.area.y1 - W) < 1e-9));

/**
 * Values the fields show. A group: its parameters (a grid: centre and size of its area, the room
 * when it has none; a line: its length; single luminaires: the point `at`). A draft: its values
 * (no height: the room height).
 */
export function fieldValues(g, ctx) {
  if (g.kind === 'single') {
    const p = g.points[Math.min(ctx.at ?? 0, g.points.length - 1)] ?? {};
    return { x: p.x, y: p.y, hm: p.hm, psi: p.psi, tx: p.tx ?? 0, ty: p.ty ?? 0 };
  }
  const v = { ...g };
  if (g.kind === 'grid') {
    const a = areaCentre(g.area ?? { x0: 0, y0: 0, x1: ctx.L, y1: ctx.W });
    Object.assign(v, { gx: a.cx, gy: a.cy, gw: a.w, gh: a.h });
  }
  if (g.kind === 'circle') Object.assign(v, { a0: g.a0 ?? 0, a1: g.a1 ?? 360, sz: measureOf(g, ctx.measure ?? 'r') });
  v.tx = g.tx ?? 0; v.ty = g.ty ?? 0;
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
    if (f.off) continue;
    // several luminaires with different values: the empty field changes nothing
    if (ctx.multi && String(raw[f.key] ?? '').trim() === '') continue;
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
      // the tilt (2.1a): kept only when not zero; NaN — different values of several luminaires — stays
      const pt = (p) => { const q = { x: v.x ?? p.x, y: v.y ?? p.y, hm: v.hm ?? p.hm, psi: v.psi ?? p.psi, tx: v.tx ?? p.tx ?? 0, ty: v.ty ?? p.ty ?? 0 }; if (!q.tx && !q.ty) { delete q.tx; delete q.ty; } return q; };
      out.points = g.points.map((p, k) => (k === at ? pt(p) : p));
      break;
    }
    case 'grid': {
      for (const k of ['nx', 'ny', 'hm', 'psi']) if (has(k)) out[k] = v[k];
      const cur = fieldValues(g, ctx);
      if (['gx', 'gy', 'gw', 'gh'].every(has)) {
        const same = ['gx', 'gy', 'gw', 'gh'].every((k) => Math.abs(v[k] - cur[k]) < 1e-9);
        if (!same || g.area) out.area = same && g.area ? g.area : areaOf(v.gx, v.gy, v.gw, v.gh);
      }
      // own axes (25 Nov 2026): another count drops them, another size scales them
      if (out.nx !== g.nx) delete out.xs;
      if (out.ny !== g.ny) delete out.ys;
      const w0 = cur.gw, h0 = cur.gh, a2 = out.area;
      if (out.xs && a2 && Math.abs(a2.x1 - a2.x0 - w0) > 1e-9) out.xs = out.xs.map((x) => (x * (a2.x1 - a2.x0)) / w0);
      if (out.ys && a2 && Math.abs(a2.y1 - a2.y0 - h0) > 1e-9) out.ys = out.ys.map((y) => (y * (a2.y1 - a2.y0)) / h0);
      break;
    }
    case 'line': {
      for (const k of ['n', 'hm', 'hm1', 'psi', 'x0', 'y0', 'x1', 'y1']) if (has(k)) out[k] = v[k];
      if (out.x0 === out.x1 && out.y0 === out.y1 && !errors.x1) errors.x1 = t('gform.err.line');
      // own distances: another count drops them, a shorter line keeps them on it
      if (out.n !== g.n) delete out.ts;
      if (out.ts) { const len = Math.hypot(out.x1 - out.x0, out.y1 - out.y0); out.ts = out.ts.map((d) => Math.min(d, len)); }
      break;
    }
    case 'circle': {
      for (const k of ['n', 'cx', 'cy', 'hm', 'psi']) if (has(k)) out[k] = v[k];
      if (has('a0') && has('a1')) {
        const [a0, a1] = normArc(v.a0, v.a1);
        if (a0 === 0 && a1 === 360) { delete out.a0; delete out.a1; } else Object.assign(out, { a0, a1 });
      }
      // the measure typed: of the arc as it is now
      if (has('sz')) {
        const r = radiusOf(out, ctx.measure ?? 'r', v.sz);
        const cur = measureOf(g, ctx.measure ?? 'r');
        if (Math.abs(v.sz - cur) > 1e-9) out.r = r;
      }
      break;
    }
    default:
  }
  // the tilt of the luminaires of a group (2.1a): kept only when not zero
  if (g.kind !== 'single') {
    for (const k of ['tx', 'ty']) if (has(k)) out[k] = v[k];
    const tl = tiltOf(out.tx, out.ty);
    delete out.tx; delete out.ty;
    Object.assign(out, tl);
  }
  if (!Object.keys(errors).length) {
    const n = groupCount(out), total = n + (ctx.others ?? 0);
    if (total > 500) errors[{ grid: 'ny', line: 'n', circle: 'n', single: 'x' }[g.kind]] = t('gform.err.count', { max: MAX_LUMINAIRES, n, total });
  }
  // luminaires moved within the group: another count numbers them anew, the offsets go (25 Nov 2026)
  if (out.offs && groupCount(out) !== groupCount(g)) delete out.offs;
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
