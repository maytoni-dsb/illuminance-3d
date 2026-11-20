// Data model of version 2 (spec v2, "Data model"). Pure module: no DOM, tested in Node.
//
// A room is an outline in plan with a height and reflectances; luminaires come in three levels:
// type → group → instance. Types and groups are stored, instances are generated from the groups
// and go to the calculation together with the outline (calc.js, CalcParams).
//
// Stage 2.0: a rectangle and exactly one group "grid" of one type, so the version 1 form still
// edits the whole model: formValues() shows a model as form values, modelFromValues() makes one
// from them. Stages 2.1 and 2.3 add the other groups and shapes.
//
//   RoomModel = {
//     room:   { shape: { kind: 'rect', L, W }, H, rho: { ceiling, walls, floor } },
//     design: { En, hwp, U0n, mf },                       — the norm and the maintenance factor
//     types:  [{ id, photometry: 'cosine' | 'file', flux, cct, power,
//                file: { name, text, set } | null }],     — the file content is kept, as in v1
//     groups: [{ id, type, kind: 'grid', nx, ny, hm, psi }],   — psi in degrees, as in the form
//   }

import { DEFAULTS, validateParams, faceRho, ceilingDrop } from './ui.js';
import { luminaireGrid } from './photometry.js';
import { rectOutline } from './geometry.js';

/** Shapes of the room the model takes (stage 2.3 adds L, U and T). */
export const SHAPES = Object.freeze(['rect']);
/** Kinds of luminaire groups the model takes (stage 2.1 adds line, lines, circle and single). */
export const GROUP_KINDS = Object.freeze(['grid']);

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
export const modelRho = (m) => faceRho(formValues(m));

/**
 * Instances of the luminaires: [{ type, group, pos: [x, y, z], psi (rad) }]; pos is the
 * photometric centre, the housing height below the mounting height (spec v1, "Luminaires").
 * A grid gives exactly the luminaires of version 1 (photometry.luminaireGrid).
 * @param {RoomModel} m
 * @param {(type) => number} housing — housing height of a type, m (0 without a file)
 */
export function instances(m, housing = () => 0) {
  const out = [];
  const H = m.room.H, { L, W } = m.room.shape;
  for (const g of m.groups) {
    const ty = m.types.find((x) => x.id === g.type);
    if (!ty) throw new RangeError(`instances: group ${g.id} has no type ${g.type}`);
    if (g.kind !== 'grid') throw new RangeError(`instances: group kind ${g.kind}`);
    const hc = ceilingDrop(H, g.hm, housing(ty));
    for (const l of luminaireGrid({ L, W, H, nx: g.nx, ny: g.ny, hc, psi: g.psi * DEG })) {
      out.push({ type: ty.id, group: g.id, pos: l.pos, psi: l.psi });
    }
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
export const lumCount = (m) => m.groups.reduce((n, g) => n + g.nx * g.ny, 0);

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

/**
 * A model read from a version 2 file, checked by the rules of the form; a wrong value gets its
 * default, as in version 1. Until stage 2.1 the model holds one type and one group "grid": a
 * file with more is refused (Error with a message key, `code`).
 */
export function cleanModel(d) {
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  if (!d || typeof d !== 'object' || !d.room || !Array.isArray(d.types) || !Array.isArray(d.groups)) fail('model');
  if (d.types.length !== 1 || d.groups.length !== 1) fail('model.many');
  const ty = d.types[0] ?? {}, g = d.groups[0] ?? {};
  if (!SHAPES.includes(d.room.shape?.kind) || !GROUP_KINDS.includes(g.kind)) fail('model.kind');
  const raw = {
    L: d.room.shape.L, W: d.room.shape.W, H: d.room.H,
    rhoC: d.room.rho?.ceiling, rhoW: d.room.rho?.walls, rhoF: d.room.rho?.floor,
    En: d.design?.En, hwp: d.design?.hwp, U0n: d.design?.U0n, mf: d.design?.mf,
    nx: g.nx, ny: g.ny, hm: g.hm, psi: g.psi,
    phot: ty.photometry, flux: ty.flux, cct: ty.cct, power: ty.power,
  };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
  const file = cleanFile(ty.file);
  const values = cleanValues(raw);
  if (!file) values.phot = 'cosine';
  const typeId = isId(ty.id) ? ty.id : 't1';
  return modelFromValues(values, file, { type: typeId, group: isId(g.id) ? g.id : 'g1' });
}
