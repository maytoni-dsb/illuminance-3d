// The photometric body of a luminaire (stage 2.1b, decided 26 Nov 2026): a wire mesh in the colour of
// the luminaire, no surface. The distance from the photometric centre in a direction is
// proportional to the intensity I(C, γ); meridians — the C planes every 15°, rings — γ every 15°.
// The body turns with the luminaire (ψ and the tilt X, Y: direct.lumMatrix) and includes the light
// going up. In 3D the page draws the mesh, on the plan its projection (the same polylines).
// Pure module: room coordinates only, the page projects them.

import { lumMatrix } from './direct.js';

const D = Math.PI / 180;
export const C_STEP = 15, G_STEP = 15;   // the mesh (decided 26 Nov 2026)
const G_FINE = 3, C_FINE = 5;            // the points along a meridian and along a ring, degrees

/** Largest intensity of a photometry, cd (lobes: their axes; tables: the tabulated maximum). */
export function maxIntensity(phot) {
  if (phot.Imax > 0) return phot.Imax;
  let m = 0;
  for (let g = 0; g <= 180; g += 1) for (let c = 0; c < 360; c += C_FINE) m = Math.max(m, phot.intensity(c * D, g * D));
  return m;
}

/**
 * Polylines of the body of one luminaire, in room coordinates: [[x, y, z], …][]. `scale` — metres
 * per candela. A meridian or ring where the intensity is zero throughout is left out; a meridian
 * stops where the distribution ends (zero up to γ = 180°).
 * @param {{ intensity(C, γ): number }} phot
 * @param {{ pos: number[], psi: number, tx?: number, ty?: number }} lum — angles in radians
 * @param {number} scale
 */
export function bodyLines(phot, lum, scale) {
  const R = lumMatrix(lum), p = lum.pos, out = [];
  let eps = 0; // a length below 1e-6 of the largest counts as no light (cos 90° is not quite 0)
  const at = (c, g) => {
    const r = phot.intensity(c * D, g * D) * scale;
    const s = Math.sin(g * D), u = r * s * Math.cos(c * D), v = r * s * Math.sin(c * D), w = -r * Math.cos(g * D);
    return [p[0] + R[0] * u + R[1] * v + R[2] * w, p[1] + R[3] * u + R[4] * v + R[5] * w, p[2] + R[6] * u + R[7] * v + R[8] * w, r];
  };
  const lit = (q) => q[3] > eps;
  const keep = (line) => {
    // trim the zero ends (the part of the distribution that is not there) and drop an empty line
    let a = 0, b = line.length - 1;
    while (a <= b && !lit(line[a])) a++;
    while (b >= a && !lit(line[b])) b--;
    if (a > b) return;
    const s = line.slice(Math.max(0, a - 1), Math.min(line.length, b + 2)).map((q) => [q[0], q[1], q[2]]);
    if (s.length >= 2) out.push(s);
  };
  const mer = [];
  for (let c = 0; c < 360; c += C_STEP) {
    const m = [];
    for (let g = 0; g <= 180; g += G_FINE) { const q = at(c, g); m.push(q); eps = Math.max(eps, q[3]); }
    mer.push(m);
  }
  eps *= 1e-6;
  for (const m of mer) keep(m);
  for (let g = G_STEP; g < 180; g += G_STEP) {
    const ring = [];
    for (let c = 0; c <= 360; c += C_FINE) ring.push(at(c, g));
    if (ring.some(lit)) out.push(ring.map((q) => [q[0], q[1], q[2]]));
  }
  return out;
}

/** Defaults of the settings (decided 26 Nov 2026): off, size 1 (⅓ of the room height for the largest body). */
export const LDC_DEFAULTS = Object.freeze({ on: false, size: 1, scale: 'I', who: 'all' });

/** Settings read from storage: unknown or broken values fall back to the defaults. */
export function cleanLdc(v) {
  const d = LDC_DEFAULTS, o = v && typeof v === 'object' ? v : {};
  return {
    on: typeof o.on === 'boolean' ? o.on : d.on,
    size: Number.isFinite(o.size) ? Math.max(0.3, Math.min(2, o.size)) : d.size,
    scale: o.scale === 'eq' ? 'eq' : 'I',
    who: o.who === 'sel' ? 'sel' : 'all',
  };
}

/**
 * Metres per candela of every type: the length of the largest body is size × H / 3. Scale 'I' —
 * one scale for the room, by the strongest type (the bodies compare); 'eq' — each type its own
 * (every body of the same length).
 * @param {Map<string, number>} imax — type id → largest intensity, cd
 */
export function bodyScales(imax, H, size, mode) {
  const len = size * H / 3, out = new Map();
  const top = Math.max(0, ...imax.values());
  for (const [id, m] of imax) out.set(id, m > 0 ? len / (mode === 'eq' ? m : top) : 0);
  return out;
}
