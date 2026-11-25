// Data model of version 2 (spec v2, "Data model"). Pure module: no DOM, tested in Node.
//
// A room is an outline in plan with a height and reflectances; luminaires come in three levels:
// type → group → instance. Types and groups are stored, instances are generated from the groups
// and go to the calculation together with the outline (calc.js, CalcParams).
//
// Stage 2.0: a rectangle and one group "grid" of one type, edited by the version 1 form:
// formValues() shows such a model as form values, modelFromValues() makes one from them.
// Stage 2.1: any number of types and groups of every kind (js/groups.js); isFormModel() tells
// whether the version 1 form can still show a model. Stage 2.3 adds the other shapes.
//
//   RoomModel = {
//     room:   { shape: { kind: 'rect', L, W }, H, rho: { ceiling, walls, floor } },
//     design: { En, hwp, U0n, mf },                       — the norm and the maintenance factor
//     types:  [{ id, name?, photometry: 'cosine' | 'file', flux, cct, power,
//                file: { name, text, set } | null }],     — the file content is kept, as in v1
//     groups: [{ id, type, kind, …parameters of the kind (groups.js) }], — angles in degrees
//   }

import { DEFAULTS, validateParams, faceRho, ceilingDrop, photometricHeight, HM_MIN, MAX_LUMINAIRES } from './ui.js';
import { rectOutline } from './geometry.js';
import { luminaireShape } from './photfile.js';
import { GROUP_KINDS, SPACINGS, groupPoints, groupCount, housingHalf, boxInOutline, wrapDeg, moveGroup, ungroup, normArc, housingExtent, tiltOf } from './groups.js';
import { lumMatrix } from './direct.js';
import { cleanPlanGrid, PLAN_GRID } from './planedit.js';

/** Shapes of the room the model takes (stage 2.3 adds L, U and T). */
export const SHAPES = Object.freeze(['rect']);
export { GROUP_KINDS };

const DEG = Math.PI / 180;

/** A file reference { name, text, set } or null when it is not one. */
export function cleanFile(f) {
  return f && typeof f.text === 'string' && typeof f.name === 'string'
    ? { name: f.name, text: f.text, set: Number.isInteger(f.set) && f.set >= 0 ? f.set : 0 } : null;
}

/**
 * Model of a room from the values of the version 1 form and its photometric file. This is also how
 * a room of a version 1 project file is read: the grid becomes one group "grid" of one type.
 * @param {Record<string, number|string|null>} v — validated form values (ui.validateParams)
 * @param {{ name, text, set }|null} file
 * @param {{ type?: string, group?: string }} ids — ids to keep (an edited model keeps its ids)
 */
export function modelFromValues(v, file = null, ids = {}) {
  const type = ids.type ?? 't1', group = ids.group ?? 'g1';
  return {
    room: { shape: { kind: 'rect', L: v.L, W: v.W }, H: v.H, rho: { ceiling: v.rhoC, walls: v.rhoW, floor: v.rhoF } },
    design: { En: v.En, hwp: v.hwp, U0n: v.U0n ?? null, mf: v.mf },
    types: [{ id: type, photometry: v.phot === 'file' ? 'file' : 'cosine', flux: v.flux, cct: v.cct, power: v.power, file: cleanFile(file) }],
    groups: [{ id: group, type, kind: 'grid', nx: v.nx, ny: v.ny, hm: v.hm, psi: v.psi }],
  };
}

/**
 * The values of the version 1 form that show a model: the room, the first type and the first grid
 * (a model without a grid: the count of all luminaires along X and the height of the first one).
 */
export function formValues(m) {
  const g = m.groups.find((x) => x.kind === 'grid');
  const first = m.groups.length ? groupPoints(m.groups[0], roomSize(m))[0] : null;
  return {
    ...roomValues(m),
    nx: g ? g.nx : lumCount(m), ny: g ? g.ny : 1, hm: g ? g.hm : first?.hm ?? m.room.H, psi: g ? g.psi : 0,
    ...(m.types[0] ? typeValues(m.types[0]) : { phot: 'cosine', flux: DEFAULTS.flux, cct: DEFAULTS.cct, power: DEFAULTS.power }),
  };
}

/**
 * A room without luminaires (21 Nov 2026: a new project and a new room have none; the panel asks
 * for a photometric file): the room and the norms of the values, no types, no groups.
 */
export function emptyModel(v) {
  const m = modelFromValues(v);
  return { ...m, types: [], groups: [] };
}

/** Values of the room and the norms, as the form shows them. */
export function roomValues(m) {
  const { room, design } = m;
  return {
    L: room.shape.L, W: room.shape.W, H: room.H,
    rhoC: room.rho.ceiling, rhoW: room.rho.walls, rhoF: room.rho.floor,
    En: design.En, hwp: design.hwp, U0n: design.U0n, mf: design.mf,
  };
}

/** Values of a luminaire type, as the form shows them. */
export const typeValues = (ty) => ({ phot: ty.photometry, flux: ty.flux, cct: ty.cct, power: ty.power });

/**
 * The model with the room and the norms of the form values. A mounting height equal to the room
 * height follows it (spec v1, "Luminaires": while h_m = H it follows the room height).
 */
export function applyRoomValues(m, v) {
  const H0 = m.room.H, follow = (hm) => (Math.abs(hm - H0) < 1e-9 ? v.H : hm);
  const groups = v.H === H0 ? m.groups : m.groups.map((g) => (g.kind === 'single'
    ? { ...g, points: g.points.map((p) => ({ ...p, hm: follow(p.hm) })) }
    : { ...g, hm: follow(g.hm) }));
  return {
    ...m,
    room: { shape: { kind: 'rect', L: v.L, W: v.W }, H: v.H, rho: { ceiling: v.rhoC, walls: v.rhoW, floor: v.rhoF } },
    design: { En: v.En, hwp: v.hwp, U0n: v.U0n ?? null, mf: v.mf },
    groups,
  };
}

/** The model with the values of the form for the type `id` (photometry, flux, colour temperature, power). */
export function applyTypeValues(m, id, v) {
  return { ...m, types: m.types.map((ty) => (ty.id === id ? { ...ty, photometry: v.phot === 'file' && ty.file ? 'file' : 'cosine', flux: v.flux, cct: v.cct, power: v.power } : ty)) };
}

/** The model with another photometric file of the type `id` (null removes it). */
export function withTypeFile(m, id, file) {
  return { ...m, types: m.types.map((ty) => (ty.id === id ? { ...ty, file: cleanFile(file), ...(file ? {} : { photometry: 'cosine' }) } : ty)) };
}

/** The model with the type `id` renamed (an empty name: the default name of the page). */
export function renameType(m, id, name) {
  const n = String(name ?? '').trim().slice(0, 80);
  return { ...m, types: m.types.map((ty) => { if (ty.id !== id) return ty; const { name: _, ...rest } = ty; return n ? { ...rest, name: n } : rest; }) };
}

/**
 * Colours of the luminaire types (decided on 21 Nov 2026: a type is told by its colour alone, no
 * letters). A type keeps the colour chosen for it (ty.color); a type without one takes the colour
 * of its place in the list.
 */
const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
// 25 Nov 2026: ten colours told apart in normal vision and in the three kinds of colour blindness
// (ΔE ≥ 16 in simulation), seen on white (paper) and on the dark theme (contrast ≥ 2.8:1): after
// Okabe–Ito, P. Tol and IBM. A colour belongs to one luminaire of the project; from the eleventh the
// colours repeat and the luminaires of a repeated colour show their number.
export const TYPE_COLORS = Object.freeze(['#0072b2', '#ee7733', '#009e73', '#cc3311', '#785ef0', '#cc79a7', '#9b5b3b', '#aa3377', '#e024c7', '#f64c6e']);
const lab = (hex) => {
  const lin = (c) => { const v = parseInt(c, 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const nearestOf = (c, list) => { const q = lab(c); let best = list[0], bd = Infinity; for (const x of list) { const p = lab(x), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = x; } } return best; };
/**
 * The colours of the luminaires of a project (25 Nov 2026): entries [{ ident, color }] in the order
 * of the project; a colour of the palette kept unless an earlier luminaire has it; another colour
 * (an older palette, a colour of one's own) or a taken one → the nearest free colour of the palette;
 * all taken → the colours repeat in their order. Returns Map ident → colour.
 */
export function assignColors(entries) {
  const out = new Map(), used = new Set();
  let round = 0;
  for (const { ident, color } of entries) {
    if (out.has(ident)) continue;
    const c = typeof color === 'string' ? color.toLowerCase() : '';
    const free = TYPE_COLORS.filter((x) => !used.has(x));
    let pick;
    if (free.length) pick = free.includes(c) ? c : isColor(c) ? nearestOf(c, free) : free[0];
    else pick = TYPE_COLORS[round++ % TYPE_COLORS.length];
    used.add(pick); out.set(ident, pick);
  }
  return out;
}
/** Numbers of the luminaires whose colour another one shares (more than ten): Map ident → number (1…). */
export function typeNumbers(colors) {
  const by = new Map();
  for (const c of colors.values()) by.set(c, (by.get(c) ?? 0) + 1);
  const out = new Map();
  [...colors.keys()].forEach((id, k) => { if (by.get(colors.get(id)) > 1) out.set(id, k + 1); });
  return out;
}
/** Colour of the k-th type of a model. */
export const typeColorOf = (m, k) => m.types[k]?.color ?? TYPE_COLORS[k % TYPE_COLORS.length];
/** The first colour of the palette no type of the model shows (the first one when all are used). */
function freeColor(m) {
  const used = new Set(m.types.map((_, k) => typeColorOf(m, k)));
  return TYPE_COLORS.find((c) => !used.has(c)) ?? TYPE_COLORS[m.types.length % TYPE_COLORS.length];
}
/**
 * The colours of the palette no other type of the model shows (the type `id` itself excluded), in
 * the order of the palette: what the card offers next to the colour of the type.
 */
export function freeColors(m, id) {
  const used = new Set(m.types.map((ty, k) => (ty.id === id ? null : typeColorOf(m, k))));
  return TYPE_COLORS.filter((c) => !used.has(c));
}
/** The model with the colour of the type `id` set (not a colour: the model as it is). */
export function setTypeColor(m, id, color) {
  if (!isColor(color)) return m;
  return { ...m, types: m.types.map((ty) => (ty.id === id ? { ...ty, color: color.toLowerCase() } : ty)) };
}
/**
 * A copy of the type `id` with its own colour: the same luminaire with another lamp set is another
 * type (decided on 21 Nov 2026). The name of the copy is not copied.
 */
export function duplicateType(m, id) {
  const ty = m.types.find((x) => x.id === id);
  if (!ty) return null;
  const nid = newId(m.types, 't');
  const { name: _, ...rest } = ty;
  const copy = { ...structuredClone(rest), id: nid, color: freeColor(m) };
  const k = m.types.indexOf(ty);
  return { model: { ...m, types: [...m.types.slice(0, k + 1), copy, ...m.types.slice(k + 1)] }, id: nid };
}

/** The model after an edit of the version 1 form (one type, one grid): the same ids and file. */
export function applyFormValues(m, v) {
  return modelFromValues(v, m.types[0].file, { type: m.types[0].id, group: m.groups[0].id });
}

/** The photometric file of the model's (only) type, or null. */
export const modelFile = (m) => m.types[0].file;

/** The model with another photometric file of its type (null removes it). */
export function withFile(m, file) {
  return { ...m, types: m.types.map((ty, k) => (k === 0 ? { ...ty, file: cleanFile(file) } : ty)) };
}

/** Outline of the room in plan: vertices counter-clockwise from above. */
export function outlineOf(m) {
  const s = m.room.shape;
  if (s.kind === 'rect') return rectOutline(s.L, s.W);
  throw new RangeError(`outlineOf: shape ${s.kind}`);
}

/** Reflectances of faces 0…5 (floor, ceiling, four walls) of the calculation. */
export const modelRho = (m) => faceRho({ rhoC: m.room.rho.ceiling, rhoW: m.room.rho.walls, rhoF: m.room.rho.floor });

/**
 * Instances of the luminaires: [{ type, group, index, pos: [x, y, z], psi (rad), at: [x, y], hm }];
 * pos is the photometric centre, the housing height below the mounting height (spec v1,
 * "Luminaires"), `at` the mounting point in plan. A grid without its own area gives exactly the
 * luminaires of version 1 (photometry.luminaireGrid).
 * @param {RoomModel} m
 * @param {(type) => number} housing — housing height of a type, m (0 without a file)
 */
export function instances(m, housing = () => 0, sizeOf = () => null) {
  const out = [];
  const H = m.room.H, size = roomSize(m);
  const types = new Map(m.types.map((ty) => [ty.id, ty]));
  for (const g of m.groups) {
    const ty = types.get(g.type);
    if (!ty) throw new RangeError(`instances: group ${g.id} has no type ${g.type}`);
    const hh = housing(ty);
    groupPoints(g, size, sizeOf(ty)).forEach((p, index) => {
      if (p.tx || p.ty) {
        // tilted (stage 2.1a): the photometric centre turns about the mounting point with the housing
        const l = { psi: p.psi * DEG, tx: (p.tx || 0) * DEG, ty: (p.ty || 0) * DEG }, R = lumMatrix(l);
        out.push({ type: ty.id, group: g.id, index, pos: [p.x - R[2] * hh, p.y - R[5] * hh, p.hm - R[8] * hh], ...l, at: [p.x, p.y], hm: p.hm });
        return;
      }
      const z = H - ceilingDrop(H, p.hm, hh);
      out.push({ type: ty.id, group: g.id, index, pos: [p.x, p.y, z], psi: p.psi * DEG, at: [p.x, p.y], hm: p.hm });
    });
  }
  return out;
}

/** Size of the room for the groups: { L, W } of the bounding box of the outline. */
export function roomSize(m) {
  const s = m.room.shape;
  if (s.kind === 'rect') return { L: s.L, W: s.W };
  throw new RangeError(`roomSize: shape ${s.kind}`);
}

/**
 * Placement errors of the luminaires (stage 2.1, decided on 20 Nov 2026): [{ group, index, code }]
 *   'outside' — the plan box of the housing (housingHalf) does not lie inside the outline;
 *   'height'  — the mounting height is outside [HM_MIN, H];
 *   'low'     — the photometric centre is not above the normative work plane.
 * A model with errors is not calculated.
 * @param {RoomModel} m
 * @param {(type) => ({ a, b, h }|null)} sizeOf — housing of a type: a along C0, b along C90, height h
 */
export function placementErrors(m, sizeOf = () => null) {
  const out = [], outline = outlineOf(m), H = m.room.H, size = roomSize(m);
  const types = new Map(m.types.map((ty) => [ty.id, ty]));
  for (const g of m.groups) {
    const ty = types.get(g.type);
    const hs = ty ? sizeOf(ty) : null;
    groupPoints(g, size, hs).forEach((p, index) => {
      const tilted = !!(p.tx || p.ty);
      if (tilted) {
        // the plan box of the turned housing (stage 2.1a); a corner above the ceiling is allowed
        const [x0, x1, y0, y1] = housingExtent(hs, p.psi, p.tx, p.ty);
        if (!boxInOutline(outline, p.x + (x0 + x1) / 2, p.y + (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2)) out.push({ group: g.id, index, code: 'outside' });
      } else {
        const [hx, hy] = housingHalf(hs, p.psi);
        if (!boxInOutline(outline, p.x, p.y, hx, hy)) out.push({ group: g.id, index, code: 'outside' });
      }
      if (!(Math.abs(p.tx || 0) <= 90 + 1e-9 && Math.abs(p.ty || 0) <= 90 + 1e-9)) out.push({ group: g.id, index, code: 'tilt' });
      const pz = tilted ? p.hm - (hs?.h ?? 0) * Math.cos((p.tx || 0) * DEG) * Math.cos((p.ty || 0) * DEG) : photometricHeight(p.hm, hs?.h ?? 0);
      if (!(p.hm >= HM_MIN - 1e-12 && p.hm <= H + 1e-12)) out.push({ group: g.id, index, code: 'height' });
      else if (!(pz > m.design.hwp)) out.push({ group: g.id, index, code: 'low' });
    });
  }
  return out;
}

/**
 * Inputs of the calculation (calc.js, CalcParams) for a model.
 * @param {RoomModel} m
 * @param {(type) => ({ key: string, table: object }|null)} fileOf — the parsed file of a type with a
 *   photometric file chosen (null — the file does not read: the type is calculated as cosine)
 */
export function calcParams(m, fileOf = () => null) {
  const files = new Map(m.types.map((ty) => [ty.id, ty.photometry === 'file' ? fileOf(ty) : null]));
  const housing = (ty) => files.get(ty.id)?.table?.luminaire?.height || 0;
  // the housing in plan: the way 'edge' of grids and lines keeps it inside (21 Nov 2026)
  const plan = (ty) => { const t = files.get(ty.id)?.table; return t ? luminaireShape(t).housing : null; };
  // label: the name of the type in the checks of the calculation (not part of the result)
  const types = m.types.map((ty, k) => {
    const f = files.get(ty.id);
    const label = ty.name || String(f?.table?.catalog || f?.table?.name || '').trim() || `#${k + 1}`;
    return f ? { id: ty.id, label, phot: 'file', flux: ty.flux, fileKey: f.key, table: f.table } : { id: ty.id, label, phot: 'cosine', flux: ty.flux };
  });
  const lums = instances(m, housing, plan).map(({ type, pos, psi, tx, ty }) => (tx || ty ? { type, pos: [...pos], psi, tx, ty } : { type, pos: [...pos], psi }));
  return { outline: outlineOf(m), H: m.room.H, rho: modelRho(m), hwp: m.design.hwp, types, lums };
}

/** Number of luminaires of the model. */
export const lumCount = (m) => m.groups.reduce((n, g) => n + groupCount(g), 0);

/** True when the version 1 form can show the model: one type and one grid over the whole room. */
export const isFormModel = (m) => m.types.length === 1 && m.groups.length === 1 && m.groups[0].kind === 'grid' && !m.groups[0].area && m.groups[0].type === m.types[0].id;

/** A new type after the others: the cosine model with the values of the form defaults. */
export function addType(m) {
  const id = newId(m.types, 't');
  return { model: { ...m, types: [...m.types, { id, photometry: 'cosine', flux: DEFAULTS.flux, cct: DEFAULTS.cct, power: DEFAULTS.power, file: null, color: freeColor(m) }] }, id };
}

/** The model without the type `id`; a type used by a group stays (null). The last one may go (21 Nov 2026). */
export function removeType(m, id) {
  if (!m.types.some((ty) => ty.id === id) || m.groups.some((g) => g.type === id)) return null;
  return { ...m, types: m.types.filter((ty) => ty.id !== id) };
}

/**
 * A group drawn on the plan (stage 2.1): the kind, the type, the drawn geometry and the values of
 * the fields of the next group (`draft`: counts, heights, rotation).
 *   single: { x, y } · grid: { x0, y0, x1, y1 } · line: { x0, y0, x1, y1 } · circle: { cx, cy, r }
 * @returns {{ model, id }}
 */
export function addGroup(m, kind, type, geo = null, draft = {}) {
  const { L, W } = roomSize(m), H = m.room.H, id = newId(m.groups, 'g');
  const r2 = (x) => Math.round(x * 1e6) / 1e6;
  const hm = Math.min(H, draft.hm ?? H), psi = draft.psi ?? 0, tl = tiltOf(draft.tx, draft.ty);
  let g;
  switch (kind) {
    case 'grid': {
      const a = geo ?? { x0: 0, y0: 0, x1: L, y1: W };
      g = { id, type, kind, nx: draft.nx ?? 2, ny: draft.ny ?? 2, hm, psi };
      if (geo) g.area = { x0: r2(Math.min(a.x0, a.x1)), y0: r2(Math.min(a.y0, a.y1)), x1: r2(Math.max(a.x0, a.x1)), y1: r2(Math.max(a.y0, a.y1)) };
      for (const k of ['mx', 'my']) if (draft[k] && draft[k] !== 'in') g[k] = draft[k];
      break;
    }
    case 'line': {
      const a = geo ?? { x0: L * 0.2, y0: W / 2, x1: L * 0.8, y1: W / 2 };
      g = { id, type, kind, x0: r2(a.x0), y0: r2(a.y0), x1: r2(a.x1), y1: r2(a.y1), n: draft.n ?? 3, hm, hm1: Math.min(H, draft.hm1 ?? hm), psi };
      if (draft.m && draft.m !== 'axis') g.m = draft.m;
      break;
    }
    case 'circle': {
      const a = geo ?? { cx: L / 2, cy: W / 2, r: Math.min(L, W) / 4 };
      g = { id, type, kind, cx: r2(a.cx), cy: r2(a.cy), r: r2(a.r), n: draft.n ?? 6, hm, psi };
      break;
    }
    case 'single': {
      const a = geo ?? { x: L / 2, y: W / 2 };
      g = { id, type, kind, points: [{ x: r2(a.x), y: r2(a.y), hm, psi, ...tl }] };
      break;
    }
    default: throw new RangeError(`addGroup: group kind ${kind}`);
  }
  if (kind !== 'single') Object.assign(g, tl);
  return { model: { ...m, groups: [...m.groups, g] }, id };
}

/** The model with a luminaire added to the group of single luminaires `id` (drawing one by one). */
export function addPoint(m, id, x, y, draft = {}) {
  const H = m.room.H, r2 = (v) => Math.round(v * 1e6) / 1e6;
  return { ...m, groups: m.groups.map((g) => (g.id === id && g.kind === 'single'
    ? { ...g, points: [...g.points, { x: r2(x), y: r2(y), hm: Math.min(H, draft.hm ?? H), psi: draft.psi ?? 0, ...tiltOf(draft.tx, draft.ty) }] } : g)) };
}

/** The model with the group `id` replaced. */
export const replaceGroup = (m, id, g) => ({ ...m, groups: m.groups.map((x) => (x.id === id ? { ...g, id } : x)) });

/** The model without the group `id` (a room may have no luminaires, stage 2.1). */
export function removeGroup(m, id) {
  return { ...m, groups: m.groups.filter((g) => g.id !== id) };
}

/** A copy of the group `id` moved by (dx, dy), after it: { model, id }. */
export function duplicateGroup(m, id, dx = 0, dy = 0) {
  const g = m.groups.find((x) => x.id === id);
  if (!g) return null;
  const nid = newId(m.groups, 'g'), k = m.groups.indexOf(g);
  const copy = { ...moveGroup(structuredClone(g), dx, dy, roomSize(m)), id: nid };
  return { model: { ...m, groups: [...m.groups.slice(0, k + 1), copy, ...m.groups.slice(k + 1)] }, id: nid };
}

/** The model with the group `id` turned into single luminaires (groups.ungroup). */
export function ungroupGroup(m, id, size = null) {
  const g = m.groups.find((x) => x.id === id);
  return g ? replaceGroup(m, id, ungroup(g, roomSize(m), size)) : m;
}

/** The grid of the plan editor of the room (steps, origin, snapping). */
export const planGrid = (m) => m.plan ?? { ...PLAN_GRID };

/** A new id with the prefix that no item of the list has: t1, t2… */
export function newId(list, prefix) {
  const used = new Set(list.map((x) => x.id));
  for (let k = 1; ; k++) if (!used.has(`${prefix}${k}`)) return `${prefix}${k}`;
}

/**
 * Validated values of a version 1 room; a field with an error gets its default, the rest is kept.
 * @param {object} v — values as saved
 */
export function cleanValues(v) {
  const raw = { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
  const r = validateParams(raw);
  if (r.ok) return { ...r.values, phot: raw.phot === 'file' ? 'file' : 'cosine' };
  // drop the fields with errors one by one and keep the rest
  const fixed = { ...raw };
  for (const k of Object.keys(r.errors)) fixed[k] = DEFAULTS[k];
  const r2 = validateParams(fixed);
  return r2.ok ? r2.values : { ...DEFAULTS };
}

const isId = (x) => typeof x === 'string' && /^[\w-]{1,40}$/.test(x);

const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : def);
const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
/** A plan coordinate: any finite value within a kilometre (a luminaire outside is a placement error). */
const coord = (v, def) => num(v, -1000, 1000, def);
const angle = (v) => (typeof v === 'number' && Number.isFinite(v) ? wrapDeg(v) : 0);
/** A tilt read from a file (stage 2.1a): −90…90°, otherwise 0. */
const tilt = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-90, Math.min(90, v)) : 0);

/** A luminaire type read from a file; a wrong value gets its default (form of version 1). */
function cleanType(ty, id) {
  const file = cleanFile(ty.file);
  const out = {
    id,
    photometry: ty.photometry === 'file' && file ? 'file' : 'cosine',
    flux: num(ty.flux, Number.MIN_VALUE, 1e6, DEFAULTS.flux),
    cct: num(ty.cct, 1000, 20000, DEFAULTS.cct),
    power: num(ty.power, Number.MIN_VALUE, 1e5, DEFAULTS.power),
    file,
  };
  if (typeof ty.name === 'string' && ty.name.trim()) out.name = ty.name.trim().slice(0, 80);
  if (isColor(ty.color)) out.color = ty.color.toLowerCase();
  if (ty.copy === true) out.copy = true; // a copy: another luminaire with the same file (its own colour)
  return out;
}

/**
 * A group read from a file (null: a kind this version does not know). Groups of the first editor
 * of stage 2.1 are converted (20 Nov 2026): "several lines" become single luminaires, a line by
 * step its count, a circle keeps its luminaires' rotation measured from the radius.
 */
function cleanGroup(g, id, type, room) {
  const { H } = room, L = room.shape.L, W = room.shape.W;
  const hm = (v) => num(v, HM_MIN, H, H);
  const base = { id, type, kind: g.kind };
  const withOffs = (out) => {
    // offsets of luminaires moved within the group (25 Nov 2026): index → { dx, dy, dz, dpsi }
    if (!g.offs || typeof g.offs !== 'object' || out.kind === 'single') return out;
    const n = groupCount(out), offs = {};
    for (const [k, o] of Object.entries(g.offs)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= n || !o || typeof o !== 'object') continue;
      const v = Object.fromEntries(['dx', 'dy', 'dz', 'dpsi', 'dtx', 'dty'].filter((q) => Number.isFinite(o[q]) && o[q] !== 0).map((q) => [q, Math.max(-1000, Math.min(1000, o[q]))]));
      if (Object.keys(v).length) offs[i] = v;
    }
    if (Object.keys(offs).length) out.offs = offs;
    return out;
  };
  const out = cleanGroupKind(g, base, room);
  // tilt of every luminaire of the group (stage 2.1a): written only when not zero
  if (out && out.kind !== 'single') Object.assign(out, tiltOf(tilt(g.tx), tilt(g.ty)));
  return withOffs(out);
}

function cleanGroupKind(g, base, room) {
  const { H } = room, L = room.shape.L, W = room.shape.W;
  const hm = (v) => num(v, HM_MIN, H, H);
  switch (g.kind) {
    case 'grid': {
      const out = { ...base, nx: int(g.nx, 1, 30, DEFAULTS.nx), ny: int(g.ny, 1, 30, DEFAULTS.ny), hm: hm(g.hm), psi: angle(g.psi) };
      // the ways along X and Y (21 Nov 2026); 'in' — version 1 — is not written
      for (const k of ['mx', 'my']) if (SPACINGS.includes(g[k]) && g[k] !== 'in') out[k] = g[k];
      const a = g.area;
      const offsets = (v, n, len) => Array.isArray(v) && v.length === n && v.every((x, i) => Number.isFinite(x) && x >= -1e-9 && x <= len + 1e-9 && (i === 0 || x >= v[i - 1])) ? v.map((x) => +x) : null;
      if (a && [a.x0, a.y0, a.x1, a.y1].every((v) => coord(v, NaN) === v) && a.x1 > a.x0 && a.y1 > a.y0) out.area = { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
      // own axes (25 Nov 2026): offsets from the area start, as many as luminaires, in order
      {
        const ar = out.area ?? { x0: 0, y0: 0, x1: L, y1: W };
        const xs = offsets(g.xs, out.nx, ar.x1 - ar.x0), ys = offsets(g.ys, out.ny, ar.y1 - ar.y0);
        if (xs) out.xs = xs;
        if (ys) out.ys = ys;
      }
      return out;
    }
    case 'line': {
      const out = {
        ...base, x0: coord(g.x0, 0), y0: coord(g.y0, W / 2), x1: coord(g.x1, L), y1: coord(g.y1, W / 2),
        n: int(g.n, 1, MAX_LUMINAIRES, 2), hm: hm(g.hm), hm1: 0, psi: angle(g.psi),
      };
      out.hm1 = g.hm1 === undefined ? out.hm : hm(g.hm1);
      if (SPACINGS.includes(g.m) && g.m !== 'axis') out.m = g.m;
      {
        const len = Math.hypot(out.x1 - out.x0, out.y1 - out.y0), v = g.ts;
        if (Array.isArray(v) && v.length === out.n && v.every((x, k) => Number.isFinite(x) && x >= -1e-9 && x <= len + 1e-9 && (k === 0 || x >= v[k - 1]))) out.ts = v.map((x) => +x);
      }
      if (g.hm1 === undefined && (g.by === 'step' || g.off > 0)) {
        // the first editor: luminaires by step between offsets — the same luminaires as single ones
        return { ...base, kind: 'single', points: legacyPoints(g, room) };
      }
      return out;
    }
    case 'lines':
      return { ...base, kind: 'single', points: legacyPoints(g, room) };
    case 'circle': {
      const out = {
        ...base, cx: coord(g.cx, L / 2), cy: coord(g.cy, W / 2), r: num(g.r, 0.01, 1000, Math.min(L, W) / 4),
        n: int(g.n, 1, MAX_LUMINAIRES, 6), hm: hm(g.hm), psi: angle(g.psi),
      };
      if (g.orient === 'tangent') out.psi = angle(out.psi + 90);
      // the arc (21 Nov 2026): the full circle from 0° is not written
      if (Number.isFinite(g.a0) || Number.isFinite(g.a1)) {
        const [a0, a1] = normArc(Number.isFinite(g.a0) ? g.a0 : 0, Number.isFinite(g.a1) ? g.a1 : 360);
        if (!(a0 === 0 && a1 === 360)) Object.assign(out, { a0, a1 });
      }
      if (g.start || g.orient === 'fixed') return { ...base, kind: 'single', points: legacyPoints(g, room) };
      return out;
    }
    case 'single':
      return {
        ...base,
        points: (Array.isArray(g.points) ? g.points : []).filter((p) => p && typeof p === 'object')
          .map((p) => ({ x: coord(p.x, L / 2), y: coord(p.y, W / 2), hm: hm(p.hm), psi: angle(p.psi), ...tiltOf(tilt(p.tx), tilt(p.ty)) })),
      };
    default:
      return null;
  }
}

/** Luminaires of a group of the first editor of stage 2.1 (lines by step, several lines, circles with a start angle). */
function legacyPoints(g, room) {
  const L = room.shape.L, W = room.shape.W, H = room.H, DEG_ = Math.PI / 180;
  const n = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const h = Math.min(H, Math.max(HM_MIN, n(g.hm, H))), psi = n(g.psi, 0);
  if (g.kind === 'circle') {
    const cnt = Math.max(1, Math.min(MAX_LUMINAIRES, Math.round(n(g.n, 6)))), r = Math.max(0.01, n(g.r, 1));
    return Array.from({ length: cnt }, (_, k) => {
      const a = n(g.start, 0) + (360 * k) / cnt;
      const p = g.orient === 'tangent' ? a + 90 + psi : g.orient === 'radial' ? a + psi : psi;
      return { x: n(g.cx, L / 2) + r * Math.cos(a * DEG_), y: n(g.cy, W / 2) + r * Math.sin(a * DEG_), hm: h, psi: wrapDeg(p) };
    });
  }
  const x0 = n(g.x0, 0), y0 = n(g.y0, W / 2), x1 = n(g.x1, L), y1 = n(g.y1, W / 2);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ux = len ? dx / len : 1, uy = len ? dy / len : 0;
  const dir = len ? Math.atan2(dy, dx) / DEG_ : 0, off = Math.max(0, n(g.off, 0)), free = Math.max(0, len - 2 * off);
  let ts = [];
  if (g.by === 'step') {
    const step = Math.max(0.01, n(g.step, 1)), cnt = Math.floor(free / step + 1e-9) + 1;
    ts = Array.from({ length: cnt }, (_, k) => (len - (cnt - 1) * step) / 2 + k * step);
  } else {
    const cnt = Math.max(1, Math.round(n(g.n, 2)));
    ts = cnt === 1 ? [len / 2] : Array.from({ length: cnt }, (_, k) => off + (free * k) / (cnt - 1));
  }
  const rows = g.kind === 'lines' ? Math.max(1, Math.round(n(g.rows, 1))) : 1, gap = n(g.gap, 0);
  const out = [];
  for (let r = 0; r < rows; r++) for (const t of ts) out.push({ x: x0 + t * ux - uy * r * gap, y: y0 + t * uy + ux * r * gap, hm: h, psi: wrapDeg(dir + psi) });
  return out.slice(0, MAX_LUMINAIRES);
}

/**
 * A model read from a version 2 file, checked by the rules of the form; a wrong value gets its
 * default, as in version 1. A group of an unknown type or kind, or a type or group without a
 * valid unique id, makes the room unreadable (Error with a message key, `code`): 'model',
 * 'model.kind'. More than MAX_LUMINAIRES luminaires: 'model.count'.
 */
export function cleanModel(d) {
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  if (!d || typeof d !== 'object' || !d.room || !Array.isArray(d.types) || !Array.isArray(d.groups) || (!d.types.length && d.groups.length)) fail('model');
  if (!SHAPES.includes(d.room.shape?.kind)) fail('model.kind');
  const g0 = d.groups.find((g) => g?.kind === 'grid') ?? {};
  const raw = {
    L: d.room.shape.L, W: d.room.shape.W, H: d.room.H,
    rhoC: d.room.rho?.ceiling, rhoW: d.room.rho?.walls, rhoF: d.room.rho?.floor,
    En: d.design?.En, hwp: d.design?.hwp, U0n: d.design?.U0n, mf: d.design?.mf,
    // the fields of the grid only so that the room is checked by the same rules (hm ≤ H…)
    nx: g0.nx, ny: g0.ny, hm: g0.hm, psi: g0.psi,
  };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
  const v = cleanValues(raw);
  const room = { shape: { kind: 'rect', L: v.L, W: v.W }, H: v.H, rho: { ceiling: v.rhoC, walls: v.rhoW, floor: v.rhoF } };
  const design = { En: v.En, hwp: v.hwp, U0n: v.U0n ?? null, mf: v.mf };

  const ids = new Set();
  const types = d.types.map((ty) => {
    if (!ty || !isId(ty.id) || ids.has(ty.id)) fail('model');
    ids.add(ty.id);
    return cleanType(ty, ty.id);
  });
  const gids = new Set();
  const groups = d.groups.map((g) => {
    if (!g || !isId(g.id) || gids.has(g.id) || !ids.has(g.type)) fail('model');
    gids.add(g.id);
    const out = cleanGroup(g, g.id, g.type, room);
    if (!out) fail('model.kind');
    return out;
  });
  const m = { room, design, types, groups };
  if (d.plan) m.plan = cleanPlanGrid(d.plan); // the grid of the plan editor (not a calculation input)
  if (lumCount(m) > MAX_LUMINAIRES) fail('model.count');
  return m;
}
