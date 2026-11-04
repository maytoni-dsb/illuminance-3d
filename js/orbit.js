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

/** Zooms by a factor (pinch): factor > 1 moves the camera closer. */
export function zoomBy(s, factor) {
  s.distance = clamp(s.distance / factor, s.minDistance, s.maxDistance);
}

/** Pans by a pointer drag of (dx, dy) CSS px: the image follows the pointer; the pivot stays. */
export function pan(s, dx, dy) {
  s.shiftX += dx;
  s.shiftY += dy;
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
// Orthographic plan view ("вид сверху"): the camera looks straight down, room +X to the right and
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
  const pxPerM = viewH / (2 * s.half);
  const o = createOrbit({ target, azimuth: 0, elevation: EL_MAX, distance, ...limits });
  o.shiftX = (target[0] - s.cx) * pxPerM;
  o.shiftY = (target[2] - s.cz) * pxPerM;
  return o;
}
