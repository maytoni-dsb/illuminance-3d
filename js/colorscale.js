// False-color scale. Pure module: no DOM and no Three.js.
// Spec, section "Фиктивные цвета" (false colors):
//   - a fixed scale of 26 levels, the same for all faces, planes and projects;
//   - stepped colors: a value between levels k and k+1 gets color k, so the border between two
//     colors coincides with an isoline; values below 1 lx and above 2000 lx get the end colors.
// The final color of each level will be set later; until then a temporary palette is used
// (the "Turbo" ramp, sampled evenly over the level index).

/** Scale levels, lx. */
export const LEVELS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000,
]);

/** Index of the color for value E: the largest k with LEVELS[k] ≤ E, clamped to 0…25. */
export function levelIndex(E) {
  if (!(E >= LEVELS[1])) return 0; // also NaN → 0
  let lo = 1, hi = LEVELS.length - 1;
  if (E >= LEVELS[hi]) return hi;
  while (hi - lo > 1) { // invariant: LEVELS[lo] ≤ E < LEVELS[hi]
    const mid = (lo + hi) >> 1;
    if (LEVELS[mid] <= E) lo = mid; else hi = mid;
  }
  return lo;
}

/** Turbo colormap, polynomial approximation (Mikhailov, Google, 2019); t in 0…1 → sRGB 0…1. */
function turbo(t) {
  const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
  const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
  const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
  const c = (x) => Math.min(1, Math.max(0, x));
  return [c(r), c(g), c(b)];
}

/** Temporary palette: sRGB triplets 0…1, one per level. Trimmed ends avoid near-black and dark red. */
export const COLORS = Object.freeze(LEVELS.map((_, k) => Object.freeze(turbo(0.06 + 0.88 * k / (LEVELS.length - 1)))));

const hex2 = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
/** Palette as CSS hex strings. */
export const COLORS_HEX = Object.freeze(COLORS.map((c) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`));

/** sRGB color (0…1) for value E. */
export const colorOf = (E) => COLORS[levelIndex(E)];
