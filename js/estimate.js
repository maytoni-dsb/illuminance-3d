// Preliminary estimate of the number of luminaires (utilisation factor method) and their grid.
// Pure module: no DOM and no Three.js.
// The method and the code follow the page "Estimate of general lighting" (project file
// index.html, formulas 1–16 of the formulas document, rev. 2): the intensity curve averaged over the C planes
// at 0.5° steps, zonal fluxes by the trapezoid rule, the coefficients k_α of table 1 and
//   N = E · S · Z / (u · K_e · Φ),  Z = 1.15.
// Symbols (page → here): a, b → L, W; H → H; h_u (mounting height) → H − h_c; h_r → work plane
// height; ρ_c, ρ_w, ρ_f (rp, rc, rr) → ceiling, walls, floor; K_e (Ke) → MF.

const RAD = Math.PI / 180;
export const Z = 1.15;
const STEP = 0.5;
const NG = 180 / STEP + 1;

/** Table 1: coefficients p, q, n, v, w, m of k_α for the zones 0…10°, …, 80…90°. */
const KT = [
  [1.000, 0, 0, 0, 0, 0], [1.002, 0.2000, 0.9760, 0, 0, 0], [0.9754, 0.2819, 1.274, 0, 0, 0],
  [0.9824, 0.5546, 1.200, 0, 0, 0], [1.310, 0.8119, 1.861, -0.3810, 1.397, 3.176], [0.8718, 1.227, 1.760, 0, 0, 0],
  [0.7384, 4.298, 1.421, 0.2899, 1.964, 6.140], [0.8607, 7.941, 1.895, 0, 0, 0], [0.1663, 716354, 9.470, 0, 0, 0],
];
const kAlpha = (r, phi) => r[0] * Math.exp(-r[1] * Math.pow(phi, -r[2])) + r[3] * Math.exp(-r[4] * Math.pow(phi, -r[5]));

/** Flux in the zone γ = g0…g1 (degrees) of a curve sampled every 0.5°. */
export function zoneFlux(c, g0, g1) {
  let s = 0;
  for (let i = Math.round(g0 / STEP); i < Math.round(g1 / STEP); i++) {
    const a = i * STEP * RAD, b = (i + 1) * STEP * RAD;
    s += (c[i] * Math.sin(a) + c[i + 1] * Math.sin(b)) / 2 * (b - a);
  }
  return 2 * Math.PI * s;
}

/**
 * Intensity curve averaged over the C planes, every 0.5° of γ (the shape only matters).
 * @param {import('./photometry.js').Photometry} phot
 */
export function meanCurve(phot) {
  const c = new Float64Array(NG);
  const nC = phot.rotational || phot.lobes ? 1 : 360;
  for (let i = 0; i < NG; i++) {
    const g = i * STEP * RAD;
    let s = 0;
    for (let k = 0; k < nC; k++) s += phot.intensity((k + 0.5) * 2 * Math.PI / nC, g);
    c[i] = s / nC;
  }
  return c;
}

/**
 * Utilisation factor u and the number of luminaires (formulas 1–16).
 * @param {Float64Array} curve — meanCurve
 * @param {{ L, W, H, hu, hr, rp, rc, rr, E, Ke }} R — room (m), mounting and work plane heights,
 *   reflectances of ceiling, walls and work surface, required illuminance (lx), maintenance factor
 * @param {number} F — luminaire flux, lm
 */
export function estimate(curve, R, F) {
  const h = R.hu - R.hr, h0 = R.H - R.hu, S = R.L * R.W;
  if (!(h > 0)) throw new RangeError('estimate: the luminaires must be above the work plane');
  const phi = S / (h * (R.L + R.W));                                   // 1
  const xi = 2 * h0 / h / phi;                                         // 2
  const rsr = (R.rp + R.rc * xi) / (1 + xi);                           // 3
  const uf = 1 / (1 + xi);                                             // 4
  const rf = rsr * uf / (1 - rsr * (1 - uf));                          // 5
  const s = Math.sqrt(1 + 4 * phi * phi);
  const ufr = 1 / (Math.PI * phi * phi) * (2 * phi * s * Math.atan(2 * phi / s) - 2 * phi * Math.atan(2 * phi)
    + 0.5 * Math.log((1 + 4 * phi * phi) / Math.sqrt(1 + 8 * phi * phi)));  // 6
  const gc = 1 / (1 - R.rc * (1 - phi * (1 - ufr)));                  // 7
  const q = (1 - ufr) ** 2 * phi / 2;
  const D = 1 - gc * R.rc * q * (2 * rf * R.rr * ufr + rf + R.rr) - rf * R.rr * ufr * ufr; // 8
  const A = rf * (ufr + gc * R.rc * q) / D;                            // 9
  const B = gc * R.rc * (1 - ufr) * phi / 2 * (1 + rf * ufr) / D;      // 10
  const C = (1 - gc * rf * R.rc * q) / D;                              // 11
  const Fr = KT.reduce((t, r, i) => t + zoneFlux(curve, 10 * i, 10 * i + 10) * kAlpha(r, phi), 0); // 12
  const Fp = zoneFlux(curve, 0, 180);
  const Ff = zoneFlux(curve, 90, 180);                                 // 13
  const Fc = Fp - (Fr + Ff);                                           // 14
  const u = (A * Ff + B * Fc + C * Fr) / Fp;                           // 15
  const Ftot = R.E * S * Z / (u * R.Ke);                               // 16 (total flux needed)
  const raw = Ftot / F;
  return { phi, u, Ftot, raw, N: Math.max(1, Math.ceil(raw - 1e-9)) };
}

/**
 * A regular grid n_x × n_y with at least N luminaires. Uneven spacing is penalised:
 *   score = n_x n_y · (1 + 0.25 · (r − 1)),  r = larger / smaller of L / n_x and W / n_y,
 * the lowest score wins (ties: the more even grid). So 7 luminaires in 4.2 × 4 m become 3 × 3 = 9
 * rather than 4 × 2 (spacings 1.05 and 2 m), and 1 stays 1.
 * @returns {{ nx:number, ny:number, n:number }}
 */
export function gridFor(N, L, W, max = 30, maxTotal = Infinity) {
  let best = null;
  for (let nx = 1; nx <= max; nx++) {
    const ny = Math.ceil(N / nx);
    if (ny > max || ny < 1 || nx * ny > maxTotal) continue;
    const sx = L / nx, sy = W / ny, r = Math.max(sx, sy) / Math.min(sx, sy);
    const c = { nx, ny, n: nx * ny, r, score: nx * ny * (1 + 0.25 * (r - 1)) };
    if (!best || c.score < best.score - 1e-12 || (Math.abs(c.score - best.score) <= 1e-12 && c.r < best.r)) best = c;
  }
  return best ? { nx: best.nx, ny: best.ny, n: best.n } : { nx: max, ny: max, n: max * max };
}
