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
export function createPhotometry({ type, flux, fUp = 0, table = null }) {
  if (type === 'file') return createTablePhotometry(table, flux);
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

// ---------------------------------------------------------------------------------------------
// Tabulated photometry (IES / LDT files, stage 5)
//
// The intensity between the tabulated angles is BILINEAR in (C, γ): linear in γ along every
// plane and linear in C between neighbouring planes; outside the tabulated γ range it is zero.
// The same interpolant is used everywhere — at points, in the element averages and in the flux,
// so the energy balance of the room compares like with like. Its flux has a closed form: on a
// cell [C_a, C_b] × [γ_k, γ_k+1] the integrand is linear in C, so
//   Φ = Σ_planes w_p · G_p,   G_p = ∫ I_p(γ) sin γ dγ   (exact for piecewise-linear I_p),
// with w_p the trapezoid weights of the planes over the full circle, and on [γ_k, γ_k+1]
//   ∫ (I_k + (I_k+1 − I_k)(γ − γ_k)/Δ) sin γ dγ
//     = I_k (cos γ_k − cos γ_k+1) + (I_k+1 − I_k)/Δ · (sin γ_k+1 − sin γ_k − Δ cos γ_k+1).

const HALF_PI = Math.PI / 2;
const TOL = 1e-9;

/**
 * Mirror map of a symmetry: full-circle angle C ∈ [0, 2π] → angle inside the stored range.
 * @param {'rot'|'quad'|'half0'|'half90'|'none'} sym
 */
export function mirrorC(sym, C) {
  switch (sym) {
    case 'rot': return 0;
    case 'quad': return C <= HALF_PI ? C : C <= Math.PI ? Math.PI - C : C <= 3 * HALF_PI ? C - Math.PI : TWO_PI - C;
    case 'half0': return C <= Math.PI ? C : TWO_PI - C;
    case 'half90': return C >= HALF_PI && C <= 3 * HALF_PI ? C : C < HALF_PI ? Math.PI - C : 3 * Math.PI - C;
    default: return C;
  }
}

/**
 * Expands the stored planes of a table to planes over the full circle.
 * @param {import('./photfile.js').PhotTable} t
 * @returns {{ planes: Float64Array, rows: Float64Array }} planes in [0, 2π] ascending with the first
 *   at 0 and the last at 2π (the same light) — or a single plane for rotational symmetry;
 *   rows: intensity, cd, plane-major (nP × nG)
 */
export function expandPlanes(t) {
  const nG = t.gamma.length;
  const row = (i) => t.cd.subarray(i * nG, (i + 1) * nG);
  if (t.sym === 'rot') return { planes: Float64Array.of(0), rows: Float64Array.from(row(0)) };
  const stored = Array.from(t.C);
  const find = (c) => {
    for (let i = 0; i < stored.length; i++) if (Math.abs(stored[i] - c) < TOL) return i;
    return -1;
  };
  let list = []; // [angle, stored index]
  if (t.sym === 'none') {
    stored.forEach((c, i) => list.push([c, i]));
    // close the circle periodically: a plane at C + 2π (or C − 2π) carries the same light
    const n = stored.length;
    if (stored[0] > TOL) list.push([stored[n - 1] - TWO_PI, n - 1]);
    if (stored[n - 1] < TWO_PI - TOL) list.push([stored[0] + TWO_PI, 0]);
  } else {
    // every stored plane and its mirror images; each image maps back to its source by mirrorC
    for (let i = 0; i < stored.length; i++) {
      const c = stored[i];
      const images = t.sym === 'quad' ? [c, Math.PI - c, Math.PI + c, TWO_PI - c]
        : t.sym === 'half0' ? [c, TWO_PI - c]
          : [c, Math.PI - c, 3 * Math.PI - c];
      for (const x of images) if (x > -TOL && x < TWO_PI + TOL) list.push([Math.min(Math.max(x, 0), TWO_PI), i]);
    }
    if (!list.some(([x]) => x < TOL)) fail('expandPlanes: no plane at C = 0 after mirroring');
    if (!list.some(([x]) => x > TWO_PI - TOL)) list.push([TWO_PI, list.find(([x]) => x < TOL)[1]]);
    for (const [x, i] of list) {
      if (find(mirrorC(t.sym, x)) !== i && Math.abs(x - TWO_PI) > TOL) fail(`expandPlanes: mirror of C=${x} is not plane ${i}`);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  list = list.filter((e, k) => k === 0 || e[0] - list[k - 1][0] > TOL);
  const planes = Float64Array.from(list, (e) => e[0]);
  const rows = new Float64Array(list.length * nG);
  list.forEach(([, i], p) => rows.set(row(i), p * nG));
  return { planes, rows };
}
function fail(msg) { throw new Error(msg); }

/** ∫ I(γ) sin γ dγ of a piecewise-linear row (zero outside the tabulated range). */
export function planeFlux(gamma, row, from = 0, to = gamma.length - 1) {
  let s = 0;
  for (let k = from; k < to; k++) {
    const g0 = gamma[k], g1 = gamma[k + 1], d = g1 - g0;
    const c0 = Math.cos(g0), c1 = Math.cos(g1);
    s += row[k] * (c0 - c1) + (row[k + 1] - row[k]) / d * (Math.sin(g1) - Math.sin(g0) - d * c1);
  }
  return s;
}

/**
 * Exact flux of the bilinear interpolant, lm, in total and in the lower and upper hemispheres
 * (γ < π/2 and γ > π/2).
 */
export function tableFlux(planes, rows, gamma) {
  const nG = gamma.length, nP = planes.length;
  // split index: the row is integrated up to π/2 and from π/2 separately (π/2 is inserted if needed)
  const parts = (row) => {
    let lo = 0, hi = 0;
    for (let k = 0; k < nG - 1; k++) {
      const g0 = gamma[k], g1 = gamma[k + 1];
      if (g1 <= HALF_PI + TOL) lo += planeFlux(gamma, row, k, k + 1);
      else if (g0 >= HALF_PI - TOL) hi += planeFlux(gamma, row, k, k + 1);
      else { // the cell straddles π/2: split it there (the interpolant is linear in γ)
        const t = (HALF_PI - g0) / (g1 - g0), mid = row[k] + t * (row[k + 1] - row[k]);
        lo += planeFlux([g0, HALF_PI], [row[k], mid]);
        hi += planeFlux([HALF_PI, g1], [mid, row[k + 1]]);
      }
    }
    return [lo, hi];
  };
  if (nP === 1) {
    const [lo, hi] = parts(rows);
    return { total: TWO_PI * (lo + hi), down: TWO_PI * lo, up: TWO_PI * hi };
  }
  let down = 0, up = 0;
  for (let p = 0; p < nP; p++) {
    const w = ((p > 0 ? planes[p] - planes[p - 1] : 0) + (p < nP - 1 ? planes[p + 1] - planes[p] : 0)) / 2;
    const [lo, hi] = parts(rows.subarray(p * nG, (p + 1) * nG));
    down += w * lo; up += w * hi;
  }
  return { total: down + up, down, up };
}

/** Interval index i with a[i] ≤ x < a[i+1] (clamped to 0 … n − 2); O(1) for uniform steps. */
function locator(a) {
  const n = a.length, a0 = a[0], step = (a[n - 1] - a0) / (n - 1);
  let uniform = n > 1;
  for (let i = 1; i < n && uniform; i++) if (Math.abs(a[i] - (a0 + i * step)) > 1e-9 * Math.max(1, Math.abs(a[i]))) uniform = false;
  if (uniform) {
    const inv = 1 / step;
    return (x) => { let i = Math.floor((x - a0) * inv); if (i < 0) i = 0; else if (i > n - 2) i = n - 2; return i; };
  }
  return (x) => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m; else hi = m; }
    return lo;
  };
}

/**
 * Photometry from a parsed file table (photfile.js). Intensities are absolute (cd).
 * @param {import('./photfile.js').PhotTable} table
 * @param {number} [flux] — luminaire flux wanted, lm: the table is scaled so that the flux of its
 *   interpolant equals it (another lamp set of an LDT file, or a flux typed by the user);
 *   without it the table is used as it is
 */
function createTablePhotometry(table, flux) {
  if (!table || !table.cd || !table.gamma) throw new RangeError('createPhotometry: type "file" needs a table');
  const ex = expandPlanes(table);
  const fl0 = tableFlux(ex.planes, ex.rows, table.gamma);
  const scale = Number.isFinite(flux) && flux > 0 ? flux / fl0.total : 1;
  const planes = ex.planes, rows = scale === 1 ? ex.rows : ex.rows.map((v) => v * scale);
  const gamma = Float64Array.from(table.gamma);
  const nG = gamma.length, nP = planes.length;
  const g0 = gamma[0], g1 = gamma[nG - 1];
  const gi = locator(gamma);
  const ci = nP > 1 ? locator(planes) : null;
  const fl = { total: fl0.total * scale, down: fl0.down * scale, up: fl0.up * scale };
  const along = (r, gamma_) => {
    if (gamma_ < g0 || gamma_ > g1) return 0;
    const k = gi(gamma_);
    const t = (gamma_ - gamma[k]) / (gamma[k + 1] - gamma[k]);
    return r[k] + t * (r[k + 1] - r[k]);
  };
  let intensity;
  if (nP === 1) {
    intensity = (C, gm) => {
      if (gm < g0 || gm > g1) return 0;
      const k = gi(gm);
      const t = (gm - gamma[k]) / (gamma[k + 1] - gamma[k]);
      return rows[k] + t * (rows[k + 1] - rows[k]);
    };
  } else {
    intensity = (C, gm) => {
      if (gm < g0 || gm > g1) return 0;
      const k = gi(gm);
      const t = (gm - gamma[k]) / (gamma[k + 1] - gamma[k]);
      const p = ci(C);
      const s = (C - planes[p]) / (planes[p + 1] - planes[p]);
      const a = p * nG + k, b = a + nG;
      const ia = rows[a] + t * (rows[a + 1] - rows[a]);
      const ib = rows[b] + t * (rows[b + 1] - rows[b]);
      return ia + s * (ib - ia);
    };
  }
  return Object.freeze({
    type: 'file',
    flux: fl.total,        // what the model emits: the exact flux of the interpolant
    fluxDown: fl.down, fluxUp: fl.up,
    tableFlux: fl0.total,  // flux of the unscaled table (stage 5 criterion against the rated flux)
    scale,                 // intensities = table · scale
    ratedFlux: table.ratedFlux,
    rotational: nP === 1,
    intensity,
    /** Intensity along a plane of the full circle (for diagrams), cd. */
    planeIntensity: (C, gm) => intensity(C, gm),
    lobes: null,
    table: Object.freeze({ planes, rows, gamma, sym: table.sym }),
    info: Object.freeze({
      format: table.format, fileName: table.fileName, name: table.name, catalog: table.catalog,
      manufacturer: table.manufacturer, lamp: table.lamp, power: table.power, cct: table.cct, cri: table.cri,
      luminaire: table.luminaire, luminous: table.luminous, warnings: table.warnings, sym: table.sym,
      nStored: table.C.length, nGamma: nG,
    }),
    along,
  });
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
