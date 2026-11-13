// Realistic view: luminance of the faces and Ward's exposure.
// Pure module: no DOM and no Three.js. The same formulas run in the fragment shader of view3d.js
// (displayValue there mirrors displayValue here; the tests check this module).
// Spec, section "Realistic view":
//   - luminance, not illuminance, is shown: L = ρ·E/π, cd/m², for Lambertian faces;
//   - Ward's contrast-based scale factor (1994): the display contrast matches the perceived contrast
//     of the real scene for an eye adapted to its mean luminance,
//       m = 1/L_dmax · [(1.219 + (L_dmax/2)^0.4) / (1.219 + L_wa^0.4)]^2.5,
//       L_wa = exp(Σ A_i ln(δ + L_i) / Σ A_i);
//   - L_wa is taken over the whole room once per calculation, never over the visible part, so the
//     exposure does not change when the view is rotated;
//   - display value m·L, then a soft shoulder for highlights and the sRGB transfer function;
//   - manual exposure correction ±2 stops (a hidden extra setting).

/** Maximum display luminance, cd/m². */
export const L_DMAX = 100;
/** δ in the log average, cd/m²: keeps ln finite for black faces. */
export const LOG_DELTA = 1e-4;
/** The shoulder starts at this display value (fraction of white); below it the mapping is linear. */
export const SHOULDER = 0.8;

/**
 * Element luminance L = ρ·E/π.
 * @param {import('./geometry.js').Room} room
 * @param {ArrayLike<number>} E — illuminance per element, lx
 * @param {number[]} rho — reflectance of faces 0…5
 */
export function luminance(room, E, rho) {
  const out = new Float64Array(room.N);
  for (const face of room.faces) {
    const k = rho[face.id] / Math.PI;
    for (let g = face.offset; g < face.offset + face.count; g++) out[g] = k * E[g];
  }
  return out;
}

/** Area-weighted log-average luminance of the whole room L_wa, cd/m². */
export function adaptationLuminance(room, Lum, delta = LOG_DELTA) {
  let s = 0, A = 0;
  for (const face of room.faces) {
    let f = 0;
    for (let g = face.offset; g < face.offset + face.count; g++) f += Math.log(delta + Lum[g]);
    s += f * face.elementArea;
    A += face.area;
  }
  return Math.exp(s / A);
}

/** Ward's scale factor m (display fraction per cd/m²) for adaptation luminance Lwa. */
export function wardScale(Lwa, Ldmax = L_DMAX) {
  return (1 / Ldmax) * ((1.219 + (Ldmax / 2) ** 0.4) / (1.219 + Lwa ** 0.4)) ** 2.5;
}

/** Soft shoulder: identity up to SHOULDER, then approaches 1 smoothly (C¹ at the joint). */
export function shoulder(x, k = SHOULDER) {
  if (x <= k) return x;
  return k + (1 - k) * Math.tanh((x - k) / (1 - k));
}

/** sRGB transfer function (linear 0…1 → encoded 0…1). */
export function srgbEncode(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

/**
 * Grey level 0…1 shown for luminance L (cd/m²) with scale m and a correction of `stops` (±2).
 * The fragment shader in view3d.js computes the same.
 */
export function displayValue(L, m, stops = 0) {
  return srgbEncode(shoulder(m * 2 ** stops * L));
}

/**
 * Exposure for a calculated room: { Lwa, m } — depends on the element luminances only, not on the
 * camera, so it is computed once per result.
 */
export function exposure(room, Lum) {
  const Lwa = adaptationLuminance(room, Lum);
  return { Lwa, m: wardScale(Lwa) };
}
