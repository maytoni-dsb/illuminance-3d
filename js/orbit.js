// Orbit camera state, 3ds Max-like: immediate response, no inertia.
// Pure module (no DOM, no Three.js). Works in Three.js coordinates (Y up).
//
// The camera always orbits a fixed pivot (the floor center of the room).
// Pan never moves the pivot: it shifts the image on screen (a lens shift,
// applied with PerspectiveCamera.setViewOffset), so the pivot keeps its place
// in the scene and rotation after a pan still turns the room about its floor center.

/** Elevation limit just short of straight up/down, to keep the camera's up vector defined. */
const EL_MAX = Math.PI / 2 - 1e-3;

/** Rotation speed: a drag over the full viewport height turns the view by one full turn. */
const ROTATE_PER_HEIGHT = 2 * Math.PI;

/** Zoom factor per wheel delta unit (deltaY = 100 per notch → ×1.16 per notch). */
const ZOOM_PER_DELTA = 0.0015;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * @param {{ target: number[], azimuth: number, elevation: number, distance: number,
 *           minDistance: number, maxDistance: number }} init
 *   azimuth — angle about +Y from +Z toward +X, rad; elevation — angle above the XZ plane, rad.
 * @returns {OrbitState} mutable state; shiftX/shiftY are the image shift in CSS pixels (right, down).
 */
export function createOrbit(init) {
  return {
    target: [...init.target],
    azimuth: init.azimuth,
    elevation: clamp(init.elevation, -EL_MAX, EL_MAX),
    distance: init.distance,
    minDistance: init.minDistance,
    maxDistance: init.maxDistance,
    shiftX: 0,
    shiftY: 0,
  };
}

/** Rotates by a pointer drag of (dx, dy) CSS px in a viewport of height viewH px. */
export function rotate(s, dx, dy, viewH) {
  const k = ROTATE_PER_HEIGHT / Math.max(1, viewH);
  s.azimuth -= dx * k;            // drag right → the room turns right
  s.elevation = clamp(s.elevation + dy * k, -EL_MAX, EL_MAX); // drag down → camera goes up
}

/** Zooms toward the pivot by a wheel delta (positive = away). */
export function zoom(s, deltaY) {
  s.distance = clamp(s.distance * Math.exp(deltaY * ZOOM_PER_DELTA), s.minDistance, s.maxDistance);
}

/**
 * The screen axes of the camera in Three.js coordinates and metres per CSS px at the pivot's depth.
 * @param {number} viewH — viewport height, CSS px; @param {number} fovDeg — vertical field of view
 */
function screenAxes(s, viewH, fovDeg) {
  const d = direction(s);
  const rl = Math.hypot(d[2], d[0]) || 1;
  const right = [d[2] / rl, 0, -d[0] / rl];
  const up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]];
  const m = (2 * s.distance * Math.tan((fovDeg * Math.PI) / 360)) / viewH;
  return { right, up, m };
}

/**
 * Zooms toward the pointer (24 Nov 2026, as in 3ds Max): the camera comes closer to the point under
 * the pointer at the pivot's depth, and the pivot moves with it, so that point stays where it is;
 * the lens is never shifted (no stretching at the edges of the view).
 * @param {number} px, py — pointer offset from the viewport centre, CSS px (right, down)
 */
export function zoomAt(s, deltaY, px, py, viewH, fovDeg) {
  const { right, up, m } = screenAxes(s, viewH, fovDeg);
  const P = s.target.map((t, i) => t + right[i] * (px - s.shiftX) * m - up[i] * (py - s.shiftY) * m);
  const d0 = s.distance;
  zoom(s, deltaY);
  const k = s.distance / d0;
  s.target = s.target.map((t, i) => P[i] + (t - P[i]) * k);
}

/** Zooms by a factor (pinch): factor > 1 moves the camera closer. */
export function zoomBy(s, factor) {
  s.distance = clamp(s.distance / factor, s.minDistance, s.maxDistance);
}

/** Pans by a pointer drag of (dx, dy) CSS px: the image follows the pointer, the pivot moves with it. */
export function pan(s, dx, dy, viewH, fovDeg) {
  const { right, up, m } = screenAxes(s, viewH, fovDeg);
  s.target = s.target.map((t, i) => t - right[i] * dx * m + up[i] * dy * m);
}

/** Unit vector from the pivot to the camera. */
export function direction(s) {
  const ce = Math.cos(s.elevation);
  return [ce * Math.sin(s.azimuth), Math.sin(s.elevation), ce * Math.cos(s.azimuth)];
}

/** Camera position in Three.js coordinates. */
export function cameraPosition(s) {
  const d = direction(s);
  return [s.target[0] + s.distance * d[0], s.target[1] + s.distance * d[1], s.target[2] + s.distance * d[2]];
}

/** Azimuth and elevation of a direction vector (inverse of `direction`). */
export function anglesOf(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return { azimuth: Math.atan2(v[0], v[2]), elevation: Math.asin(v[1] / len) };
}

// ---------------------------------------------------------------------------------------------
// Orthographic plan view ("top view"): the camera looks straight down, room +X to the right and
// room +Y up on screen (Three.js −Z up). State: centre of the view (cx, cz) and half the visible
// height `half`, all in Three.js metres. Pan and zoom work as in the orbit; the first rotation
// leaves the plan for the orbit, starting from straight above (planToOrbit).

/** Zoom limits of the plan relative to the fitted half-height. */
const PLAN_ZOOM_MIN = 0.02, PLAN_ZOOM_MAX = 20;

/**
 * Fits the floor rectangle (L × W, room metres) into the free part of the viewport.
 * @param {{L:number, W:number}} r
 * @param {number} viewW, viewH — viewport, CSS px
 * @param {{top?:number, bottom?:number, side?:number}} [insets] — px covered by overlays
 * @returns {{cx:number, cz:number, half:number, fitHalf:number}}
 */
export function fitPlan(r, viewW, viewH, insets = {}) {
  const top = insets.top ?? 0, bottom = insets.bottom ?? 0, side = insets.side ?? 0;
  const availW = Math.max(40, viewW - 2 * side), availH = Math.max(40, viewH - top - bottom);
  const px = Math.min(availW / r.L, availH / r.W);   // CSS px per metre
  const half = viewH / (2 * px);
  // the floor centre must appear at the centre of the free area, `off` px below the viewport centre
  const off = top + availH / 2 - viewH / 2;
  return { cx: r.L / 2, cz: -r.W / 2 - off / px, half, fitHalf: half };
}

/** Pans the plan by a pointer drag of (dx, dy) CSS px: the image follows the pointer. */
export function panPlan(s, dx, dy, viewH) {
  const k = 2 * s.half / Math.max(1, viewH); // metres per px
  s.cx -= dx * k;
  s.cz -= dy * k;                            // screen down is +Z in Three.js
}

/** Zooms the plan about its centre by a wheel delta (positive = away). */
export function zoomPlan(s, deltaY) {
  s.half = clamp(s.half * Math.exp(deltaY * ZOOM_PER_DELTA), PLAN_ZOOM_MIN * s.fitHalf, PLAN_ZOOM_MAX * s.fitHalf);
}

/**
 * Zooms the plan toward the pointer: the point under it stays in place.
 * @param {number} px, py — pointer offset from the viewport centre, CSS px (right, down)
 */
export function zoomPlanAt(s, deltaY, px, py, viewH) {
  const k0 = 2 * s.half / Math.max(1, viewH);   // metres per px before
  const wx = s.cx + px * k0, wz = s.cz + py * k0; // the point under the pointer (screen down = +Z)
  zoomPlan(s, deltaY);
  const k1 = 2 * s.half / Math.max(1, viewH);
  s.cx = wx - px * k1; s.cz = wz - py * k1;
}

/** Zooms the plan by a factor (pinch): factor > 1 enlarges the image. */
export function zoomPlanBy(s, factor) {
  s.half = clamp(s.half / factor, PLAN_ZOOM_MIN * s.fitHalf, PLAN_ZOOM_MAX * s.fitHalf);
}

/**
 * Orbit state that looks like the plan: from (almost) straight above, the same scale at the floor
 * and the same image position, so leaving the plan by a rotation does not make the image jump.
 * @param {{cx, cz, half}} s — plan
 * @param {number[]} target — orbit pivot (floor centre), Three.js
 * @param {number} vHalf — half of the vertical field of view of the perspective camera, rad
 * @param {number} viewH — viewport height, CSS px
 */
export function planToOrbit(s, target, vHalf, viewH, limits) {
  const distance = s.half / Math.tan(vHalf);
  // the pivot under the centre of the plan view, at the height of `target` (no lens shift)
  return createOrbit({ target: [s.cx, target[1], s.cz], azimuth: 0, elevation: EL_MAX, distance, ...limits });
}
