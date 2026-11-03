// Luminaire photometry and layout.
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Spec, section "Светильники" (luminaires):
//   - C-γ system, γ = 0 points down (−Z), γ = π up (+Z);
//   - C is measured from the luminaire's C0 plane, counterclockwise when viewed from above;
//     the C0 plane is turned by ψ from +X (counterclockwise viewed from above);
//   - the luminaire is a point source; it neither shades nor reflects light.
// Models before stage 5 (IES/LDT files):
//   cosine:          I(γ) = Φ/π · cos γ                      for γ < π/2, else 0
//   direct-indirect: I(γ) = Φ(1 − f_up)/π · cos γ            for γ < π/2
//                    I(γ) = Φ·f_up/π · |cos γ|               for γ > π/2
// A cosine lobe of flux Φ_l about a unit axis a is exactly a Lambertian differential emitter:
// the flux it sends to a surface A is Φ_l · F(dA_s → A) with the receiver normal a. Models made of
// such lobes therefore list them in `lobes`, which lets direct.js average illuminance over
// elements exactly. General photometry (stage 5) has no lobes and is integrated numerically.

const INV_PI = 1 / Math.PI;
const TWO_PI = 2 * Math.PI;

/** Photometry models available in the UI before stage 5. Labels are user-facing (Russian). */
export const MODELS = Object.freeze({
  cosine: 'косинусная',
  directIndirect: 'прямо-отражённая',
});

/**
 * Creates a photometric model.
 * @param {{ type: 'cosine' | 'directIndirect', flux: number, fUp?: number }} p
 *   flux — luminous flux of the luminaire Φ, lm; fUp — upward flux fraction (directIndirect only)
 * @returns {Photometry}
 *
 * Photometry = {
 *   type, flux,                     // Φ, lm (total flux leaving the luminaire)
 *   intensity(C, gamma) → cd,       // C, γ in radians
 *   lobes: { flux, axis }[] | null, // cosine lobes (axis is a unit vector in room coordinates)
 * }
 */
export function createPhotometry({ type, flux, fUp = 0 }) {
  if (!(Number.isFinite(flux) && flux > 0)) throw new RangeError(`createPhotometry: flux=${flux} must be > 0`);
  if (type === 'cosine') {
    const I0 = flux * INV_PI;
    return Object.freeze({
      type, flux,
      intensity: (C, gamma) => { const c = Math.cos(gamma); return c > 0 ? I0 * c : 0; },
      lobes: Object.freeze([Object.freeze({ flux, axis: Object.freeze([0, 0, -1]) })]),
    });
  }
  if (type === 'directIndirect') {
    if (!(fUp >= 0 && fUp <= 1)) throw new RangeError(`createPhotometry: fUp=${fUp} must be in 0…1`);
    const down = flux * (1 - fUp), up = flux * fUp;
    const Id = down * INV_PI, Iu = up * INV_PI;
    const lobes = [];
    if (down > 0) lobes.push(Object.freeze({ flux: down, axis: Object.freeze([0, 0, -1]) }));
    if (up > 0) lobes.push(Object.freeze({ flux: up, axis: Object.freeze([0, 0, 1]) }));
    return Object.freeze({
      type, flux, fUp,
      intensity: (C, gamma) => { const c = Math.cos(gamma); return c > 0 ? Id * c : -Iu * c; },
      lobes: Object.freeze(lobes),
    });
  }
  throw new RangeError(`createPhotometry: unknown type "${type}"`);
}

/**
 * Photometric angles of the direction from a luminaire to a point.
 * @param {ArrayLike<number>} d — direction (need not be unit), room coordinates
 * @param {number} psi — rotation of the C0 plane from +X, rad (counterclockwise viewed from above)
 * @returns {{ C: number, gamma: number }} C in [0, 2π), γ in [0, π]
 */
export function photometricAngles(d, psi = 0) {
  const gamma = Math.atan2(Math.hypot(d[0], d[1]), -d[2]);
  const cp = Math.cos(psi), sp = Math.sin(psi);
  // rotate the horizontal direction by −ψ into the luminaire frame
  const lx = cp * d[0] + sp * d[1], ly = -sp * d[0] + cp * d[1];
  let C = (lx === 0 && ly === 0) ? 0 : Math.atan2(ly, lx);
  if (C < 0) C += TWO_PI;
  if (C >= TWO_PI) C -= TWO_PI;
  return { C, gamma };
}

/**
 * Regular nx × ny grid of luminaires; the margin to the walls is half the grid pitch:
 *   x_i = (i + 0.5)·L/nx,  y_j = (j + 0.5)·W/ny,  z_s = H − h_c.
 * @param {{ L:number, W:number, H:number, nx:number, ny:number, hc?:number, psi?:number }} p
 *   hc — suspension (ceiling to photometric centre), m; psi — rotation, rad
 * @returns {{ pos: number[], psi: number }[]} order: i fastest, then j
 */
export function luminaireGrid({ L, W, H, nx, ny, hc = 0, psi = 0 }) {
  if (!(Number.isInteger(nx) && nx >= 1 && Number.isInteger(ny) && ny >= 1)) {
    throw new RangeError(`luminaireGrid: nx=${nx}, ny=${ny} must be integers ≥ 1`);
  }
  if (!(hc >= 0 && hc < H)) throw new RangeError(`luminaireGrid: hc=${hc} must be in [0, H)`);
  const z = H - hc;
  const out = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      out.push(Object.freeze({ pos: Object.freeze([(i + 0.5) * L / nx, (j + 0.5) * W / ny, z]), psi }));
    }
  }
  return out;
}
