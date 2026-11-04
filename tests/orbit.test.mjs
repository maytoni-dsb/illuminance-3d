// Orbit camera tests: fixed pivot, no inertia, limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbit, rotate, zoom, zoomBy, pan, cameraPosition, direction, anglesOf } from '../js/orbit.js';
import { fitPlan, panPlan, zoomPlan, zoomPlanBy, planToOrbit } from '../js/orbit.js';

const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const make = () => createOrbit({ target: [3, 0, -2], azimuth: 0.5, elevation: 0.6, distance: 10, minDistance: 1, maxDistance: 100 });

test('camera stays at its distance from the pivot while rotating', () => {
  const s = make();
  for (let k = 0; k < 50; k++) {
    rotate(s, 37, -23, 700);
    assert.ok(near(dist(cameraPosition(s), s.target), 10, 1e-9));
  }
});

test('pan shifts the image only: pivot, angles and distance are unchanged', () => {
  const s = make();
  const before = { target: [...s.target], az: s.azimuth, el: s.elevation, d: s.distance, pos: cameraPosition(s) };
  pan(s, 120, -45);
  pan(s, -20, 5);
  assert.deepEqual(s.target, before.target);
  assert.equal(s.azimuth, before.az);
  assert.equal(s.elevation, before.el);
  assert.equal(s.distance, before.d);
  assert.deepEqual(cameraPosition(s), before.pos);
  assert.equal(s.shiftX, 100);
  assert.equal(s.shiftY, -40);
  // rotation after a pan is still about the same pivot
  rotate(s, 200, 0, 700);
  assert.deepEqual(s.target, before.target);
});

test('no inertia: state changes only on input, by exactly the input', () => {
  const s = make();
  rotate(s, 70, 0, 700);
  const a = s.azimuth;
  rotate(s, 0, 0, 700);
  assert.equal(s.azimuth, a);
  assert.ok(near(a, 0.5 - 70 * 2 * Math.PI / 700));
  rotate(s, -70, 0, 700);
  assert.ok(near(s.azimuth, 0.5)); // the same drag back returns exactly
});

test('elevation is clamped short of the poles, view from below is allowed', () => {
  const s = make();
  rotate(s, 0, 10000, 700);
  assert.ok(s.elevation < Math.PI / 2 && s.elevation > 1.5);
  rotate(s, 0, -20000, 700);
  assert.ok(s.elevation > -Math.PI / 2 && s.elevation < -1.5);
  assert.ok(cameraPosition(s)[1] < s.target[1]); // camera below the floor
});

test('zoom keeps the pivot and respects limits', () => {
  const s = make();
  zoom(s, 100);
  assert.ok(s.distance > 10);
  zoom(s, -100);
  assert.ok(near(s.distance, 10, 1e-9));
  zoom(s, 1e6);
  assert.equal(s.distance, 100);
  zoomBy(s, 1e6);
  assert.equal(s.distance, 1);
  assert.deepEqual(s.target, [3, 0, -2]);
});

test('anglesOf inverts direction', () => {
  const s = make();
  const { azimuth, elevation } = anglesOf(direction(s).map((x) => 7 * x));
  assert.ok(near(azimuth, 0.5) && near(elevation, 0.6));
});

// ---------------------------------------------------------------------------------------------
// Plan view (orthographic, from above)

test('fitPlan: the floor fits the free area and its centre is the centre of that area', () => {
  const vw = 800, vh = 600, ins = { top: 56, bottom: 100, side: 24 };
  for (const r of [{ L: 6, W: 4 }, { L: 4, W: 10 }, { L: 50, W: 1 }]) {
    const s = fitPlan(r, vw, vh, ins);
    const px = vh / (2 * s.half);                         // px per metre
    const availW = vw - 48, availH = vh - 156;
    assert.ok(r.L * px <= availW + 1e-9 && r.W * px <= availH + 1e-9);
    assert.ok(Math.abs(r.L * px - availW) < 1e-9 || Math.abs(r.W * px - availH) < 1e-9); // touches one side
    // floor centre (L/2, −W/2 in Three.js) on screen, px from the top-left corner
    const sx = vw / 2 + (r.L / 2 - s.cx) * px, sy = vh / 2 + (-r.W / 2 - s.cz) * px;
    assert.ok(Math.abs(sx - vw / 2) < 1e-9);
    assert.ok(Math.abs(sy - (56 + availH / 2)) < 1e-9);
    assert.equal(s.fitHalf, s.half);
  }
});

test('panPlan: the image follows the pointer; zoomPlan keeps the centre and is limited', () => {
  const s = fitPlan({ L: 6, W: 4 }, 800, 600);
  const px = 600 / (2 * s.half);
  const cx = s.cx, cz = s.cz;
  panPlan(s, 30, -20, 600);                              // drag right and up
  assert.ok(Math.abs(s.cx - (cx - 30 / px)) < 1e-12);    // the view centre moves left: content right
  assert.ok(Math.abs(s.cz - (cz + 20 / px)) < 1e-12);    // screen up is −Z: content moves up
  const h = s.half;
  zoomPlan(s, -100);
  assert.ok(s.half < h && s.cx === cx - 30 / px);
  zoomPlanBy(s, 2);
  for (let i = 0; i < 200; i++) zoomPlan(s, -100);
  assert.ok(Math.abs(s.half - 0.02 * s.fitHalf) < 1e-12);
  for (let i = 0; i < 400; i++) zoomPlan(s, 100);
  assert.ok(Math.abs(s.half - 20 * s.fitHalf) < 1e-9);
});

test('planToOrbit: from straight above, room +Y up on screen, same floor scale and position', () => {
  const s = fitPlan({ L: 6, W: 4 }, 800, 600, { top: 56, bottom: 100 });
  panPlan(s, 40, 25, 600);
  const target = [3, 0, -2], vHalf = 20 * Math.PI / 180;
  const o = planToOrbit(s, target, vHalf, 600, { minDistance: 0.1, maxDistance: 1000 });
  const d = direction(o);
  assert.ok(d[1] > 0.999);                                // looking down
  assert.ok(Math.abs(d[0]) < 1e-12 && d[2] > 0);          // camera slightly toward +Z: screen up is −Z (room +Y)
  // the pivot (floor centre) sits where the plan shows it, at the same px per metre
  const px = 600 / (2 * s.half);
  assert.ok(Math.abs(600 / (2 * o.distance * Math.tan(vHalf)) - px) < 1e-9);
  assert.ok(Math.abs(o.shiftX - (target[0] - s.cx) * px) < 1e-9);
  assert.ok(Math.abs(o.shiftY - (target[2] - s.cz) * px) < 1e-9);
});

test('zoom toward the pointer keeps the point under it (image scale about the pivot)', async () => {
  const { createOrbit, zoomAt, fitPlan, zoomPlanAt } = await import('../js/orbit.js');
  const o = createOrbit({ target: [0, 0, 0], azimuth: 0, elevation: 0.5, distance: 10, minDistance: 0.1, maxDistance: 100 });
  o.shiftX = 30; o.shiftY = -20;
  // a point at screen offset (px, py) from the centre lies (px − shift) from the pivot's image;
  // after zooming by k it must lie k(px − shift) from the new pivot image, at the same place
  const px = 120, py = 80;
  const before = [px - o.shiftX, py - o.shiftY];
  zoomAt(o, -300, px, py);
  const k = 10 / o.distance;
  assert.ok(k > 1);
  assert.ok(Math.abs(o.shiftX + k * before[0] - px) < 1e-9 && Math.abs(o.shiftY + k * before[1] - py) < 1e-9);
  // the plan: the world point under the pointer stays
  const s = fitPlan({ L: 6, W: 4 }, 800, 600);
  const world = (q) => [q.cx + 100 * 2 * q.half / 600, q.cz + -50 * 2 * q.half / 600];
  const w0 = world(s);
  zoomPlanAt(s, -400, 100, -50, 600);
  const w1 = world(s);
  assert.ok(Math.abs(w0[0] - w1[0]) < 1e-12 && Math.abs(w0[1] - w1[1]) < 1e-12);
});
