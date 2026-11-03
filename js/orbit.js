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
