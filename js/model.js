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
import { GROUP_KINDS, CIRCLE_ORIENT, groupPoints, groupCount, housingHalf, boxInOutline, wrapDeg } from './groups.js';

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

/** The values of the version 1 form that show a model (one rectangle, one grid of one type). */
export function formValues(m) {
  const { room, design } = m, ty = m.types[0], g = m.groups[0];
  return {
    L: room.shape.L, W: room.shape.W, H: room.H,
    rhoC: room.rho.ceiling, rhoW: room.rho.walls, rhoF: room.rho.floor,
    En: design.En, hwp: design.hwp, U0n: design.U0n, mf: design.mf,
    nx: g.nx, ny: g.ny, hm: g.hm, psi: g.psi,
    phot: ty.photometry, flux: ty.flux, cct: ty.cct, power: ty.power,
  };
}

/** The model after an edit of the form: the same ids and file, the new values. */
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
export function instances(m, housing = () => 0) {
  const out = [];
  const H = m.room.H, size = roomSize(m);
  const types = new Map(m.types.map((ty) => [ty.id, ty]));
  for (const g of m.groups) {
    const ty = types.get(g.type);
    if (!ty) throw new RangeError(`instances: group ${g.id} has no type ${g.type}`);
    const hh = housing(ty);
    groupPoints(g, size).forEach((p, index) => {
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
    groupPoints(g, size).forEach((p, index) => {
      const [hx, hy] = housingHalf(hs, p.psi);
      if (!boxInOutline(outline, p.x, p.y, hx, hy)) out.push({ group: g.id, index, code: 'outside' });
      if (!(p.hm >= HM_MIN - 1e-12 && p.hm <= H + 1e-12)) out.push({ group: g.id, index, code: 'height' });
      else if (!(photometricHeight(p.hm, hs?.h ?? 0) > m.design.hwp)) out.push({ group: g.id, index, code: 'low' });
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
  const types = m.types.map((ty) => {
    const f = files.get(ty.id);
    return f ? { id: ty.id, phot: 'file', flux: ty.flux, fileKey: f.key, table: f.table } : { id: ty.id, phot: 'cosine', flux: ty.flux };
  });
  const lums = instances(m, housing).map(({ type, pos, psi }) => ({ type, pos: [...pos], psi }));
  return { outline: outlineOf(m), H: m.room.H, rho: modelRho(m), hwp: m.design.hwp, types, lums };
}

/** Number of luminaires of the model. */
export const lumCount = (m) => m.groups.reduce((n, g) => n + groupCount(g), 0);

/** True when the version 1 form can show the model: one type and one grid over the whole room. */
export const isFormModel = (m) => m.types.length === 1 && m.groups.length === 1 && m.groups[0].kind === 'grid' && !m.groups[0].area && m.groups[0].type === m.types[0].id;

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
  return out;
}

/** A group read from a file (null: a kind this version does not know). */
function cleanGroup(g, id, type, room) {
  const { H } = room, L = room.shape.L, W = room.shape.W;
  const hm = (v) => num(v, HM_MIN, H, H);
  const base = { id, type, kind: g.kind };
  switch (g.kind) {
    case 'grid': {
      const out = { ...base, nx: int(g.nx, 1, 30, DEFAULTS.nx), ny: int(g.ny, 1, 30, DEFAULTS.ny), hm: hm(g.hm), psi: num(g.psi, 0, 180, 0) };
      const a = g.area;
      if (a && [a.x0, a.y0, a.x1, a.y1].every((v) => coord(v, NaN) === v) && a.x1 > a.x0 && a.y1 > a.y0) out.area = { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
      return out;
    }
    case 'line': case 'lines': {
      const out = {
        ...base, x0: coord(g.x0, 0), y0: coord(g.y0, W / 2), x1: coord(g.x1, L), y1: coord(g.y1, W / 2),
        by: g.by === 'step' ? 'step' : 'count', n: int(g.n, 1, MAX_LUMINAIRES, 2), step: num(g.step, 0.01, 1000, 1),
        off: num(g.off, 0, 1000, 0), hm: hm(g.hm), psi: angle(g.psi),
      };
      if (g.kind === 'lines') { out.rows = int(g.rows, 1, MAX_LUMINAIRES, 2); out.gap = num(g.gap, -1000, 1000, 1); }
      return out;
    }
    case 'circle':
      return {
        ...base, cx: coord(g.cx, L / 2), cy: coord(g.cy, W / 2), r: num(g.r, 0.01, 1000, Math.min(L, W) / 4),
        n: int(g.n, 1, MAX_LUMINAIRES, 6), start: angle(g.start), orient: CIRCLE_ORIENT.includes(g.orient) ? g.orient : 'tangent',
        hm: hm(g.hm), psi: angle(g.psi),
      };
    case 'single':
      return {
        ...base,
        points: (Array.isArray(g.points) ? g.points : []).filter((p) => p && typeof p === 'object')
          .map((p) => ({ x: coord(p.x, L / 2), y: coord(p.y, W / 2), hm: hm(p.hm), psi: angle(p.psi) })),
      };
    default:
      return null;
  }
}

/**
 * A model read from a version 2 file, checked by the rules of the form; a wrong value gets its
 * default, as in version 1. A group of an unknown type or kind, or a type or group without a
 * valid unique id, makes the room unreadable (Error with a message key, `code`): 'model',
 * 'model.kind'. More than MAX_LUMINAIRES luminaires: 'model.count'.
 */
export function cleanModel(d) {
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  if (!d || typeof d !== 'object' || !d.room || !Array.isArray(d.types) || !Array.isArray(d.groups) || !d.types.length || !d.groups.length) fail('model');
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
  if (lumCount(m) > MAX_LUMINAIRES) fail('model.count');
  return m;
}
