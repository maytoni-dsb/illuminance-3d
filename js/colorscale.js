// False-color scale. Pure module: no DOM and no Three.js.
// Spec, section "False colours":
//   - a fixed scale of 27 levels (0…2000 lx), the same for all faces, planes and projects;
//   - stepped colors: a value between levels k and k+1 gets color k, so the border between two
//     colors coincides with an isoline; values below 0 get the first color, 2000 lx and above
//     get the last one (white).
// Colors 0…1000 lx are the project palette (file from the user, 4 Nov 2026); 1250, 1500 and
// 2000 lx continue the pink ramp after 1000 lx towards white.

/** Scale levels, lx. */
export const LEVELS = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000,
]);

/** Palette, one sRGB hex color per level. */
export const COLORS_HEX = Object.freeze([
  '#000000', // 0
  '#3d0040', // 1
  '#67003a', // 2
  '#7e0085', // 3
  '#873dff', // 4
  '#992e9e', // 5
  '#6f60ff', // 6
  '#0042ff', // 7
  '#3590ff', // 10
  '#72a9ff', // 15
  '#00ffff', // 20
  '#00c4a8', // 30
  '#15ffab', // 40
  '#00ff00', // 50
  '#73dc00', // 75
  '#53df77', // 100
  '#dfff53', // 150
  '#ffff00', // 200
  '#ffdd8a', // 300
  '#ffb41c', // 400
  '#ff8900', // 500
  '#ff0000', // 600
  '#ff5644', // 750
  '#ff9499', // 1000
  '#ffbabd', // 1250 — continues 750 → 1000 towards white
  '#ffdcdd', // 1500 — pinkish white
  '#ffffff', // 2000 and above — white
]);

/** Index of the color for value E: the largest k with LEVELS[k] ≤ E, clamped to 0…26. */
export function levelIndex(E) {
  if (!(E >= LEVELS[1])) return 0; // also negative and NaN → 0
  let lo = 1, hi = LEVELS.length - 1;
  if (E >= LEVELS[hi]) return hi;
  while (hi - lo > 1) { // invariant: LEVELS[lo] ≤ E < LEVELS[hi]
    const mid = (lo + hi) >> 1;
    if (LEVELS[mid] <= E) lo = mid; else hi = mid;
  }
  return lo;
}

/** Palette as sRGB triplets 0…1. */
export const COLORS = Object.freeze(COLORS_HEX.map((h) =>
  Object.freeze([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255))));

/** sRGB color (0…1) for value E. */
export const colorOf = (E) => COLORS[levelIndex(E)];
