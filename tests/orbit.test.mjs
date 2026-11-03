// Orbit camera tests: fixed pivot, no inertia, limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbit, rotate, zoom, zoomBy, pan, cameraPosition, direction, anglesOf } from '../js/orbit.js';

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
