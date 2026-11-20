// Flux checks of a room with several luminaire types or with luminaires at different heights or
// rotations (stage 2.1 criterion "the flux on the faces equals the sum of the fluxes of all
// luminaires of different types"). Shown in the panel of the stage 3 criteria instead of the
// checks of a single grid. Pure module, no DOM; names and details come from the dictionaries
// (chk.mix.*).

import { t, sci } from './i18n.js';
import { faceFlux } from './direct.js';

const exp = (x) => sci(x, 1);

/** Tolerance of the flux balance: exact for cosine lobes, adaptive cubature for a file. */
export const MIX_TOL = Object.freeze({ exact: 1e-9, file: 1e-3 });

/**
 * @param {import('./geometry.js').Room} room
 * @param {{ id, count, flux, emitted, onFaces, file }[]} types — flux of every type (calc.js)
 * @param {Float64Array} Edir — direct component of all types, E₀ per element
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function mixChecks(room, types, Edir) {
  const out = [];
  let emitted = 0, anyFile = false;
  for (const ty of types) {
    const err = Math.abs(ty.onFaces / ty.emitted - 1);
    out.push({
      name: t('chk.mix.type', { id: ty.label ?? ty.id }),
      ok: err <= (ty.file ? MIX_TOL.file : MIX_TOL.exact),
      detail: t(ty.file ? 'chk.mix.typeFile' : 'chk.mix.typeExact', { n: ty.count, x: exp(err) }),
    });
    emitted += ty.emitted;
    anyFile ||= ty.file;
  }
  const err = Math.abs(faceFlux(room, Edir).total / emitted - 1);
  out.push({
    name: t('chk.mix.total'),
    ok: err <= (anyFile ? MIX_TOL.file : MIX_TOL.exact),
    detail: t('chk.mix.totalDetail', { k: types.length, n: types.reduce((a, ty) => a + ty.count, 0), x: exp(err), N: room.N }),
  });
  return out;
}
